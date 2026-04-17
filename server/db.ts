import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    _db = drizzle(pool);
  }
  return _db;
}

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        "openId" TEXT NOT NULL UNIQUE,
        name TEXT,
        email TEXT,
        "loginMethod" TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'staff')),
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text,
        "lastSignedIn" TEXT NOT NULL DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS employee_master (
        id SERIAL PRIMARY KEY,
        "employeeId" TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pin TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'worker';
      ALTER TABLE employee_master DROP CONSTRAINT IF EXISTS employee_master_role_check;
      ALTER TABLE employee_master ADD CONSTRAINT employee_master_role_check CHECK(role IN ('worker', 'staff', 'admin', '応援'));
      ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS "nameKana" TEXT;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('user', 'admin', 'staff'));
      CREATE TABLE IF NOT EXISTS site_master (
        id SERIAL PRIMARY KEY,
        "siteId" TEXT NOT NULL UNIQUE,
        "siteName" TEXT NOT NULL,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL REFERENCES employee_master(id),
        "siteId" INTEGER NOT NULL REFERENCES site_master(id),
        "clockInTime" TEXT NOT NULL,
        "clockOutTime" TEXT,
        "companionEmployeeIds" TEXT,
        "workReport" TEXT,
        "workingMinutes" INTEGER,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deleted')),
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "isCorrected" BOOLEAN NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS correction_requests (
        id SERIAL PRIMARY KEY,
        "attendanceRecordId" INTEGER NOT NULL REFERENCES attendance_records(id),
        "employeeId" INTEGER NOT NULL REFERENCES employee_master(id),
        reason TEXT NOT NULL,
        "correctionType" TEXT NOT NULL CHECK("correctionType" IN ('time_correction', 'cancel', 'site_change', 'other')),
        "newClockInTime" TEXT,
        "newClockOutTime" TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        "approvedBy" INTEGER REFERENCES employee_master(id),
        "approvedAt" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      ALTER TABLE correction_requests ADD COLUMN IF NOT EXISTS "newClockInTime" TEXT;
      ALTER TABLE correction_requests ADD COLUMN IF NOT EXISTS "newClockOutTime" TEXT;
      ALTER TABLE correction_requests ADD COLUMN IF NOT EXISTS "newSiteId" INTEGER REFERENCES site_master(id);
      ALTER TABLE correction_requests ALTER COLUMN "newClockInTime" DROP NOT NULL;
      ALTER TABLE correction_requests ALTER COLUMN "newClockOutTime" DROP NOT NULL;
      ALTER TABLE correction_requests ALTER COLUMN "newSiteId" DROP NOT NULL;
      ALTER TABLE correction_requests DROP CONSTRAINT IF EXISTS correction_requests_correctiontype_check;
      ALTER TABLE correction_requests ADD CONSTRAINT correction_requests_correctiontype_check CHECK("correctionType" IN ('time_correction', 'cancel', 'site_change', 'other'));
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        "userId" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text
      );
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='correction_requests'
          AND column_name='newClockInTime'
        ) THEN
          ALTER TABLE correction_requests ADD COLUMN "newClockInTime" TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='correction_requests'
          AND column_name='newClockOutTime'
        ) THEN
          ALTER TABLE correction_requests ADD COLUMN "newClockOutTime" TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='correction_requests'
          AND column_name='newSiteId'
        ) THEN
          ALTER TABLE correction_requests ADD COLUMN "newSiteId" INTEGER REFERENCES site_master(id);
        END IF;
      END $$;
    `);
  } finally {
    client.release();
  }
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
