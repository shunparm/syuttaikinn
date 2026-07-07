import { z } from "zod";
import { eq, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, ownerProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { dailyReports, dailyReportAssignments, siteMaster, employeeMaster } from "../../drizzle/schema";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください");
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM形式で指定してください").nullable().optional();

// ─── 現場配置日報（TimeTree置き換え）────────────────────────────────────────
// 閲覧: admin + owner ／ 入力・編集・削除: owner（社長）のみ
export const siteAssignmentRouter = router({
  // 指定日の現場配置一覧（現場ごとに担当者をネストして返す）
  getByDate: adminProcedure
    .input(z.object({ date: dateSchema }))
    .query(async ({ input }) => {
      const db = getDb();
      const reports = await db
        .select({
          id: dailyReports.id,
          reportDate: dailyReports.reportDate,
          siteId: dailyReports.siteId,
          sortOrder: dailyReports.sortOrder,
          siteName: siteMaster.siteName,
          siteCode: siteMaster.siteId,
          location: siteMaster.location,
        })
        .from(dailyReports)
        .innerJoin(siteMaster, eq(dailyReports.siteId, siteMaster.id))
        .where(eq(dailyReports.reportDate, input.date))
        .orderBy(asc(dailyReports.sortOrder), asc(dailyReports.id));

      if (reports.length === 0) return { date: input.date, sites: [] };

      const assignments = await db
        .select({
          id: dailyReportAssignments.id,
          dailyReportId: dailyReportAssignments.dailyReportId,
          employeeId: dailyReportAssignments.employeeId,
          startTime: dailyReportAssignments.startTime,
          endTime: dailyReportAssignments.endTime,
          sortOrder: dailyReportAssignments.sortOrder,
          employeeName: employeeMaster.name,
        })
        .from(dailyReportAssignments)
        .innerJoin(employeeMaster, eq(dailyReportAssignments.employeeId, employeeMaster.id))
        .where(inArray(dailyReportAssignments.dailyReportId, reports.map(r => r.id)))
        .orderBy(asc(dailyReportAssignments.sortOrder), asc(dailyReportAssignments.id));

      const sites = reports.map(r => ({
        ...r,
        assignments: assignments.filter(a => a.dailyReportId === r.id),
      }));
      return { date: input.date, sites };
    }),

  // 現場配置の保存（日付+現場の単位でまるごと置き換え）。社長のみ。
  upsertReport: ownerProcedure
    .input(z.object({
      date: dateSchema,
      siteId: z.number().int().positive(),
      assignments: z.array(z.object({
        employeeId: z.number().int().positive(),
        startTime: timeSchema,
        endTime: timeSchema,
      })).max(100),
    }))
    .mutation(async ({ input }) => {
      // 同一従業員の重複を除去（先勝ち）
      const seen = new Set<number>();
      const uniqueAssignments = input.assignments.filter(a => {
        if (seen.has(a.employeeId)) return false;
        seen.add(a.employeeId);
        return true;
      });

      const db = getDb();
      const now = new Date().toISOString();

      // 既存の同日同現場レコードを取得 or 新規作成
      const existing = await db
        .select({ id: dailyReports.id })
        .from(dailyReports)
        .where(eq(dailyReports.reportDate, input.date))
        .then(rows => rows); // reportDateで絞ってからsiteIdはJS側で（複合whereでも可だが行数が少ないため単純に）

      const existingForSite = await db
        .select({ id: dailyReports.id, siteId: dailyReports.siteId })
        .from(dailyReports)
        .where(eq(dailyReports.reportDate, input.date));
      const match = existingForSite.find(r => r.siteId === input.siteId);

      let reportId: number;
      if (match) {
        reportId = match.id;
        await db.update(dailyReports).set({ updatedAt: now }).where(eq(dailyReports.id, reportId));
        // 担当者はまるごと入れ替え
        await db.delete(dailyReportAssignments).where(eq(dailyReportAssignments.dailyReportId, reportId));
      } else {
        const inserted = await db
          .insert(dailyReports)
          .values({ reportDate: input.date, siteId: input.siteId, sortOrder: existing.length })
          .returning({ id: dailyReports.id });
        reportId = inserted[0].id;
      }

      if (uniqueAssignments.length > 0) {
        await db.insert(dailyReportAssignments).values(
          uniqueAssignments.map((a, i) => ({
            dailyReportId: reportId,
            employeeId: a.employeeId,
            startTime: a.startTime ?? null,
            endTime: a.endTime ?? null,
            sortOrder: i,
          }))
        );
      }

      return { success: true, reportId };
    }),

  // 現場配置の削除（現場カードごと）。社長のみ。
  deleteReport: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select({ id: dailyReports.id }).from(dailyReports).where(eq(dailyReports.id, input.id)).limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      await db.delete(dailyReportAssignments).where(eq(dailyReportAssignments.dailyReportId, input.id));
      await db.delete(dailyReports).where(eq(dailyReports.id, input.id));
      return { success: true };
    }),
});
