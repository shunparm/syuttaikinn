import { schedule } from "node-cron";
import webpush from "web-push";
import { pool } from "./db";

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    console.warn("[Push] VAPID keys not set. Push notifications disabled.");
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendNotificationToAll(title: string, body: string, url = "/") {
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
      await conn2.query(
        `DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`,
        [expired]
      );
    } finally {
      conn2.release();
    }
  }

  console.log(`[Push] Sent ${title}: ${results.filter(r => r.status === "fulfilled").length} ok, ${results.filter(r => r.status === "rejected").length} failed`);
}

export function startNotificationScheduler() {
  if (!initWebPush()) return;

  // 平日（月〜金）の8:00に出勤リマインダー
  schedule("0 8 * * 1-5", () => {
    sendNotificationToAll(
      "出勤打刻のお知らせ",
      "出勤打刻をお忘れなく！",
      "/clock-in"
    ).catch(console.error);
  }, { timezone: "Asia/Tokyo" });

  // 平日（月〜金）の17:00に退勤リマインダー
  schedule("0 17 * * 1-5", () => {
    sendNotificationToAll(
      "退勤打刻のお知らせ",
      "退勤打刻をお忘れなく！",
      "/clock-out"
    ).catch(console.error);
  }, { timezone: "Asia/Tokyo" });

  console.log("[Push] Notification scheduler started (weekdays 08:00 / 17:00 JST)");
}
