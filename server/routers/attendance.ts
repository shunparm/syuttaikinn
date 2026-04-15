import { z } from "zod";
import { eq, and, gte, lte, isNull, desc } from "drizzle-orm";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

// 実働時間計算（12:00〜13:00 JST の重複分を差し引く、UTC環境対応）
// breakStart/breakEnd は JST 当日の 12:00/13:00 を UTC で表現
const JST_OFFSET = 9 * 60 * 60 * 1000;
function jstBreakRange(clockIn: Date): { breakStart: Date; breakEnd: Date } {
  const jst = new Date(clockIn.getTime() + JST_OFFSET);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();
  return {
    breakStart: new Date(Date.UTC(y, mo, d, 3, 0, 0)),  // UTC 03:00 = JST 12:00
    breakEnd:   new Date(Date.UTC(y, mo, d, 4, 0, 0)),  // UTC 04:00 = JST 13:00
  };
}
function calcWorkingMinutes(clockInStr: string, clockOut: Date): number {
  const clockIn = new Date(clockInStr);
  const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const { breakStart, breakEnd } = jstBreakRange(clockIn);
  const overlapMs  = Math.max(0, Math.min(clockOut.getTime(), breakEnd.getTime()) - Math.max(clockIn.getTime(), breakStart.getTime()));
  return Math.max(0, totalMinutes - Math.floor(overlapMs / 60000));
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
    const nowJST2 = new Date(Date.now() + 9 * 3600000);
    const today    = new Date(Date.UTC(nowJST2.getUTCFullYear(), nowJST2.getUTCMonth(), nowJST2.getUTCDate()) - 9 * 3600000);
    const tomorrow = new Date(today.getTime() + 24 * 3600000);
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
      // JST変換済み Date を直接使用（クライアントが +09:00 付きで渡す）
      if (input.startDate) { conditions.push(gte(attendanceRecords.clockInTime, iso(input.startDate))); }
      if (input.endDate)   { conditions.push(lte(attendanceRecords.clockInTime, iso(input.endDate))); }
      if (input.employeeId) conditions.push(eq(attendanceRecords.employeeId, input.employeeId));
      if (input.siteId) conditions.push(eq(attendanceRecords.siteId, input.siteId));
      const rows = await db.select({
        id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
        workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes,
        companionEmployeeIds: attendanceRecords.companionEmployeeIds, status: attendanceRecords.status,
        isCorrected: attendanceRecords.isCorrected,
        employeeId: employeeMaster.id, employeeCode: employeeMaster.employeeId, employeeName: employeeMaster.name,
        siteId: siteMaster.id, siteCode: siteMaster.siteId, siteName: siteMaster.siteName, location: siteMaster.location,
      }).from(attendanceRecords)
        .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceRecords.clockInTime));
      // workingMinutes をDB保存値ではなく clockIn/clockOut から都度再計算
      return rows.map(r => ({
        ...r,
        workingMinutes: r.clockOutTime
          ? calcWorkingMinutes(r.clockInTime, new Date(r.clockOutTime))
          : null,
      }));
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
    // JST基準で本日の開始・終了をUTCで計算
    const nowJST = new Date(Date.now() + 9 * 3600000);
    const todayStartUTC = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate()) - 9 * 3600000);
    const todayEndUTC   = new Date(todayStartUTC.getTime() + 24 * 3600000);
    const [activeRows, todayRows, empRows, siteRows] = await Promise.all([
      db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.status, "active"), isNull(attendanceRecords.clockOutTime))),
      db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(todayStartUTC)), lte(attendanceRecords.clockInTime, iso(todayEndUTC)))),
      db.select({ id: employeeMaster.id }).from(employeeMaster).where(eq(employeeMaster.status, "active")),
      db.select({ id: siteMaster.id }).from(siteMaster).where(eq(siteMaster.status, "active")),
    ]);
    return { activeWorkers: activeRows.length, todayAttendance: todayRows.length, totalEmployees: empRows.length, totalSites: siteRows.length };
  }),
});
