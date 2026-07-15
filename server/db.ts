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
      ALTER TABLE employee_master ADD CONSTRAINT employee_master_role_check CHECK(role IN ('worker', 'staff', 'admin', 'owner', '応援'));
      ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS "nameKana" TEXT;
      ALTER TABLE employee_master DROP COLUMN IF EXISTS pin;
      ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
      ALTER TABLE correction_requests ADD COLUMN IF NOT EXISTS "approvedByName" TEXT;
      ALTER TABLE correction_requests DROP CONSTRAINT IF EXISTS correction_requests_approvedBy_fkey;
      ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS "approvedByName" TEXT;
      ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_approvedBy_fkey;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('user', 'admin', 'staff', 'owner'));
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
      CREATE TABLE IF NOT EXISTS notification_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        clock_in_time TEXT NOT NULL DEFAULT '08:00',
        clock_out_time TEXT NOT NULL DEFAULT '17:00'
      );
      INSERT INTO notification_config (id, clock_in_time, clock_out_time)
      VALUES (1, '08:00', '17:00')
      ON CONFLICT (id) DO NOTHING;
      ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS "hourlyWage" INTEGER NOT NULL DEFAULT 1000;
      CREATE TABLE IF NOT EXISTS kyuyo_records (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL REFERENCES employee_master(id),
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        "basePay" INTEGER NOT NULL DEFAULT 0,
        "overtimePay" INTEGER NOT NULL DEFAULT 0,
        "lateNightPay" INTEGER NOT NULL DEFAULT 0,
        deductions INTEGER NOT NULL DEFAULT 0,
        "totalPay" INTEGER NOT NULL DEFAULT 0,
        details TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS nissho_records (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL REFERENCES employee_master(id),
        date TEXT NOT NULL,
        content TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL REFERENCES employee_master(id),
        "leaveType" TEXT NOT NULL CHECK("leaveType" IN ('paid_leave', 'substitute_holiday', 'special_leave', 'holiday_request')),
        "requestDate" TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        "approvedBy" INTEGER REFERENCES employee_master(id),
        "approvedAt" TEXT,
        note TEXT,
        "createdAt" TEXT NOT NULL DEFAULT now()::text,
        "updatedAt" TEXT NOT NULL DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        report_date TEXT NOT NULL,
        site_id INTEGER NOT NULL REFERENCES site_master(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT now()::text,
        updated_at TEXT NOT NULL DEFAULT now()::text,
        UNIQUE(report_date, site_id)
      );
      CREATE TABLE IF NOT EXISTS daily_report_assignments (
        id SERIAL PRIMARY KEY,
        daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employee_master(id),
        start_time TEXT,
        end_time TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT now()::text,
        UNIQUE(daily_report_id, employee_id)
      );
      CREATE TABLE IF NOT EXISTS system_files (
        key TEXT PRIMARY KEY,
        data BYTEA NOT NULL,
        updated_at TEXT NOT NULL DEFAULT now()::text
      );
    `);

    // 給与IDを一元化したため不要になったカラムを削除
    try { await client.query(`ALTER TABLE employee_master DROP COLUMN IF EXISTS "payrollId"`); } catch {}
    try { await client.query(`ALTER TABLE site_master DROP COLUMN IF EXISTS "payrollCode"`); } catch {}

    // new_record型対応マイグレーション（個別実行で確実に適用）
    try {
      await client.query(`ALTER TABLE correction_requests ALTER COLUMN "attendanceRecordId" DROP NOT NULL`);
    } catch (e: any) { console.log('initDb DROP NOT NULL (skip):', e.message); }
    try {
      // 制約名の大文字小文字に関わらず全て削除して再作成
      await client.query(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'correction_requests'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%correctionType%'
          LOOP
            EXECUTE 'ALTER TABLE correction_requests DROP CONSTRAINT IF EXISTS "' || r.conname || '"';
          END LOOP;
        END $$
      `);
      await client.query(`
        ALTER TABLE correction_requests ADD CONSTRAINT correction_requests_correctiontype_check
        CHECK("correctionType" IN ('time_correction', 'cancel', 'site_change', 'other', 'new_record'))
      `);
    } catch (e: any) { console.log('initDb CHECK constraint (skip):', e.message); }

    // 給与計算v3対応マイグレーション: employee_masterへの控除マスタカラム追加
    const empAlters = [
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT '日給'`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS monthly_salary INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS daily_wage INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS health_insurance INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS pension INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS employment_insurance_rate REAL DEFAULT 0.006`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS income_tax INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS resident_tax INTEGER DEFAULT 0`,
      `ALTER TABLE employee_master ADD COLUMN IF NOT EXISTS welfare_fee INTEGER DEFAULT 0`,
    ];
    // 所定勤務時間カラム（初回追加時のみ、現行の勤務形態で初期値をシード。
    // 以降の変更は作業員管理画面から行うため、二度と上書きしない）
    try {
      const colCheck = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'employee_master' AND column_name = 'standard_work_minutes'
      `);
      if (colCheck.rows.length === 0) {
        await client.query(`ALTER TABLE employee_master ADD COLUMN standard_work_minutes INTEGER DEFAULT 480`);
        await client.query(`UPDATE employee_master SET standard_work_minutes = 300 WHERE name IN ('菊川裕美', '濱津紀子')`);
        await client.query(`UPDATE employee_master SET standard_work_minutes = 420 WHERE name IN ('山田ゆかり', '畑野浩次')`);
        console.log('initDb: standard_work_minutes カラムを追加し初期値をシードしました');
      }
    } catch (e: any) { console.log('initDb standard_work_minutes (skip):', e.message); }

    for (const sql of empAlters) {
      try { await client.query(sql); } catch (e: any) { console.log('initDb emp alter (skip):', e.message); }
    }

    // 給与計算v3対応マイグレーション: attendance_recordsへの勤怠区分カラム追加
    const attAlters = [
      `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS attendance_type TEXT DEFAULT '○'`,
      `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS overtime_hours REAL DEFAULT 0`,
      `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS manual_allowance INTEGER DEFAULT 0`,
      `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS replacement_cost INTEGER DEFAULT 0`,
    ];
    for (const sql of attAlters) {
      try { await client.query(sql); } catch (e: any) { console.log('initDb att alter (skip):', e.message); }
    }

    // 給与計算v3対応マイグレーション: kyuyo_recordsテーブルを新スキーマに再作成
    // 既存テーブルに新カラムを追加（既存データ保持）
    const kyuyoAlters = [
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employee_master(id)`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS employment_type TEXT`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS basic_pay INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS overtime_pay INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS manual_allowance INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS gross_pay INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS health_insurance INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS pension INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS employment_insurance INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS income_tax INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS resident_tax INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS welfare_fee INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS replacement_cost INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS net_pay INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT now()::text`,
      `ALTER TABLE kyuyo_records ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT now()::text`,
    ];
    for (const sql of kyuyoAlters) {
      try { await client.query(sql); } catch (e: any) { console.log('initDb kyuyo alter (skip):', e.message); }
    }
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
