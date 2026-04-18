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

  getConfig: publicProcedure.query(async () => {
    const conn = await pool.connect();
    try {
      const result = await conn.query<{ clock_in_time: string; clock_out_time: string }>(
        `SELECT clock_in_time, clock_out_time FROM notification_config WHERE id = 1`
      );
      return result.rows[0] ?? { clock_in_time: "08:00", clock_out_time: "17:00" };
    } finally {
      conn.release();
    }
  }),

  updateConfig: adminProcedure
    .input(z.object({ clockInTime: z.string(), clockOutTime: z.string() }))
    .mutation(async ({ input }) => {
      const conn = await pool.connect();
      try {
        await conn.query(
          `UPDATE notification_config SET clock_in_time = $1, clock_out_time = $2 WHERE id = 1`,
          [input.clockInTime, input.clockOutTime]
        );
      } finally {
        conn.release();
      }
      return { success: true };
    }),

  sendTest: adminProcedure.mutation(async () => {
    await sendNotificationToAll("テスト通知", "通知の動作確認です。正常に届いています！", "/clock-in");
    return { success: true };
  }),
});
