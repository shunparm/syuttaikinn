// JST（UTC+9）共通ユーティリティ
// サーバーはUTC環境で動作するため、JST表示が必要な箇所はすべてここを使う

export const JST_OFFSET = 9 * 60 * 60 * 1000;

/** UTC Date を JST に変換した Date を返す（getUTC* で読み取ること） */
export function toJST(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET);
}

/** Date を "YYYY-MM-DD"（JST基準）文字列に変換 */
export function toJSTDateStr(d: Date): string {
  const j = toJST(d);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}

/** 現在のJST時刻を返す（スケジューラ用） */
export function jstNow(): { hour: number; minute: number; weekday: number } {
  const jst = toJST(new Date());
  return { hour: jst.getUTCHours(), minute: jst.getUTCMinutes(), weekday: jst.getUTCDay() };
}

function jstBreakRange(clockIn: Date): { breakStart: Date; breakEnd: Date } {
  const j = toJST(clockIn);
  const y = j.getUTCFullYear(), mo = j.getUTCMonth(), d = j.getUTCDate();
  return {
    breakStart: new Date(Date.UTC(y, mo, d, 3, 0, 0)), // UTC 03:00 = JST 12:00
    breakEnd:   new Date(Date.UTC(y, mo, d, 4, 0, 0)), // UTC 04:00 = JST 13:00
  };
}

/** 実働時間（分）を計算。JST 12:00〜13:00 の休憩時間を差し引く */
export function calcWorkingMinutes(clockIn: Date, clockOut: Date): number {
  const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const { breakStart, breakEnd } = jstBreakRange(clockIn);
  const overlapMs = Math.max(
    0,
    Math.min(clockOut.getTime(), breakEnd.getTime()) -
    Math.max(clockIn.getTime(), breakStart.getTime()),
  );
  return Math.max(0, totalMinutes - Math.floor(overlapMs / 60000));
}
