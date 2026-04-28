import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { leaveRequests, employeeMaster } from "../../drizzle/schema";

const iso = (d: Date) => d.toISOString();

export const leaveRequestRouter = router({
  // 作業員が自分の申請一覧を取得
  listByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.employeeId, input.employeeId))
        .orderBy(desc(leaveRequests.createdAt));
    }),

  // 新規申請
  create: publicProcedure
    .input(
      z.object({
        employeeId: z.number(),
        leaveType: z.enum(["paid_leave", "substitute_holiday", "special_leave", "holiday_request"]),
        requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で入力してください"),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      // 同一日・同一種別の重複申請チェック
      const existing = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, input.employeeId),
            eq(leaveRequests.requestDate, input.requestDate),
            eq(leaveRequests.leaveType, input.leaveType),
            eq(leaveRequests.status, "pending")
          )
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error("同じ日付・種別の申請が既に審査中です");
      }
      await db.insert(leaveRequests).values({
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        requestDate: input.requestDate,
        reason: input.reason ?? null,
        status: "pending",
      });
      const rows = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, input.employeeId),
            eq(leaveRequests.requestDate, input.requestDate)
          )
        )
        .orderBy(desc(leaveRequests.createdAt))
        .limit(1);
      return rows[0];
    }),

  // 管理者: 全申請一覧
  listAll: protectedProcedure.query(async () => {
    const db = getDb();
    return db
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        requestDate: leaveRequests.requestDate,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        approvedBy: leaveRequests.approvedBy,
        approvedAt: leaveRequests.approvedAt,
        note: leaveRequests.note,
        createdAt: leaveRequests.createdAt,
        updatedAt: leaveRequests.updatedAt,
        employeeName: employeeMaster.name,
        employeeCode: employeeMaster.employeeId,
      })
      .from(leaveRequests)
      .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
      .orderBy(desc(leaveRequests.createdAt));
  }),

  // 管理者: 承認
  approve: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, input.id))
        .limit(1);
      if (rows.length === 0) throw new Error("申請が見つかりません");
      if (rows[0].status !== "pending") throw new Error("この申請は既に処理済みです");
      const now = iso(new Date());
      await db
        .update(leaveRequests)
        .set({
          status: "approved",
          approvedBy: ctx.user.id,
          approvedAt: now,
          note: input.note ?? null,
          updatedAt: now,
        })
        .where(eq(leaveRequests.id, input.id));
      return { success: true };
    }),

  // 管理者: 却下
  reject: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, input.id))
        .limit(1);
      if (rows.length === 0) throw new Error("申請が見つかりません");
      if (rows[0].status !== "pending") throw new Error("この申請は既に処理済みです");
      const now = iso(new Date());
      await db
        .update(leaveRequests)
        .set({
          status: "rejected",
          approvedBy: ctx.user.id,
          approvedAt: now,
          note: input.note ?? null,
          updatedAt: now,
        })
        .where(eq(leaveRequests.id, input.id));
      return { success: true };
    }),

  // 管理者: 処理済み申請の削除
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, input.id))
        .limit(1);
      if (rows.length === 0) throw new Error("申請が見つかりません");
      if (rows[0].status === "pending") throw new Error("審査中の申請は削除できません");
      await db.delete(leaveRequests).where(eq(leaveRequests.id, input.id));
      return { success: true };
    }),
});
