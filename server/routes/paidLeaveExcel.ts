import type { Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";
import { pool } from "../db";

const FILE_KEY = "paid_leave_excel";
const LOCAL_SEED_PATH = join(process.cwd(), "data", "paid_leave.xlsx");

// ─── DB読み書きヘルパー ──────────────────────────────────────────────────────

async function readFromDb(): Promise<Buffer | null> {
  const res = await pool.query(
    `SELECT data FROM system_files WHERE key = $1`,
    [FILE_KEY]
  );
  if (res.rows.length === 0) return null;
  // PostgreSQLのBYTEAはNode.jsではBufferとして返る
  return res.rows[0].data as Buffer;
}

async function writeToDb(buf: Buffer): Promise<void> {
  await pool.query(
    `INSERT INTO system_files (key, data, updated_at)
     VALUES ($1, $2, now()::text)
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()::text`,
    [FILE_KEY, buf]
  );
}

// ─── 初回起動時シード（ローカルファイル → DB）──────────────────────────────
export async function seedPaidLeaveExcel(): Promise<void> {
  const existing = await pool.query(
    `SELECT key FROM system_files WHERE key = $1`,
    [FILE_KEY]
  );
  if (existing.rows.length > 0) {
    console.log("[paid-leave-excel] DBにファイルが存在します");
    return;
  }
  if (!existsSync(LOCAL_SEED_PATH)) {
    console.warn("[paid-leave-excel] シード用ファイルが見つかりません:", LOCAL_SEED_PATH);
    return;
  }
  const buf = readFileSync(LOCAL_SEED_PATH);
  await writeToDb(buf);
  console.log("[paid-leave-excel] DBへシード完了:", LOCAL_SEED_PATH);
}

// ─── Excelセルから日付を取得 ─────────────────────────────────────────────────
function getCellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value;
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "result" in v) {
    const r = (v as any).result;
    if (r instanceof Date) return r;
    if (typeof r === "string" && r) return new Date(r);
  }
  if (typeof v === "string" && v) return new Date(v);
  return null;
}

// 使用日エリア（1日目〜20日目）
const USE_ROW_START = 9;
const USE_ROW_END = 28;

