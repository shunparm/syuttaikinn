import { z } from "zod";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

// 実働時間計算（昼休憩60分を差し引く）
function calcWorkingMinutes(clockInStr: string, clockOut: Date): number {
  const clockIn = new Date(clockInStr);
  const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  return Math.max(0, totalMinutes - 60);
}

const iso = (d: Date) => d.toISOString();

export const attendanceRouter = router({
  clockIn: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      siteId: z.number(),
      companionEmployeeIds: z.array(z.number()).optional().default([]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(attendanceRecords).where(
        and(eq(attendanceRecords.employeeId, input.employeeId), eq(attendanceRecords.status, "active"), isNull(attendanceRecords.clockOutTime))
      ).limit(1);
      if (existing.length > 0) throw new Error("既に出勤中です");
      const now = iso(new Date());
      await db.insert(attendanceRecords).values({
        employeeId: input.employeeId,
        siteId: input.siteId,
        clockInTime: now,
        companionEmployeeIds: input.companionEmployeeIds.length > 0 ? JSON.stringify(input.companionEmployeeIds) : null,
        status: "active",
      });
      const rows = await db.select().from(attendanceRecords).where(
        and(eq(attendanceRecords.employeeId, input.employeeId), isNull(attendanceRecords.clockOutTime), eq(attendanceRecords.status, "active"))
      ).orderBy(attendanceRecords.clockInTime).limit(1);
      return rows[0];
    }),

  clockOut: publicProcedure
    .input(z.object({
      attendanceRecordId: z.number(),
      workReport: z.string().optional(),
      companionEmployeeIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, input.attendanceRecordId)).limit(1);
      if (rows.length === 0) throw new Error("記録が見つかりません");
      const record = rows[0];
      const nowDate = new Date();
      const workingMinutes = calcWorkingMinutes(record.clockInTime, nowDate);
      const companionJson = input.companionEmployeeIds && input.companionEmployeeIds.length > 0
        ? JSON.stringify(input.companionEmployeeIds)
        : record.companionEmployeeIds ?? null;
      await db.update(attendanceRecords).set({
        clockOutTime: iso(nowDate),
        workReport: input.workReport ?? null,
        workingMinutes,
        companionEmployeeIds: companionJson,
        updatedAt: iso(nowDate),
      }).where(eq(attendanceRecords.id, input.attendanceRecordId));
      const updated = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, input.attendanceRecordId)).limit(1);
      return updated[0];
    }),

  getActiveWorkers: publicProcedure.query(async () => {
    const db = getDb();
    return db.select({
      id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime,
      companionEmployeeIds: attendanceRecords.companionEmployeeIds,
      employeeId: employeeMaster.id, employeeCode: employeeMaster.employeeId, employeeName: employeeMaster.name,
      siteId: siteMaster.id, siteCode: siteMaster.siteId, siteName: siteMaster.siteName, location: siteMaster.location,
    }).from(attendanceRecords)
      .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
      .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
      .where(and(eq(attendanceRecords.status, "active"), isNull(attendanceRecords.clockOutTime)))
      .orderBy(attendanceRecords.clockInTime);
  }),

  getTodayAttendance: publicProcedure.query(async () => {
    const db = getDb();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return db.select({
      id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
      workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes,
      companionEmployeeIds: attendanceRecords.companionEmployeeIds, status: attendanceRecords.status,
      employeeId: employeeMaster.id, employeeCode: employeeMaster.employeeId, employeeName: employeeMaster.name,
      siteId: siteMaster.id, siteCode: siteMaster.siteId, siteName: siteMaster.siteName,
    }).from(attendanceRecords)
      .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
      .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
      .where(and(eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(today)), lte(attendanceRecords.clockInTime, iso(tomorrow))))
      .orderBy(attendanceRecords.clockInTime);
  }),

  getAttendanceRecords: publicProcedure
    .input(z.object({
      startDate: z.date().optional(), endDate: z.date().optional(),
      employeeId: z.number().optional(), siteId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const conditions: any[] = [eq(attendanceRecords.status, "active")];
      if (input.startDate) { const s = new Date(input.startDate); s.setHours(0,0,0,0); conditions.push(gte(attendanceRecords.clockInTime, iso(s))); }
      if (input.endDate) { const e = new Date(input.endDate); e.setHours(23,59,59,999); conditions.push(lte(attendanceRecords.clockInTime, iso(e))); }
      if (input.employeeId) conditions.push(eq(attendanceRecords.employeeId, input.employeeId));
      if (input.siteId) conditions.push(eq(attendanceRecords.siteId, input.siteId));
      return db.select({
        id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
        workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes,
        companionEmployeeIds: attendanceRecords.companionEmployeeIds, status: attendanceRecords.status,
        employeeId: employeeMaster.id, employeeCode: employeeMaster.employeeId, employeeName: employeeMaster.name,
        siteId: siteMaster.id, siteCode: siteMaster.siteId, siteName: siteMaster.siteName, location: siteMaster.location,
      }).from(attendanceRecords)
        .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .where(and(...conditions))
        .orderBy(attendanceRecords.clockInTime);
    }),

  deleteRecord: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(attendanceRecords)
        .set({ status: "deleted", updatedAt: new Date().toISOString() })
        .where(eq(attendanceRecords.id, input.id));
      return { success: true };
    }),

  getDashboardStats: publicProcedure.query(async () => {
    const db = getDb();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const [activeRows, todayRows, empRows, siteRows] = await Promise.all([
      db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.status, "active"), isNull(attendanceRecords.clockOutTime))),
      db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(today)), lte(attendanceRecords.clockInTime, iso(tomorrow)))),
      db.select({ id: employeeMaster.id }).from(employeeMaster).where(eq(employeeMaster.status, "active")),
      db.select({ id: siteMaster.id }).from(siteMaster).where(eq(siteMaster.status, "active")),
    ]);
    return { activeWorkers: activeRows.length, todayAttendance: todayRows.length, totalEmployees: empRows.length, totalSites: siteRows.length };
  }),
});
