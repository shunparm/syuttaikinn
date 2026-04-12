import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

export const usersRouter = router({
  listUsers: adminProcedure.query(async () => {
    const db = getDb();
    return db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(users.createdAt);
  }),

  updateRole: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (ctx.user.id === input.userId) throw new Error("自分自身のロールは変更できません");
      await db.update(users).set({ role: input.role, updatedAt: new Date().toISOString() }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
