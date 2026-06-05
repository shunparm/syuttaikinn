import { pgTable, serial, text, integer, boolean, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(), // 'user' | 'admin' | 'staff'
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
  nameKana: text("nameKana"),
  passwordHash: text("passwordHash"),
  role: text("role").default("worker").notNull(), // 'worker' | 'staff' | 'admin'
  status: text("status").default("active").notNull(), // 'active' | 'inactive'
  isActive: boolean("is_active").default(true),
  // 雇用区分: '月給' | '日給' | '時給' | '実習生'
  employmentType: text("employment_type").default("日給"),
  // 給与単価
  monthlySalary: integer("monthly_salary").default(0),
  dailyWage: integer("daily_wage").default(0),
  hourlyWage: integer("hourlyWage").default(1000), // 既存カラム名を維持
  // 控除マスタ（固定月額）
  healthInsurance: integer("health_insurance").default(0),
  pension: integer("pension").default(0),
  employmentInsuranceRate: real("employment_insurance_rate").default(0.006),
  incomeTax: integer("income_tax").default(0),
  residentTax: integer("resident_tax").default(0),
  welfareFee: integer("welfare_fee").default(0),
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
  isCorrected: boolean("isCorrected").default(false).notNull(),
  // 勤怠区分: '○' | '△' | '出' | '有給' | '欠勤'
  attendanceType: text("attendance_type").default("○"),
  // 残業時間（時間単位）
  overtimeHours: real("overtime_hours").default(0),
  // 手当・控除（手動入力、J列相当）
  manualAllowance: integer("manual_allowance").default(0),
  // 立替金
  replacementCost: integer("replacement_cost").default(0),
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecords.$inferInsert;

// ─── 訂正申請 ────────────────────────────────────────────────────────────────
export const correctionRequests = pgTable("correction_requests", {
  id: serial("id").primaryKey(),
  attendanceRecordId: integer("attendanceRecordId").references(() => attendanceRecords.id),
  employeeId: integer("employeeId").notNull().references(() => employeeMaster.id),
  reason: text("reason").notNull(),
  correctionType: text("correctionType").notNull(), // 'time_correction' | 'cancel' | 'site_change' | 'other' | 'new_record'
  newClockInTime: text("newClockInTime"),
  newClockOutTime: text("newClockOutTime"),
  newSiteId: integer("newSiteId").references(() => siteMaster.id),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  approvedBy: integer("approvedBy"),
  approvedByName: text("approvedByName"),
  approvedAt: text("approvedAt"),
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type CorrectionRequest = typeof correctionRequests.$inferSelect;
export type InsertCorrectionRequest = typeof correctionRequests.$inferInsert;

// ─── 休暇申請 ────────────────────────────────────────────────────────────────
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employeeMaster.id),
  leaveType: text("leaveType").notNull(), // 'paid_leave' | 'substitute_holiday' | 'special_leave' | 'holiday_request'
  requestDate: text("requestDate").notNull(), // YYYY-MM-DD (JST)
  reason: text("reason"),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  approvedBy: integer("approvedBy"),
  approvedByName: text("approvedByName"),
  approvedAt: text("approvedAt"),
  note: text("note"),
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

// ─── 給与計算記録 ─────────────────────────────────────────────────
export const kyuyoRecords = pgTable("kyuyo_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeeMaster.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  employmentType: text("employment_type"),
  basicPay: integer("basic_pay").notNull().default(0),
  overtimePay: integer("overtime_pay").notNull().default(0),
  manualAllowance: integer("manual_allowance").notNull().default(0),
  grossPay: integer("gross_pay").notNull().default(0),
  healthInsurance: integer("health_insurance").notNull().default(0),
  pension: integer("pension").notNull().default(0),
  employmentInsurance: integer("employment_insurance").notNull().default(0),
  incomeTax: integer("income_tax").notNull().default(0),
  residentTax: integer("resident_tax").notNull().default(0),
  welfareFee: integer("welfare_fee").notNull().default(0),
  replacementCost: integer("replacement_cost").notNull().default(0),
  netPay: integer("net_pay").notNull().default(0),
  createdAt: text("created_at").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updated_at").default(sql`(now()::text)`).notNull(),
});

export type KyuyoRecord = typeof kyuyoRecords.$inferSelect;
export type InsertKyuyoRecord = typeof kyuyoRecords.$inferInsert;

// ─── 日報記録 ────────────────────────────────────────────────────
export const nisshoRecords = pgTable("nissho_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employeeMaster.id),
  date: text("date").notNull(), // YYYY-MM-DD JST
  content: text("content").notNull(),
  createdAt: text("createdAt").default(sql`(now()::text)`).notNull(),
  updatedAt: text("updatedAt").default(sql`(now()::text)`).notNull(),
});

export type NisshoRecord = typeof nisshoRecords.$inferSelect;
export type InsertNisshoRecord = typeof nisshoRecords.$inferInsert;
