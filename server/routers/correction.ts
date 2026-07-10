import { z } from "zod";
import { eq, and, desc, ne, notInArray, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb, pool } from "../db";
import { correctionRequests, attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";
import { calcWorkingMinutes } from "../utils/time";

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
          throw new TRPCError({ code: "BAD_REQUEST", message: "新規記録追加には出勤時刻・退勤時刻・現場が必要です" });
        }
        await ensureNewRecordMigration();
      } else {
        if (!input.attendanceRecordId) throw new TRPCError({ code: "BAD_REQUEST", message: "対象記録を選択してください" });
        const existing = await db.select().from(correctionRequests)
          .where(and(eq(correctionRequests.attendanceRecordId, input.attendanceRecordId), eq(correctionRequests.status, "pending"))).limit(1);
        if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "この記録には既に申請中の訂正申請があります" });
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

  listAllCorrectionRequests: adminProcedure
    .input(z.object({ showAllProcessed: z.boolean().optional().default(false) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const showAll = input?.showAllProcessed ?? false;
      // 処理済みは直近1ヶ月のみ表示（1ヶ月超はcorrectionCleanupが毎日削除する）
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const sinceStr = oneMonthAgo.toISOString();

      const allRows = await db.select({
        id: correctionRequests.id, attendanceRecordId: correctionRequests.attendanceRecordId,
        employeeId: correctionRequests.employeeId, reason: correctionRequests.reason, correctionType: correctionRequests.correctionType,
        newClockInTime: correctionRequests.newClockInTime, newClockOutTime: correctionRequests.newClockOutTime,
        newSiteId: correctionRequests.newSiteId,
        status: correctionRequests.status, approvedBy: correctionRequests.approvedBy, approvedByName: correctionRequests.approvedByName, approvedAt: correctionRequests.approvedAt,
        createdAt: correctionRequests.createdAt, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
        clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, siteName: siteMaster.siteName,
      }).from(correctionRequests)
        .innerJoin(employeeMaster, eq(correctionRequests.employeeId, employeeMaster.id))
        .leftJoin(attendanceRecords, eq(correctionRequests.attendanceRecordId, attendanceRecords.id))
        .leftJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .orderBy(desc(correctionRequests.createdAt));

      if (showAll) return allRows;

      // pending は全件、processed は直近3ヶ月のみ
      return allRows.filter(r =>
        r.status === "pending" || r.createdAt >= sinceStr
      );
    }),

  approveCorrectionRequest: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "申請が見つかりません" });
      const req = rows[0];
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "この申請は既に処理済みです" });
      const now = iso(new Date());
      await db.update(correctionRequests).set({ status: "approved", approvedBy: ctx.user.id, approvedByName: ctx.user.name ?? null, approvedAt: now, updatedAt: now }).where(eq(correctionRequests.id, input.id));

      if (req.correctionType === "new_record") {
        if (!req.newClockInTime || !req.newSiteId) throw new TRPCError({ code: "BAD_REQUEST", message: "新規記録に必要な情報が不足しています" });
        const workingMinutes = req.newClockOutTime
          ? calcWorkingMinutes(new Date(req.newClockInTime), new Date(req.newClockOutTime))
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
            const workingMinutes = calcWorkingMinutes(new Date(newClockIn), new Date(newClockOut));
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, clockOutTime: newClockOut, workingMinutes, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
          } else {
            await db.update(attendanceRecords).set({ clockInTime: newClockIn, isCorrected: true, updatedAt: now }).where(eq(attendanceRecords.id, req.attendanceRecordId!));
          }
        }
      }
      return { success: true };
    }),

  rejectCorrectionRequest: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "申請が見つかりません" });
      if (rows[0].status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "この申請は既に処理済みです" });
      const now = iso(new Date());
      await db.update(correctionRequests).set({ status: "rejected", approvedBy: ctx.user.id, approvedByName: ctx.user.name ?? null, approvedAt: now, updatedAt: now }).where(eq(correctionRequests.id, input.id));
      return { success: true };
    }),

  // 訂正申請削除（管理者のみ・処理済みのみ）
  deleteCorrectionRequest: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).limit(1);
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: '申請が見つかりません' });
      if (rows[0].status === 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: '審査中の申請は削除できません' });
      await db.delete(correctionRequests).where(eq(correctionRequests.id, input.id));
      return { success: true };
    }),
});