// "YYYY-MM-DD" として日付部分のみを比較（TZ差異の影響を受けない）
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── 有給休暇をExcelに書き込む（DB読み書き・排他制御つき）───────────────────
// 同時承認による lost update を防ぐため、advisory lock で読込→編集→保存を直列化する。
// 管理簿はブック全体を1つのBLOBとして保存しているため、ロックはファイル単位で取得する
// （従業員単位のロックでは別従業員同士の同時書き込みで一方が消えるため不可）。
export async function writePaidLeaveToExcel(params: {
  employeeName: string;
  leaveDate: string; // YYYY-MM-DD
}): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // トランザクション終了まで保持されるロック（同キーの書き込みを直列化）
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [FILE_KEY]);

    const res = await client.query(`SELECT data FROM system_files WHERE key = $1`, [FILE_KEY]);
    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "有給管理簿がDBに未登録です。管理者がアップロードしてください。" };
    }
    const dbBuf = res.rows[0].data as Buffer;

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(dbBuf as any);

    // シート名マッチング（スペース除去で比較）
    const normalize = (s: string) => s.replace(/[\s　]+/g, "");
    const targetKey = normalize(params.employeeName);
    const ws = wb.worksheets.find(s => normalize(s.name) === targetKey);

    if (!ws) {
      await client.query("ROLLBACK");
      const names = wb.worksheets.map(s => s.name).join(", ");
      return {
        success: false,
        error: `シートが見つかりません: "${params.employeeName}"（シート一覧: ${names}）`,
      };
    }

    // ExcelJSはDateをUTC基準でシリアル値化するため、UTC深夜0時で組み立てる
    // （+09:00で作るとUTCでは前日15:00になり、Excel表示が1日前にずれる）
    const [ly, lm, ld] = params.leaveDate.split("-").map(Number);
    const leaveDate = new Date(Date.UTC(ly, lm - 1, ld));
    const leaveKey = toDateKey(leaveDate);

    // 重複チェック: 全付与列の使用日エリアに同じ日付が既にあれば成功扱い（冪等）
    for (let col = 3; col <= ws.columnCount + 5; col++) {
      for (let row = USE_ROW_START; row <= USE_ROW_END; row++) {
        const existing = getCellDate(ws.getRow(row).getCell(col));
        if (existing && toDateKey(existing) === leaveKey) {
          await client.query("ROLLBACK");
          console.log(`[paid-leave-excel] ${params.employeeName}: ${params.leaveDate} は既に記入済み（列${col} 行${row}）`);
          return { success: true };
        }
      }
    }

    // 列C(3)以降を左から検索
    let sawFullColumn = false;
    for (let col = 3; col <= ws.columnCount + 5; col++) {
      const grantDate = getCellDate(ws.getRow(5).getCell(col));
      const expiryDate = getCellDate(ws.getRow(6).getCell(col));

      if (!grantDate) continue; // 付与日がない列はスキップ

      // 使用期限切れの列はスキップ
      if (expiryDate && leaveDate > expiryDate) continue;

      // 休暇日が付与日より前 → エラー
      if (leaveDate < grantDate) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `エラー: 休暇日(${params.leaveDate})が付与日(${grantDate.toISOString().slice(0, 10)})より前です。まだ付与されていない有給を使用しようとしています。`,
        };
      }

      // 付与日数超過チェック: 既記入件数が付与日数（行8）に達した列は満杯扱い
      const grantedRaw = ws.getRow(8).getCell(col).value;
      const granted = typeof grantedRaw === "number" ? grantedRaw : Number(grantedRaw) || 0;
      let used = 0;
      let emptyRow: number | null = null;
      for (let row = USE_ROW_START; row <= USE_ROW_END; row++) {
        const val = ws.getRow(row).getCell(col).value;
        if (val === null || val === undefined || val === "") {
          if (emptyRow === null) emptyRow = row;
        } else {
          used++;
        }
      }
      if (granted > 0 && used >= granted) {
        sawFullColumn = true;
        console.log(`[paid-leave-excel] ${params.employeeName}: 列${col}は付与日数${granted}日を使い切り済み、次の列へ`);
        continue;
      }

      if (emptyRow !== null) {
        const cell = ws.getRow(emptyRow).getCell(col);
        cell.value = leaveDate;
        cell.numFmt = "yyyy/m/d";

        const updatedBuf = Buffer.from(await wb.xlsx.writeBuffer());
        await client.query(
          `INSERT INTO system_files (key, data, updated_at)
           VALUES ($1, $2, now()::text)
           ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()::text`,
          [FILE_KEY, updatedBuf]
        );
        await client.query("COMMIT");

        console.log(`[paid-leave-excel] ${params.employeeName}: 列${col} 行${emptyRow} に ${params.leaveDate} を書き込み完了`);
        return { success: true };
      }

      // この列が満杯 → 次の列へ
      sawFullColumn = true;
      console.log(`[paid-leave-excel] ${params.employeeName}: 列${col}が満杯、次の列へ`);
    }

    await client.query("ROLLBACK");
    return {
      success: false,
      error: sawFullColumn
        ? `${params.employeeName}: 有給の残日数がありません（付与日数を使い切っています）`
        : `${params.employeeName}: ${params.leaveDate} に使用できる付与列がありません（使用期限切れの可能性）`,
    };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* already rolled back */ }
    throw e;
  } finally {
    client.release();
  }
}

// ─── ダウンロードハンドラ ────────────────────────────────────────────────────
export async function handlePaidLeaveExcelDownload(_req: Request, res: Response): Promise<void> {
  try {
    const buf = await readFromDb();
    if (!buf) {
      res.status(404).json({ error: "有給管理簿がまだ登録されていません" });
      return;
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("有給休暇管理簿.xlsx")}`);
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}

// ─── アップロードハンドラ（管理者がExcelを差し替える）────────────────────────
export async function handlePaidLeaveExcelUpload(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body?.fileData as string | undefined;
    if (!data) {
      res.status(400).json({ error: "fileDataが必要です（base64）" });
      return;
    }
    const buf = Buffer.from(data, "base64");
    await writeToDb(buf);
    res.json({ success: true, message: "有給管理簿を更新しました" });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
