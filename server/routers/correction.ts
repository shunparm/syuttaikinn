import { z } from "zod";
import { eq, and, desc, ne, notInArray } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { correctionRequests, attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

const iso = (d: Date) => d.toISOString();

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
function calcWorkingMinutes(clockInStr: string, clockOutStr: string): number {
  const clockIn = new Date(clockInStr), clockOut = new Date(clockOutStr);
  const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const { breakStart, breakEnd } = jstBreakRange(clockIn);
  const overlapMs  = Math.max(0, Math.min(clockOut.getTime(), breakEnd.getTime()) - Math.max(clockIn.getTime(), breakStart.getTime()));
  return Math.max(0, totalMinutes - Math.floor(overlapMs / 60000));
}

export const correctionRouter = router({
  getRecordsByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const pendingRequests = await db.select({ attendanceRecordId: correctionRequests.attendanceRecordId })
        .from(correctionRequests)
        .where(and(eq(correctionRequests.employeeId, input.employeeId), eq(correctionRequests.status, "pending")));
      const pendingRecordIds = pendingRequests.map((r) => r.attendanceRecordId);
      const baseConditions = and(eq(attendanceRecords.employeeId, input.employeeId), ne(attendanceRecords.status, "deleted"));
      const whereClause = pendingRecordIds.length > 0
        ? and(baseConditions, notInArray(attendanceRecords.id, pendingRecordIds))
        : baseConditions;
      return db.select({
        id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
        workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes,
        status: attendanceRecords.status, siteName: siteMaster.siteName, siteId: siteMaster.id,
      }).from(attendanceRecords)
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .where(whereClause)
        .orderBy(desc(attendanceRecords.clockInTime))
        .limit(100);
    }),

  createCorrectionRequest: publicProcedure
    .input(z.object({
      attendanceRecordId: z.number(), employeeId: z.number(), reason: z.string().min(1),
      correctionType: z.enum(["time_correction", "cancel", "site_change", "other"]),
      newClockInTime: z.date().optional(), newClockOutTime: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(correctionRequests)
        .where(and(eq(correctionRequests.attendanceRecordId, input.attendanceRecordId), eq(correctionRequests.status, "pending"))).limit(1);
      if (existing.length > 0) throw new Error("この記録には既に申請中の訂正申請があります");
      await db.insert(correctionRequests).values({
        attendanceRecordId: input.attendanceRecordId, employeeId: input.employeeId,
        reason: input.reason, correctionType: input.correctionType,
        newClockInTime: input.newClockInTime ? iso(input.newClockInTime) : null,
        newClockOutTime: input.newClockOutTime ? iso(input.newClockOutTime) : null,
        status: "pending",
      });
      const rows = await db.select().from(correctionRequests)
        .where(eq(correctionRequests.attendanceRecordId, input.attendanceRecordId))
        .orderBy(desc(correctionRequests.createdAt)).limit(1);
      return rows[0];
    }),

  listCorrectionRequests: publicProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all") }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select({
        id: correctionRequests.id, reason: correctionRequests.reason, correctionType: correctionRequests.correctionType,
        newClockInTime: correctionRequests.newClockInTime, newClockOutTime: correctionRequests.newClockOutTime,
        status: correctionRequests.status, approvedAt: correctionRequests.approvedAt, createdAt: correctionRequests.createdAt,
        attendanceRecordId: correctionRequests.attendanceRecordId,
        employeeId: employeeMaster.id, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
        clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, siteName: siteMaster.siteName,
      }).from(correctionRequests)
        .innerJoin(employeeMaster, eq(correctionRequests.employeeId, employeeMaster.id))
        .innerJoin(attendanceRecords, eq(correctionRequests.attendanceRecordId, attendanceRecords.id))
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .orderBy(desc(correctionRequests.createdAt));
      if (!input || input.status === "all") return rows;
      return rows.filter((r) => r.status === input.status);
    }),

  listAllCorrectionRequests: protectedProcedure.query(async () => {
    const db = getDb();
    return db.select({
      id: correctionRequests.id, attendanceRecordId: correctionRequests.attendanceRecordId,
      employeeId: correctionRequests.employeeId, reason: correctionRequests.reason, correctionType: correctionRequests.correctionType,
      newClockInTime: correctionRequests.newClockInTime, newClockOutTime: correctionRequests.newClockOutTime,
      status: correctionRequests.status, approvedBy: correctionRequests.approvedBy, approvedAt: correctionRequests.approvedAt,
      createdAt: correctionRequests.createdAt, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
      clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, siteName: siteMaster.siteName,
    }).from(correctionRequests)
      .innerJoin(employeeMaster, eq(correctionRequests.employeeId, employeeMaster.id))
      .innerJoin(attendanceRecords, eq(correctionRequests.attendanceRecordId, attendanceRecords.id))
      .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
      .orderBy(desc(correctionRequests.createdAt));
  }),

  approveCorrectionRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new Error("申請が見つかりません");
      const req = rows[0];
      if (req.status !== "pending") throw new Error("この申請は既に処理済みです");
      const now = iso(new Date());
      await db.update(correctionRequests).set({ status: "approved", approvedBy: ctx.user.id, approvedAt: now, updatedAt: now }).where(eq(correctionRequests.id, input.id));
      if (req.correctionType === "cancel") {
        await db.update(attendanceRecords).set({ status: "deleted", updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId));
      } else if (req.correctionType === "site_change" || req.correctionType === "other") {
        await db.update(attendanceRecords).set({ isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId));
      } else if (req.correctionType === "time_correction") {
        const arRows = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, req.attendanceRecordId)).limit(1);
        if (arRows.length > 0) {
          const ar = arRows[0];
          const newClockIn = req.newClockInTime ?? ar.clockInTime;
          const newClockOut = req.newClockOutTime ?? ar.clockOutTime;
          if (newClockOut) {
            const workingMinutes = calcWorkingMinutes(newClockIn, newClockOut);
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, clockOutTime: newClockOut, workingMinutes, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId));
          } else {
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId));
          }
        }
      }
      return { success: true };
    }),

  rejectCorrectionRequest: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new Error("申請が見つかりません");
      if (rows[0].status !== "pending") throw new Error("この申請は既に処理済みです");
      const now = iso(new Date());
      await db.update(correctionRequests).set({ status: "rejected", approvedBy: ctx.user.id, approvedAt: now, updatedAt: now }).where(eq(correctionRequests.id, input.id));
      return { success: true };
    }),

  // 訂正申請削除（管理者のみ・処理済みのみ）
  deleteCorrectionRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new Error('申請が見つかりません');
      if (rows[0].status === 'pending') throw new Error('審査中の申請は削除できません');
      await db.delete(correctionRequests).where(eq(correctionRequests.id, input.id));
      return { success: true };
    }),
});
