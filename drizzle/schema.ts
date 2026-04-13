import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(), // 'user' | 'admin'
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
  lastSignedIn: text("lastSignedIn").default(sql`(now()::text)`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 作業員マスタ ───────────────────────────────────────────────────────────
export const employeeMaster = pgTable("employee_master", {
  id: serial("id").primaryKey(),
  employeeId: text("employeeId").notNull().unique(),
  name: text("name").notNull(),
  pin: text("pin"),
  status: text("status").default("active").notNull(), // 'active' | 'inactive'
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type Employee = typeof employeeMaster.$inferSelect;
export type InsertEmployee = typeof employeeMaster.$inferInsert;

// ─── 工事現場マスタ ──────────────────────────────────────────────────────────
export const siteMaster = pgTable("site_master", {
  id: serial("id").primaryKey(),
  siteId: text("siteId").notNull().unique(),
  siteName: text("siteName").notNull(),
  location: text("location"),
  status: text("status").default("active").notNull(), // 'active' | 'inactive'
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type Site = typeof siteMaster.$inferSelect;
export type InsertSite = typeof siteMaster.$inferInsert;

// ─── 出退勤記録 ──────────────────────────────────────────────────────────────
export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employeeMaster.id),
  siteId: integer("siteId").notNull().references(() => siteMaster.id),
  clockInTime: text("clockInTime").notNull(),
  clockOutTime: text("clockOutTime"),
  companionEmployeeIds: text("companionEmployeeIds"),
  workReport: text("workReport"),
  workingMinutes: integer("workingMinutes"),
  status: text("status").default("active").notNull(), // 'active' | 'deleted'
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecords.$inferInsert;

// ─── 訂正申請 ────────────────────────────────────────────────────────────────
export const correctionRequests = pgTable("correction_requests", {
  id: serial("id").primaryKey(),
  attendanceRecordId: integer("attendanceRecordId").notNull().references(() => attendanceRecords.id),
  employeeId: integer("employeeId").notNull().references(() => employeeMaster.id),
  reason: text("reason").notNull(),
  correctionType: text("correctionType").notNull(), // 'time_correction' | 'cancel' | 'site_change' | 'other'
  newClockInTime: text("newClockInTime"),
  newClockOutTime: text("newClockOutTime"),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  approvedBy: integer("approvedBy").references(() => employeeMaster.id),
  approvedAt: text("approvedAt"),
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type CorrectionRequest = typeof correctionRequests.$inferSelect;
export type InsertCorrectionRequest = typeof correctionRequests.$inferInsert;
