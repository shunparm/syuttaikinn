import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { InsertUser, users } from "../drizzle/schema";
import fs from "fs";
import path from "path";

const DB_PATH = "./data/attendance.db";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const client = createClient({ url: `file:${DB_PATH}` });
    _db = drizzle(client);
    // Initialize schema async — callers must await initDb() on startup
  }
  return _db;
}

export async function initDb() {
  const db = getDb();
  const client = (db as any).$client as ReturnType<typeof createClient>;
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      loginMethod TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastSignedIn TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS employee_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeId TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pin TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS site_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      siteId TEXT NOT NULL UNIQUE,
      siteName TEXT NOT NULL,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeId INTEGER NOT NULL REFERENCES employee_master(id),
      siteId INTEGER NOT NULL REFERENCES site_master(id),
      clockInTime TEXT NOT NULL,
      clockOutTime TEXT,
      companionEmployeeIds TEXT,
      workReport TEXT,
      workingMinutes INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deleted')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS correction_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceRecordId INTEGER NOT NULL REFERENCES attendance_records(id),
      employeeId INTEGER NOT NULL REFERENCES employee_master(id),
      reason TEXT NOT NULL,
      correctionType TEXT NOT NULL CHECK(correctionType IN ('time_correction', 'cancel', 'site_change', 'other')),
      newClockInTime TEXT,
      newClockOutTime TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      approvedBy INTEGER REFERENCES employee_master(id),
      approvedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? "user",
      lastSignedIn: now,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const updateSet: Record<string, unknown> = { updatedAt: now };
    if (user.name !== undefined) updateSet.name = user.name;
    if (user.email !== undefined) updateSet.email = user.email;
    if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod;
    if (user.role !== undefined) updateSet.role = user.role;
    updateSet.lastSignedIn = user.lastSignedIn ?? now;
    await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
