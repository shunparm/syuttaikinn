import type { Request, Response } from "express";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";

const EXCEL_PATH = process.env.PAID_LEAVE_EXCEL_PATH ?? join(process.cwd(), "data", "paid_leave.xlsx");

// ─── Excelから日付値を取得 ───────────────────────────────────────────────────
function getCellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value;
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "result" in v) {
    const r = (v as any).result;
    if (r instanceof Date) return r;
    if (typeof r === "string") return new Date(r);
  }
  if (typeof v === "string") return new Date(v);
  return null;
}

// ─── 個人シートの有給管理簿に日付を書き込む ────────────────────────────────
export async function writePaidLeaveToExcel(params: {
  employeeName: string;   // アプリ上の作業員名
  leaveDate: string;      // YYYY-MM-DD
}): Promise<{ success: boolean; error?: string; column?: number; row?: number }> {
  if (!existsSync(EXCEL_PATH)) {
    return { success: false, error: `有給管理簿ファイルが見つかりません: ${EXCEL_PATH}` };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  // ── シートを名前でマッチング（スペース除去で比較）
  const normalize = (s: string) => s.replace(/\s+/g, "");
  const targetName = normalize(params.employeeName);
  const ws = wb.worksheets.find(s => normalize(s.name) === targetName);

  if (!ws) {
    const sheetNames = wb.worksheets.map(s => s.name).join(", ");
    return { success: false, error: `シートが見つかりません: ${params.employeeName}（シート一覧: ${sheetNames}）` };
  }

  const leaveDate = new Date(params.leaveDate + "T00:00:00+09:00");

  // ── 列C以降を左から順に確認（行5=付与日、行6=使用期限）
  const MAX_COL = ws.columnCount;
  const USE_DAY_ROWS = { start: 9, end: 28 }; // 1日目〜20日目

  for (let col = 3; col <= MAX_COL; col++) {
    const grantCell = ws.getRow(5).getCell(col);
    const expiryCell = ws.getRow(6).getCell(col);
    const grantDate = getCellDate(grantCell);
    const expiryDate = getCellDate(expiryCell);

    if (!grantDate) continue; // 付与日がない列はスキップ

    // 使用期限を過ぎている列はスキップ
    if (expiryDate && leaveDate > expiryDate) continue;

    // 休暇日が付与日より前 → エラー
    if (leaveDate < grantDate) {
      const grantStr = grantDate.toISOString().slice(0, 10);
      return {
        success: false,
        error: `エラー: 休暇日(${params.leaveDate})が付与日(${grantStr})より前です。まだ付与されていない有給を使用しようとしています。`,
      };
    }

    // この列の空きスロットを探す（行9〜28）
    let emptyRow: number | null = null;
    for (let row = USE_DAY_ROWS.start; row <= USE_DAY_ROWS.end; row++) {
      const cell = ws.getRow(row).getCell(col);
      const val = cell.value;
      const isEmpty = val === null || val === undefined || val === "";
      if (isEmpty) {
        emptyRow = row;
        break;
      }
    }

    if (emptyRow !== null) {
      // 日付を書き込む
      const cell = ws.getRow(emptyRow).getCell(col);
      cell.value = leaveDate;
      cell.numFmt = "yyyy/m/d";

      await wb.xlsx.writeFile(EXCEL_PATH);
      console.log(`[paid-leave-excel] ${params.employeeName}: 列${col}行${emptyRow}に${params.leaveDate}を書き込み`);
      return { success: true, column: col, row: emptyRow };
    }

    // この列が満杯 → 次の列へ（ループ継続）
    console.log(`[paid-leave-excel] ${params.employeeName}: 列${col}が満杯、次の列へ移動`);
  }

  return { success: false, error: `${params.employeeName}: 書き込み可能な空き列がありません` };
}

// ─── ダウンロードハンドラ ────────────────────────────────────────────────────
export function handlePaidLeaveExcelDownload(_req: Request, res: Response): void {
  if (!existsSync(EXCEL_PATH)) {
    res.status(404).json({ error: "有給管理簿ファイルが見つかりません" });
    return;
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("有給休暇管理簿.xlsx")}`);
  res.sendFile(EXCEL_PATH);
}

// ─── アップロードハンドラ（管理者がExcelを差し替える）────────────────────────
export function handlePaidLeaveExcelUpload(req: Request, res: Response): void {
  const data = req.body?.fileData as string | undefined;
  if (!data) {
    res.status(400).json({ error: "fileDataが必要です" });
    return;
  }
  try {
    const buf = Buffer.from(data, "base64");
    const dir = join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    require("fs").writeFileSync(EXCEL_PATH, buf);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
