import { z } from "zod";
import { eq, and, desc, ne, notInArray } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb, pool } from "../db";
import { correctionRequests, attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

const iso = (d: Date) => d.toISOString();

// new_record対応のDBマイグレーションを適用（初回のみ実行）
let newRecordMigrationDone = false;
async function ensureNewRecordMigration() {
  if (newRecordMigrationDone) return;
  const client = await pool.connect();
  try {
    // attendanceRecordId の NOT NULL 制約を解除
    await client.query(`ALTER TABLE correction_requests ALTER COLUMN "attendanceRecordId" DROP NOT NULL`);
  } catch (e: any) {
    console.log('DROP NOT NULL (skip):', e.message);
  }
  try {
    // correctionType の CHECK 制約を名前に関わらず全て削除して再作成
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
  } catch (e: any) {
    console.log('CHECK constraint update (skip):', e.message);
  }
  newRecordMigrationDone = true;
  client.release();
}

// 実働時間計算（12:00〜13:00 JST の重複分を差し引く、UTC環境対応）
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
      const pendingRecordIds = pendingRequests.map((r) => r.attendanceRecordId).filter((id): id is number => id !== null);
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
      attendanceRecordId: z.number().optional(),
      employeeId: z.number(),
      reason: z.string().min(1),
      correctionType: z.enum(["time_correction", "cancel", "site_change", "other", "new_record"]),
      newClockInTime: z.date().optional(),
      newClockOutTime: z.date().optional(),
      newSiteId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      if (input.correctionType === "new_record") {
        if (!input.newClockInTime || !input.newClockOutTime || !input.newSiteId) {
          throw new Error("新規記録追加には出勤時刻・退勤時刻・現場が必要です");
        }
        await ensureNewRecordMigration();
      } else {
        if (!input.attendanceRecordId) throw new Error("対象記録を選択してください");
        const existing = await db.select().from(correctionRequests)
          .where(and(eq(correctionRequests.attendanceRecordId, input.attendanceRecordId), eq(correctionRequests.status, "pending"))).limit(1);
        if (existing.length > 0) throw new Error("この記録には既に申請中の訂正申請があります");
      }

      const now = iso(new Date());
      await db.insert(correctionRequests).values({
        attendanceRecordId: input.attendanceRecordId ?? null,
        employeeId: input.employeeId,
        reason: input.reason,
        correctionType: input.correctionType,
        newClockInTime: input.newClockInTime ? iso(input.newClockInTime) : null,
        newClockOutTime: input.newClockOutTime ? iso(input.newClockOutTime) : null,
        newSiteId: input.newSiteId ?? null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      const rows = await db.select().from(correctionRequests)
        .where(eq(correctionRequests.employeeId, input.employeeId))
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
        newSiteId: correctionRequests.newSiteId,
        status: correctionRequests.status, approvedAt: correctionRequests.approvedAt, createdAt: correctionRequests.createdAt,
        attendanceRecordId: correctionRequests.attendanceRecordId,
        employeeId: employeeMaster.id, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
        clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, siteName: siteMaster.siteName,
      }).from(correctionRequests)
        .innerJoin(employeeMaster, eq(correctionRequests.employeeId, employeeMaster.id))
        .leftJoin(attendanceRecords, eq(correctionRequests.attendanceRecordId, attendanceRecords.id))
        .leftJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
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
      newSiteId: correctionRequests.newSiteId,
      status: correctionRequests.status, approvedBy: correctionRequests.approvedBy, approvedAt: correctionRequests.approvedAt,
      createdAt: correctionRequests.createdAt, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
      clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, siteName: siteMaster.siteName,
    }).from(correctionRequests)
      .innerJoin(employeeMaster, eq(correctionRequests.employeeId, employeeMaster.id))
      .leftJoin(attendanceRecords, eq(correctionRequests.attendanceRecordId, attendanceRecords.id))
      .leftJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
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

      if (req.correctionType === "new_record") {
        if (!req.newClockInTime || !req.newSiteId) throw new Error("新規記録に必要な情報が不足しています");
        const workingMinutes = req.newClockOutTime
          ? calcWorkingMinutes(req.newClockInTime, req.newClockOutTime)
          : null;
        await db.insert(attendanceRecords).values({
          employeeId: req.employeeId,
          siteId: req.newSiteId,
          clockInTime: req.newClockInTime,
          clockOutTime: req.newClockOutTime ?? null,
          workingMinutes: workingMinutes,
          isCorrected: true,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      } else if (req.correctionType === "cancel") {
        await db.update(attendanceRecords).set({ status: "deleted", updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
      } else if (req.correctionType === "site_change") {
        const siteUpdateSet: any = { isCorrected: true, updatedAt: now };
        if (req.newSiteId) siteUpdateSet.siteId = req.newSiteId;
        await db.update(attendanceRecords).set(siteUpdateSet).where(eq(attendanceRecords.id, req.attendanceRecordId!));
      } else if (req.correctionType === "other") {
        await db.update(attendanceRecords).set({ isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
      } else if (req.correctionType === "time_correction") {
        const arRows = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, req.attendanceRecordId!)).limit(1);
        if (arRows.length > 0) {
          const ar = arRows[0];
          const newClockIn = req.newClockInTime ?? ar.clockInTime;
          const newClockOut = req.newClockOutTime ?? ar.clockOutTime;
          if (newClockOut) {
            const workingMinutes = calcWorkingMinutes(newClockIn, newClockOut);
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, clockOutTime: newClockOut, workingMinutes, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
          } else {
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
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
