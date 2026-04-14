import { z } from "zod";
import { eq, sql, and, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employeeMaster, siteMaster } from "../../drizzle/schema";

export const masterRouter = router({
  listEmployees: publicProcedure
    .input(z.object({ includeInactive: z.boolean().optional().default(false) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(employeeMaster).orderBy(sql`CAST(${employeeMaster.employeeId} AS INTEGER)`);
      if (input?.includeInactive) return rows;
      return rows.filter((r) => r.status === "active");
    }),

  createEmployee: adminProcedure
    .input(z.object({
      employeeId: z.string().min(1).max(50),
      name: z.string().min(1).max(255),
      nameKana: z.string().optional(),
      pin: z.string().max(6).optional(),
      role: z.enum(["worker", "staff", "admin", "応援"]).default("worker"),
      status: z.enum(["active", "inactive"]).default("active"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date().toISOString();
      // 論理削除済みの同じemployeeIdのレコードを検索
      const inactiveExisting = await db
        .select()
        .from(employeeMaster)
        .where(and(eq(employeeMaster.employeeId, input.employeeId), eq(employeeMaster.status, "inactive")))
        .limit(1);
      if (inactiveExisting.length > 0) {
        // 復活（UPDATE）
        await db.update(employeeMaster)
          .set({ name: input.name, nameKana: input.nameKana, pin: input.pin, role: input.role, status: "active", updatedAt: now })
          .where(eq(employeeMaster.id, inactiveExisting[0].id));
      } else {
        // 通常INSERT
        await db.insert(employeeMaster).values(input);
      }
      const rows = await db.select().from(employeeMaster).where(eq(employeeMaster.employeeId, input.employeeId)).limit(1);
      return rows[0];
    }),

  updateEmployee: adminProcedure
    .input(z.object({
      id: z.number(),
      employeeId: z.string().min(1).max(50).optional(),
      name: z.string().min(1).max(255).optional(),
      nameKana: z.string().optional(),
      pin: z.string().max(6).optional(),
      role: z.enum(["worker", "staff", "admin", "応援"]).optional(),
      status: z.enum(["active", "inactive"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.employeeId) {
        const existing = await db
          .select()
          .from(employeeMaster)
          .where(and(eq(employeeMaster.employeeId, input.employeeId), ne(employeeMaster.id, input.id)))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "その作業員IDは既に使用されています" });
        }
      }
      const { id, ...data } = input;
      await db.update(employeeMaster).set(data).where(eq(employeeMaster.id, id));
      const rows = await db.select().from(employeeMaster).where(eq(employeeMaster.id, id)).limit(1);
      return rows[0];
    }),

  deleteEmployee: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(employeeMaster).set({ status: "inactive" }).where(eq(employeeMaster.id, input.id));
      return { success: true };
    }),

  listSites: publicProcedure
    .input(z.object({ includeInactive: z.boolean().optional().default(false) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(siteMaster).orderBy(siteMaster.siteId);
      if (input?.includeInactive) return rows;
      return rows.filter((r) => r.status === "active");
    }),

  createSite: adminProcedure
    .input(z.object({
      siteId: z.string().min(1).max(50),
      siteName: z.string().min(1).max(255),
      location: z.string().max(255).optional(),
      status: z.enum(["active", "inactive"]).default("active"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date().toISOString();
      // 論理削除済みの同じsiteIdのレコードを検索
      const inactiveExisting = await db
        .select()
        .from(siteMaster)
        .where(and(eq(siteMaster.siteId, input.siteId), eq(siteMaster.status, "inactive")))
        .limit(1);
      if (inactiveExisting.length > 0) {
        // 復活（UPDATE）
        await db.update(siteMaster)
          .set({ siteName: input.siteName, location: input.location, status: "active", updatedAt: now })
          .where(eq(siteMaster.id, inactiveExisting[0].id));
      } else {
        // 通常INSERT
        await db.insert(siteMaster).values(input);
      }
      const rows = await db.select().from(siteMaster).where(eq(siteMaster.siteId, input.siteId)).limit(1);
      return rows[0];
    }),

  updateSite: adminProcedure
    .input(z.object({
      id: z.number(),
      siteId: z.string().min(1).max(50).optional(),
      siteName: z.string().min(1).max(255).optional(),
      location: z.string().max(255).optional().nullable(),
      status: z.enum(["active", "inactive"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.siteId) {
        const existing = await db
          .select()
          .from(siteMaster)
          .where(and(eq(siteMaster.siteId, input.siteId), ne(siteMaster.id, input.id)))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "その現場IDは既に使用されています" });
        }
      }
      const { id, ...data } = input;
      await db.update(siteMaster).set(data).where(eq(siteMaster.id, id));
      const rows = await db.select().from(siteMaster).where(eq(siteMaster.id, id)).limit(1);
      return rows[0];
    }),

  deleteSite: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(siteMaster).set({ status: "inactive" }).where(eq(siteMaster.id, input.id));
      return { success: true };
    }),
});
