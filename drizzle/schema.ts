import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: text("createdAt").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updatedAt").default(sql`(datetime('now'))`).notNull(),
  lastSignedIn: text("lastSignedIn").default(sql`(datetime('now'))`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 作業員マスタ ───────────────────────────────────────────────────────────
export const employeeMaster = sqliteTable("employee_master", {
  id: int("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employeeId").notNull().unique(),
  name: text("name").notNull(),
  pin: text("pin"), // 4〜6桁のPIN番号（未設定はnull）
  status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
  createdAt: text("createdAt").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updatedAt").default(sql`(datetime('now'))`).notNull(),
});

export type Employee = typeof employeeMaster.$inferSelect;
export type InsertEmployee = typeof employeeMaster.$inferInsert;

// ─── 工事現場マスタ ──────────────────────────────────────────────────────────
export const siteMaster = sqliteTable("site_master", {
  id: int("id").primaryKey({ autoIncrement: true }),
  siteId: text("siteId").notNull().unique(),
  siteName: text("siteName").notNull(),
  location: text("location"),
  status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
  createdAt: text("createdAt").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updatedAt").default(sql`(datetime('now'))`).notNull(),
});

export type Site = typeof siteMaster.$inferSelect;
export type InsertSite = typeof siteMaster.$inferInsert;

// ─── 出退勤記録 ──────────────────────────────────────────────────────────────
export const attendanceRecords = sqliteTable("attendance_records", {
  id: int("id").primaryKey({ autoIncrement: true }),
  employeeId: int("employeeId").notNull().references(() => employeeMaster.id),
  siteId: int("siteId").notNull().references(() => siteMaster.id),
  clockInTime: text("clockInTime").notNull(),
  clockOutTime: text("clockOutTime"),
  companionEmployeeIds: text("companionEmployeeIds"), // JSON配列文字列
  workReport: text("workReport"),
  workingMinutes: int("workingMinutes"),
  status: text("status", { enum: ["active", "deleted"] }).default("active").notNull(),
  createdAt: text("createdAt").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updatedAt").default(sql`(datetime('now'))`).notNull(),
});

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecords.$inferInsert;

// ─── 訂正申請 ────────────────────────────────────────────────────────────────
export const correctionRequests = sqliteTable("correction_requests", {
  id: int("id").primaryKey({ autoIncrement: true }),
  attendanceRecordId: int("attendanceRecordId").notNull().references(() => attendanceRecords.id),
  employeeId: int("employeeId").notNull().references(() => employeeMaster.id),
  reason: text("reason").notNull(),
  correctionType: text("correctionType", { enum: ["time_correction", "cancel", "site_change", "other"] }).notNull(),
  newClockInTime: text("newClockInTime"),
  newClockOutTime: text("newClockOutTime"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  approvedBy: int("approvedBy").references(() => employeeMaster.id),
  approvedAt: text("approvedAt"),
  createdAt: text("createdAt").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updatedAt").default(sql`(datetime('now'))`).notNull(),
});

export type CorrectionRequest = typeof correctionRequests.$inferSelect;
export type InsertCorrectionRequest = typeof correctionRequests.$inferInsert;
