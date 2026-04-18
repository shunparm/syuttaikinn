import { schedule } from "node-cron";
import webpush from "web-push";
import { pool } from "./db";

function initWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendNotificationToAll(title: string, body: string, url = "/") {
  if (!initWebPush()) {
    console.warn("[Push] VAPID keys not set. Skipping notification.");
    return;
  }
  const conn = await pool.connect();
  let rows: { endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    const result = await conn.query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions`
    );
    rows = result.rows;
  } finally {
    conn.release();
  }

  if (rows.length === 0) return;

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

  const ok = results.filter(r => r.status === "fulfilled").length;
  console.log(`[Push] ${title}: ${ok}/${rows.length} 件送信`);
}

async function getNotificationConfig(): Promise<{ clockInTime: string; clockOutTime: string }> {
  const conn = await pool.connect();
  try {
    const result = await conn.query<{ clock_in_time: string; clock_out_time: string }>(
      `SELECT clock_in_time, clock_out_time FROM notification_config WHERE id = 1`
    );
    if (result.rows.length === 0) return { clockInTime: "08:00", clockOutTime: "17:00" };
    return { clockInTime: result.rows[0].clock_in_time, clockOutTime: result.rows[0].clock_out_time };
  } finally {
    conn.release();
  }
}

function jstNow(): { hour: number; minute: number; weekday: number } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { hour: jst.getUTCHours(), minute: jst.getUTCMinutes(), weekday: jst.getUTCDay() };
}

export function startNotificationScheduler() {
  // 毎分チェック（月〜金）
  schedule("* * * * *", async () => {
    try {
      const { weekday, hour, minute } = jstNow();
      if (weekday === 0 || weekday === 6) return; // 土日はスキップ

      const config = await getNotificationConfig();
      const [inH, inM] = config.clockInTime.split(":").map(Number);
      const [outH, outM] = config.clockOutTime.split(":").map(Number);

      if (hour === inH && minute === inM) {
        await sendNotificationToAll("出勤打刻のお知らせ", "出勤打刻をお忘れなく！", "/clock-in");
      }
      if (hour === outH && minute === outM) {
        await sendNotificationToAll("退勤打刻のお知らせ", "退勤打刻をお忘れなく！", "/clock-out");
      }
    } catch (e) {
      console.error("[Push] Scheduler error:", e);
    }
  });

  console.log("[Push] Notification scheduler started (every minute, weekdays only)");
}
