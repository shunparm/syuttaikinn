import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { pool } from "../db";
import { sendNotificationToAll } from "../notificationScheduler";

const subscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const pushNotificationRouter = router({
  getVapidPublicKey: publicProcedure.query(() => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
  }),

  subscribe: publicProcedure.input(subscriptionSchema).mutation(async ({ input, ctx }) => {
    const userId = ctx.user?.openId ?? null;
    const conn = await pool.connect();
    try {
      await conn.query(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, "userId")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3, "userId" = $4`,
        [input.endpoint, input.keys.p256dh, input.keys.auth, userId]
      );
    } finally {
      conn.release();
    }
    return { success: true };
  }),

  unsubscribe: publicProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      const conn = await pool.connect();
      try {
        await conn.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [input.endpoint]);
      } finally {
        conn.release();
      }
      return { success: true };
    }),

  sendTest: adminProcedure.mutation(async () => {
    await sendNotificationToAll(
      "テスト通知",
      "通知の動作確認です。正常に届いています！",
      "/clock-in"
    );
    return { success: true };
  }),
});
