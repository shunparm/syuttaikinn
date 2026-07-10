import { schedule } from "node-cron";
import { pool } from "./db";

// ─── 訂正申請の保持期間管理 ──────────────────────────────────────────────────
// 紙・CSVで毎月保存しているため、システム上は直近1ヶ月分のみ保持する。
// 安全のため、保留中（pending）の申請は期間に関わらず削除しない。

/**
 * 申請日（createdAt）から1ヶ月を過ぎた処理済み訂正申請を削除する。
 * @returns 削除した件数
 */
export async function deleteOldCorrectionRequests(): Promise<number> {
  const result = await pool.query(`
    DELETE FROM correction_requests
    WHERE status <> 'pending'
      AND "createdAt"::timestamptz < now() - interval '1 month'
  `);
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[correction-cleanup] 1ヶ月経過した訂正申請を${count}件削除しました`);
  }
  return count;
}

/** 起動時に1回実行し、以降は毎日 3:00（JST）に実行する */
export function startCorrectionCleanupScheduler(): void {
  deleteOldCorrectionRequests().catch(e =>
    console.error("[correction-cleanup] 起動時クリーンアップ失敗:", e)
  );

  schedule(
    "0 3 * * *",
    async () => {
      try {
        await deleteOldCorrectionRequests();
      } catch (e) {
        console.error("[correction-cleanup] 定期クリーンアップ失敗:", e);
      }
    },
    { timezone: "Asia/Tokyo" }
  );
  console.log("[correction-cleanup] Scheduler started (daily 03:00 JST)");
}
