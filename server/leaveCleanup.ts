import { schedule } from "node-cron";
import { pool } from "./db";

// ─── 休暇申請の保持期間管理 ──────────────────────────────────────────────────
// 紙・CSVで毎月保存しているため、システム上は希望日から直近2ヶ月分のみ保持する。
// 安全のため、保留中（pending）の申請は期間に関わらず削除しない。
// ※有給管理簿Excel（system_files）は承認時に書き込み済みのため、ここでの削除の影響を受けない。

/** JSTでの「2ヶ月前」の日付文字列 YYYY-MM-DD を返す */
export function leaveCutoffDateStr(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cutoff = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() - 2, jst.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

/**
 * 希望日（requestDate）から2ヶ月を過ぎた処理済み休暇申請を削除する。
 * @returns 削除した件数
 */
export async function deleteOldLeaveRequests(): Promise<number> {
  const cutoff = leaveCutoffDateStr();
  // requestDate は "YYYY-MM-DD" 形式のため文字列比較で日付順になる
  const result = await pool.query(
    `DELETE FROM leave_requests
     WHERE status <> 'pending'
       AND "requestDate" < $1`,
    [cutoff]
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[leave-cleanup] 希望日から2ヶ月経過した休暇申請を${count}件削除しました（基準日: ${cutoff}）`);
  }
  return count;
}

/** 起動時に1回実行し、以降は毎日 3:10（JST）に実行する */
export function startLeaveCleanupScheduler(): void {
  deleteOldLeaveRequests().catch(e =>
    console.error("[leave-cleanup] 起動時クリーンアップ失敗:", e)
  );

  schedule(
    "10 3 * * *",
    async () => {
      try {
        await deleteOldLeaveRequests();
      } catch (e) {
        console.error("[leave-cleanup] 定期クリーンアップ失敗:", e);
      }
    },
    { timezone: "Asia/Tokyo" }
  );
  console.log("[leave-cleanup] Scheduler started (daily 03:10 JST)");
}
