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

// ─── 有給休暇をExcelに書き込む（DB読み書き）─────────────────────────────────
export async function writePaidLeaveToExcel(params: {
  employeeName: string;
  leaveDate: string; // YYYY-MM-DD
}): Promise<{ success: boolean; error?: string }> {
  const dbBuf = await readFromDb();
  if (!dbBuf) {
    return { success: false, error: "有給管理簿がDBに未登録です。管理者がアップロードしてください。" };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dbBuf);

  // シート名マッチング（スペース除去で比較）
  const normalize = (s: string) => s.replace(/[\s　]+/g, "");
  const targetKey = normalize(params.employeeName);
  const ws = wb.worksheets.find(s => normalize(s.name) === targetKey);

  if (!ws) {
    const names = wb.worksheets.map(s => s.name).join(", ");
    return {
      success: false,
      error: `シートが見つかりません: "${params.employeeName}"（シート一覧: ${names}）`,
    };
  }

  const leaveDate = new Date(params.leaveDate + "T00:00:00+09:00");

  // 列C(3)以降を左から検索
  for (let col = 3; col <= ws.columnCount + 5; col++) {
    const grantDate = getCellDate(ws.getRow(5).getCell(col));
    const expiryDate = getCellDate(ws.getRow(6).getCell(col));

    if (!grantDate) continue; // 付与日がない列はスキップ

    // 使用期限切れの列はスキップ
    if (expiryDate && leaveDate > expiryDate) continue;

    // 休暇日が付与日より前 → エラー
    if (leaveDate < grantDate) {
      return {
        success: false,
        error: `エラー: 休暇日(${params.leaveDate})が付与日(${grantDate.toISOString().slice(0, 10)})より前です。まだ付与されていない有給を使用しようとしています。`,
      };
    }

    // 空きスロットを探す（行9〜28）
    let emptyRow: number | null = null;
    for (let row = 9; row <= 28; row++) {
      const val = ws.getRow(row).getCell(col).value;
      if (val === null || val === undefined || val === "") {
        emptyRow = row;
        break;
      }
    }

    if (emptyRow !== null) {
      const cell = ws.getRow(emptyRow).getCell(col);
      cell.value = leaveDate;
      cell.numFmt = "yyyy/m/d";

      // DB書き込み
      const updatedBuf = Buffer.from(await wb.xlsx.writeBuffer());
      await writeToDb(updatedBuf);

      console.log(`[paid-leave-excel] ${params.employeeName}: 列${col} 行${emptyRow} に ${params.leaveDate} を書き込み完了`);
      return { success: true };
    }

    // この列が満杯 → 次の列へ
    console.log(`[paid-leave-excel] ${params.employeeName}: 列${col}が満杯、次の列へ`);
  }

  return { success: false, error: `${params.employeeName}: 書き込み可能な空きがありません` };
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
