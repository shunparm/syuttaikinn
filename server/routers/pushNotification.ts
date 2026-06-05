import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { pool } from "../db";
import { sendNotificationToAll } from "../notificationScheduler";
import webpush from "web-push";

function initWebPush(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const prv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!pub || !prv) return false;
  webpush.setVapidDetails(sub, pub, prv);
  return true;
}

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

  // 特定ユーザーへの個別催促通知
  sendToUser: adminProcedure
    .input(z.object({
      openId: z.string(),
      type: z.enum(["clock-in", "clock-out"]),
    }))
    .mutation(async ({ input }) => {
      if (!initWebPush()) throw new Error("VAPIDキーが設定されていません");

      const conn = await pool.connect();
      let rows: { endpoint: string; p256dh: string; auth: string }[] = [];
      try {
        const result = await conn.query<{ endpoint: string; p256dh: string; auth: string }>(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE "userId" = $1`,
          [input.openId]
        );
        rows = result.rows;
      } finally {
        conn.release();
      }

      if (rows.length === 0) return { sent: 0 };

      const title = input.type === "clock-in" ? "出勤打刻の催促" : "退勤打刻の催促";
      const body  = input.type === "clock-in" ? "出勤打刻がまだです。忘れずに打刻してください！" : "退勤打刻がまだです。忘れずに打刻してください！";
      const url   = input.type === "clock-in" ? "/clock-in" : "/clock-out";
      const payload = JSON.stringify({ title, body, url });

      const results = await Promise.allSettled(
        rows.map(row =>
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            payload
          )
        )
      );

      // 期限切れ購読を削除
      const expired = results
        .map((r, i) => ({ r, row: rows[i] }))
        .filter(({ r }) => r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === 410)
        .map(({ row }) => row.endpoint);
      if (expired.length > 0) {
        const conn2 = await pool.connect();
        try {
          await conn2.query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`, [expired]);
        } finally {
          conn2.release();
        }
      }

      const sent = results.filter(r => r.status === "fulfilled").length;
      return { sent };
    }),

  // ユーザーごとの購読有無を確認
  getSubscribedUserIds: adminProcedure.query(async () => {
    const conn = await pool.connect();
    try {
      const result = await conn.query<{ userId: string }>(
        `SELECT DISTINCT "userId" FROM push_subscriptions WHERE "userId" IS NOT NULL`
      );
      return result.rows.map(r => r.userId);
    } finally {
      conn.release();
    }
  }),

  // 作業員デバイス紐付けコード発行（管理者のみ）
  generateLinkToken: adminProcedure
    .input(z.object({ employeeId: z.number().int() }))
    .mutation(async ({ input }) => {
      const token = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const conn = await pool.connect();
      try {
        await conn.query(`DELETE FROM employee_link_tokens WHERE "employeeId" = $1`, [input.employeeId]);
        await conn.query(
          `INSERT INTO employee_link_tokens (token, "employeeId", "expiresAt") VALUES ($1, $2, $3)`,
          [token, input.employeeId, expiresAt]
        );
      } finally {
        conn.release();
      }
      return { token, expiresAt };
    }),

  // 作業員がコードを入力して端末を紐付け
  redeemLinkToken: publicProcedure
    .input(z.object({ token: z.string().length(4), endpoint: z.string() }))
    .mutation(async ({ input }) => {
      const conn = await pool.connect();
      try {
        const result = await conn.query<{ employeeId: number }>(
          `SELECT "employeeId" FROM employee_link_tokens
           WHERE token = $1 AND "expiresAt"::timestamptz > NOW()`,
          [input.token]
        );
        if (result.rows.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "コードが無効か期限切れです" });
        }
        const { employeeId } = result.rows[0];

        await conn.query(
          `UPDATE push_subscriptions SET "employeeId" = $1 WHERE endpoint = $2`,
          [employeeId, input.endpoint]
        );
        await conn.query(`DELETE FROM employee_link_tokens WHERE token = $1`, [input.token]);

        return { success: true, employeeId };
      } finally {
        conn.release();
      }
    }),

  // 作業員IDで個別催促通知
  sendToEmployee: adminProcedure
    .input(z.object({ employeeId: z.number().int(), type: z.enum(["clock-in", "clock-out"]) }))
    .mutation(async ({ input }) => {
      if (!initWebPush()) throw new Error("VAPIDキーが設定されていません");

      const conn = await pool.connect();
      let rows: { endpoint: string; p256dh: string; auth: string }[] = [];
      try {
        const result = await conn.query<{ endpoint: string; p256dh: string; auth: string }>(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE "employeeId" = $1`,
          [input.employeeId]
        );
        rows = result.rows;
      } finally {
        conn.release();
      }

      if (rows.length === 0) return { sent: 0 };

      const title = input.type === "clock-in" ? "出勤打刻の催促" : "退勤打刻の催促";
      const body  = input.type === "clock-in" ? "出勤打刻がまだです。忘れずに打刻してください！" : "退勤打刻がまだです。忘れずに打刻してください！";
      const url   = input.type === "clock-in" ? "/clock-in" : "/clock-out";
      const payload = JSON.stringify({ title, body, url });

      const results = await Promise.allSettled(
        rows.map(row =>
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            payload
          )
        )
      );

      const expired = results
        .map((r, i) => ({ r, row: rows[i] }))
        .filter(({ r }) => r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === 410)
        .map(({ row }) => row.endpoint);
      if (expired.length > 0) {
        const conn2 = await pool.connect();
        try {
          await conn2.query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`, [expired]);
        } finally {
          conn2.release();
        }
      }

      const sent = results.filter(r => r.status === "fulfilled").length;
      return { sent };
    }),

  // 通知登録済み作業員ID一覧
  getEmployeesWithSubscriptions: adminProcedure.query(async () => {
    const conn = await pool.connect();
    try {
      const result = await conn.query<{ employeeId: number }>(
        `SELECT DISTINCT "employeeId" FROM push_subscriptions WHERE "employeeId" IS NOT NULL`
      );
      return result.rows.map(r => r.employeeId);
    } finally {
      conn.release();
    }
  }),
});

