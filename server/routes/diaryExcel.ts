import type { Request, Response } from "express";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { eq, and, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, leaveRequests } from "../../drizzle/schema";

// ─── 対象実習生（氏名に含まれるキーワード）───────────────────────
const TRAINEE_KEYWORDS = ["アルフィアン", "ヨザ", "リズキ", "ディマス"];

function isTrainee(name: string): boolean {
  return TRAINEE_KEYWORDS.some(k => name.includes(k));
}

// ─── JST ユーティリティ ─────────────────────────────────────────
const JST_OFFSET = 9 * 60 * 60 * 1000;

function toJSTDate(s: string | Date): Date {
  return new Date(new Date(s).getTime() + JST_OFFSET);
}

function toJSTDateStr(d: Date): string {
  const j = toJSTDate(d);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}

// ─── 月別必要時間 ───────────────────────────────────────────────
const MONTHLY_REQUIRED: Record<number, Record<number, number>> = {
  1:  {1: 91, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  2:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  3:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  4:  {1: 95, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  5:  {1: 94, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  6:  {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  7:  {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  8:  {1: 70, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  9:  {1: 70, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  10: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  11: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
  12: {1: 90, 2: 10, 3: 44, 4: 8, 5: 15, 6: 8},
};

const FALLBACK_WORKS: Record<number, Array<[string, string[]]>> = {
  1: [
    ["掘削作業", ["マンホール布設", "汚水桝布設", "管布設", "水道掘削", "溝掘削"]],
    ["土砂積込み作業", ["過積載防止", "周囲の確認", "積込み確認", "安全確認"]],
    ["走行操作作業", ["発進操作", "平坦地走行", "登坂操作", "降坂操作", "停止操作"]],
    ["毎日整備", ["目視点検", "グリース注入", "燃料補給", "清掃作業"]],
    ["始業前点検", ["目視点検", "備品確認", "始業確認", "安全点検"]],
  ],
  2: [
    ["作業開始前の安全装置等の点検作業", ["目視点検", "安全確認", "始業前確認", "安全装置確認"]],
    ["建設機械施工職種に必要な整理整頓作業", ["道具整理", "現場整理", "用具整頓", "工具整備"]],
    ["保護具の着用と服装の安全点検作業", ["保護具確認", "服装点検", "安全確認"]],
    ["雇入れ時等の安全衛生教育", ["安全教育", "衛生教育", "ルール確認"]],
  ],
  3: [
    ["掘削作業", ["手元作業", "補助作業", "埋戻し", "残土処理"]],
    ["締固め作業", ["埋戻し", "ランマ転圧", "転圧作業", "締固め確認"]],
    ["土工作業(対象職種・作業に係る手作業の作業）", ["手元作業", "蓋かさ上げ", "補助作業", "整地作業"]],
    ["積込み作業", ["手元作業", "補助積込み", "残土積込み"]],
    ["建設機械の管理及び点検・整備作業", ["バケット交換", "グリース注入", "清掃作業", "オイル点検"]],
  ],
  4: [
    ["安全衛生業務", ["荷物搬入", "現場清掃", "補助作業", "用具整備", "資材確認"]],
    ["建設機械施工職種に必要な整理整頓作業", ["道具整理", "現場整理", "工具整備"]],
  ],
  5: [
    ["建設機械の移送車両への積載及び移送作業", ["声出し誘導", "ユンボ回送", "機械移送", "積載補助", "誘導補助"]],
  ],
  6: [
    ["安全衛生業務", ["安全訓練", "倉庫整理", "現場内清掃", "安全管理", "安全確認"]],
  ],
};

// ─── training_content.json 読み込み ────────────────────────────
function loadNumToWorks(): Record<number, Array<[string, string[]]>> {
  const jsonPath = join(process.cwd(), "training_content.json");
  if (!existsSync(jsonPath)) return FALLBACK_WORKS;
  try {
    const db = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const entries = db.entries ?? {};
    const result: Record<number, Array<[string, string[]]>> = {};
    for (let num = 1; num <= 6; num++) {
      const worksDict: Record<string, Record<string, number>> = entries[String(num)] ?? {};
      if (Object.keys(worksDict).length === 0) { result[num] = FALLBACK_WORKS[num] ?? []; continue; }
      const sorted = Object.entries(worksDict).sort(
        ([, a], [, b]) => Object.values(b).reduce((s, v) => s + v, 0) - Object.values(a).reduce((s, v) => s + v, 0)
      );
      result[num] = sorted.map(([w, gs]) => [w, Object.entries(gs).sort(([, a], [, b]) => b - a).map(([g]) => g)]);
    }
    return result;
  } catch { return FALLBACK_WORKS; }
}

const NUM_TO_WORKS = loadNumToWorks();

// ─── 日数割り振り ────────────────────────────────────────────────
function allocateDays(nDays: number, month: number): Record<number, number> {
  const reqs = MONTHLY_REQUIRED[month];
  const minD: Record<number, number> = {};
  for (const [k, v] of Object.entries(reqs)) minD[Number(k)] = Math.ceil(v / 8);
  const totalMin = Object.values(minD).reduce((s, v) => s + v, 0);
  const alloc = { ...minD };
  if (nDays >= totalMin) {
    // 余剰日数は番号1に上乗せ（全番号の必要時間を満たす）
    alloc[1] += nDays - totalMin;
  } else if (nDays > 0) {
    // 番号1から削る（最低1日は残す）
    let deficit = totalMin - nDays;
    const take1 = Math.min(deficit, alloc[1] - 1);
    alloc[1] -= take1;
    deficit -= take1;
    // まだ足りなければ番号3からも削る（Pythonと同じ挙動）
    if (deficit > 0) {
      const take3 = Math.min(deficit, alloc[3] - 1);
      alloc[3] -= take3;
    }
  }
  return alloc;
}

function shuffleNoTriple(arr: number[], seed: number): number[] {
  let s = seed >>> 0;
  const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
  const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } };
  for (let t = 0; t < 200; t++) {
    shuffle(arr);
    if (arr.every((v, i) => i < 2 || !(v === arr[i - 1] && v === arr[i - 2]))) return arr;
  }
  return arr;
}

// ─── スタイルヘルパー ────────────────────────────────────────────
const FONT_NAME = "游ゴシック";

function thinBorder(): Partial<ExcelJS.Borders> {
  const t = { style: "thin" as const };
  return { top: t, bottom: t, left: t, right: t };
}

function setCell(
  ws: ExcelJS.Worksheet, coord: string, value: ExcelJS.CellValue,
  opts: { size?: number; bold?: boolean; hAlign?: ExcelJS.Alignment["horizontal"]; vAlign?: ExcelJS.Alignment["vertical"]; wrap?: boolean; border?: boolean; bottomBorder?: boolean } = {}
) {
  const c = ws.getCell(coord);
  c.value = value;
  c.font = { name: FONT_NAME, size: opts.size ?? 9, bold: opts.bold ?? false };
  c.alignment = { horizontal: opts.hAlign ?? "left", vertical: opts.vAlign ?? "center", wrapText: opts.wrap ?? false };
  if (opts.border) c.border = thinBorder();
  if (opts.bottomBorder) c.border = { bottom: { style: "thin" } };
}

// ─── 右側参照テーブル（固定内容）────────────────────────────────
const REF_TABLE: [number, string, string][] = [
  // [row, I列, J列]
  [9,  "1-(1)", "走行操作作業"],
  [10, "①",    "発進操作"],
  [11, "②",    "平坦地走行操作"],
  [12, "③",    "登坂操作"],
  [13, "④",    "降坂操作"],
  [14, "⑤",    "停止操作"],
  [15, "⑥",    "下車操作"],
  [16, "1-(2)", "掘削作業"],
  [17, "①",    "溝掘削作業"],
  [18, "②",    "建築物の基礎掘削作業"],
  [19, "③",    "地表面の浅い掘削作業"],
  [20, "④",    "法面の切取り仕上げ作業"],
  [21, "⑤",    "土砂積込み作業"],
  [22, "⑥",    "固結した土砂の破砕及び積込み作業"],
  [23, "⑦",    "岩石の移動、除去作業"],
  [24, "⑧",    "粉砕した砕石の積込み作業"],
  [25, "1-(3)", "建設機械点検作業"],
  [26, "①",    "毎日整備"],
  [27, "②",    "始業前点検"],
  [28, "③",    "作業終了後の機体の清掃及び燃料補給"],
  [29, "2-(4)", "安全衛生業務"],
  [30, "①",    "雇入れ時等の安全衛生教育"],
  [31, "②",    "作業開始前の安全装置等の点検作業"],
  [32, "③",    "建設機械施工職種に必要な整理整頓作業"],
  [33, "④",    "建設機械施工職種の作業用機械及び周囲の安全確認作業"],
  [34, "⑤",    "保護具の着用と服装の安全点検作業"],
  [35, "⑥",    "安全装置の使用等による作業"],
  [36, "⑦",    "労働安全衛生上の有害性を防止するための作業"],
  [37, "⑧",    "異常時の応急措置を習得するための作業"],
  [38, "3①",   "押土整地作業"],
  [39, "②",    "積込み作業"],
  [40, "③",    "締固め作業"],
  [41, "④",    "建設機械施工管理作業"],
  [42, "⑤",    "土工作業(対象職種・作業に係る手作業の作業）"],
  [43, "⑥",    "建設機械の管理及び点検・整備作業"],
  [44, "⑦",    "各種揚重運搬機械の運転作業"],
  [45, "⑧",    "玉掛け作業(特別教育又は技能講習が必要）"],
  [46, "5",     "建設機械の移送車両への積載及び移送作業"],
  [47, "",      "休み"],
];

// ─── 日誌シート生成 ─────────────────────────────────────────────
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDiarySheet(
  ws: ExcelJS.Worksheet, year: number, month: number,
  employeeName: string, workingDays: number[], supervisor: string, seed: number,
) {
  // ── 行高さ（9ptフォント対応: データ行は折り返し2行分を確保）
  ws.getRow(1).height = 12;
  ws.getRow(2).height = 14;
  ws.getRow(5).height = 14;
  ws.getRow(6).height = 16;
  ws.getRow(7).height = 14;
  ws.getRow(8).height = 28;
  for (let r = 9; r <= 39; r++) ws.getRow(r).height = 32;
  for (let r = 40; r <= 43; r++) ws.getRow(r).height = 16;

  // ── 列幅（A4縦 有効幅≈190mm / 1.85mm per unit → 合計102unitでA4ぴったり）
  // 最長業務名「建設機械の移送車両への積載及び移送作業」19字×3.2mm=61mm → B+C=36unit×1.85=67mm で収まる
  ws.getColumn("A").width = 10;   // 日付
  ws.getColumn("B").width = 22;   // 業務名(B+C結合=36unit)
  ws.getColumn("C").width = 14;
  ws.getColumn("D").width = 5;    // 番号
  ws.getColumn("E").width = 16;   // 指導内容(E+F+G結合=41unit)
  ws.getColumn("F").width = 12;
  ws.getColumn("G").width = 13;
  ws.getColumn("H").width = 10;   // 指導者氏名
  // 合計: 10+22+14+5+16+12+13+10 = 102unit ≈ 189mm（A4有効190mm内）

  // ── 印刷設定（A4縦・A〜H列・等倍）
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.printArea = "A1:H43";
  ws.pageSetup.margins = {
    left: 0.4, right: 0.4,
    top: 0.5, bottom: 0.5,
    header: 0.2, footer: 0.2,
  };

  // ── ヘッダー行 1-2
  setCell(ws, "A1", "参考様式第4－2号別紙(規則第22号第1項第3号関係)", { size: 8 });
  setCell(ws, "H1", "(日本工業規格A列4）", { size: 8 });
  setCell(ws, "A2", "A・B・C・D・E・F", { size: 8 });

  // ── タイトル行4
  ws.mergeCells("C4:G4");
  setCell(ws, "C4", "　　　技　　能　　実　　習　　日　　誌", { size: 14, bold: true, hAlign: "center" });

  // ── 年月・氏名 行5-6
  ws.mergeCells("D5:F5");
  setCell(ws, "D5", `（　　　${year}　　年　　${month}　　月分）`, { size: 8, hAlign: "center" });

  ws.mergeCells("E6:G6");
  setCell(ws, "E6", `　　　　　　氏名　${employeeName}`, { size: 8, hAlign: "left", bottomBorder: true });

  // ── 行7 注意書き
  setCell(ws, "A7", "(対象:別紙｢技能実習生一覧表｣のとおり)", { size: 8 });

  // ── 行8 列ヘッダー
  setCell(ws, "A8", "日付", { size: 9, hAlign: "center", border: true });
  ws.mergeCells("B8:D8");
  setCell(ws, "B8", "技能実習生に従事させた業務", { size: 9, hAlign: "center", border: true });
  ws.mergeCells("E8:G8");
  setCell(ws, "E8", "技能実習生に対する指導の内容", { size: 9, hAlign: "center", border: true });
  setCell(ws, "H8", "指導者氏名", { size: 10, hAlign: "center", border: true });

  // ── 番号シーケンス生成
  const alloc = allocateDays(workingDays.length, month);
  const numSeq: number[] = [];
  for (const [num, cnt] of Object.entries(alloc)) numSeq.push(...Array(Number(cnt)).fill(Number(num)));
  shuffleNoTriple(numSeq, seed);

  const workIdx: Record<number, number> = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};
  const totalDays = daysInMonth(year, month);

  // ── 日別行 (行9〜39)
  for (let day = 1; day <= 31; day++) {
    const rowNum = 8 + day;
    if (day > totalDays) continue;

    const dateObj = new Date(year, month - 1, day);
    const aCell = ws.getRow(rowNum).getCell("A");
    aCell.value = dateObj;
    aCell.numFmt = "m/d";
    aCell.font = { name: FONT_NAME, size: 10 };
    aCell.alignment = { horizontal: "center", vertical: "center" };
    aCell.border = thinBorder();

    // B:C 結合
    ws.mergeCells(`B${rowNum}:C${rowNum}`);
    // E:G 結合
    ws.mergeCells(`E${rowNum}:G${rowNum}`);

    if (workingDays.includes(day)) {
      const seqIdx = workingDays.indexOf(day);
      const num = numSeq[seqIdx] ?? 1;
      const works = NUM_TO_WORKS[num] ?? [];
      const wi = workIdx[num] % Math.max(works.length, 1);
      const [wname, shidouList] = works[wi] ?? ["作業", ["作業内容"]];
      const shidou = shidouList[workIdx[num] % Math.max(shidouList.length, 1)];
      workIdx[num]++;

      setCell(ws, `B${rowNum}`, wname, { size: 9, hAlign: "center", wrap: true, border: true });
      setCell(ws, `D${rowNum}`, num, { size: 9, hAlign: "center", border: true });
      setCell(ws, `E${rowNum}`, shidou, { size: 9, hAlign: "center", border: true });
      setCell(ws, `H${rowNum}`, supervisor, { size: 9, hAlign: "center", border: true });
    } else {
      setCell(ws, `B${rowNum}`, "休み", { size: 9, hAlign: "center", border: true });
      setCell(ws, `D${rowNum}`, null, { border: true });
      setCell(ws, `E${rowNum}`, null, { border: true });
      setCell(ws, `H${rowNum}`, null, { border: true });
    }
  }

  // ── 注意書き (行40〜43)
  const notesRow = 40;
  setCell(ws, `A${notesRow}`, "(注意)", { size: 8 });
  setCell(ws, `A${notesRow + 1}`, "　　　　1　技能実習の区分、技能実習の期間、技能実習生に行わせる業務等が異なる場合は、分けて作成すること。", { size: 8 });
  setCell(ws, `A${notesRow + 2}`, "　　　　2　技能実習生に従事させた業務の欄の右欄は、技能実習計画の実習実施予定表(別記様式第1号第4面から第6面まで)", { size: 8 });
  setCell(ws, `A${notesRow + 3}`, "　　　　　　の技能実習の内容欄の番号を記載すること。", { size: 8 });

  // 右側参照テーブルは印刷対象外のため書き込まない
}

// ─── DB から出勤データ取得 ──────────────────────────────────────
async function fetchAttendance(start: Date, end: Date) {
  const db = getDb();

  const [rows, leaveRows] = await Promise.all([
    db.select({
      clockInTime: attendanceRecords.clockInTime,
      employeeName: employeeMaster.name,
      employeeCode: employeeMaster.employeeId,
    })
      .from(attendanceRecords)
      .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
      .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
      .where(and(
        eq(attendanceRecords.status, "active"),
        gte(attendanceRecords.clockInTime, start.toISOString()),
        lte(attendanceRecords.clockInTime, end.toISOString()),
      )),

    db.select({
      requestDate: leaveRequests.requestDate,
      leaveType: leaveRequests.leaveType,
      employeeName: employeeMaster.name,
      employeeCode: employeeMaster.employeeId,
    })
      .from(leaveRequests)
      .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
      .where(and(
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, toJSTDateStr(start)),
        lte(leaveRequests.requestDate, toJSTDateStr(end)),
      )),
  ]);

  type EmpMonths = Map<string, { name: string; months: Map<string, Set<number>> }>;
  const empMap: EmpMonths = new Map();

  for (const r of rows) {
    if (!isTrainee(r.employeeName)) continue;
    const jst = toJSTDate(r.clockInTime);
    const ym = `${jst.getUTCFullYear()}-${jst.getUTCMonth() + 1}`;
    const day = jst.getUTCDate();
    if (!empMap.has(r.employeeCode)) empMap.set(r.employeeCode, { name: r.employeeName, months: new Map() });
    const emp = empMap.get(r.employeeCode)!;
    if (!emp.months.has(ym)) emp.months.set(ym, new Set());
    emp.months.get(ym)!.add(day);
  }

  for (const lr of leaveRows) {
    if (!isTrainee(lr.employeeName) || lr.leaveType !== "paid_leave") continue;
    const [y, m, d] = lr.requestDate.split("-").map(Number);
    const ym = `${y}-${m}`;
    if (!empMap.has(lr.employeeCode)) empMap.set(lr.employeeCode, { name: lr.employeeName, months: new Map() });
    const emp = empMap.get(lr.employeeCode)!;
    if (!emp.months.has(ym)) emp.months.set(ym, new Set());
    emp.months.get(ym)!.add(d);
  }

  return empMap;
}

// ─── ハンドラ ─────────────────────────────────────────────────
export async function handleDiaryExcelDownload(req: Request, res: Response): Promise<void> {
  const { startDate, endDate, supervisor = "中原" } = req.query as Record<string, string>;

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate と endDate は必須です" });
    return;
  }

  const start = new Date(startDate + "T00:00:00+09:00");
  const end   = new Date(endDate   + "T23:59:59+09:00");

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "日付形式が不正です (YYYY-MM-DD)" });
    return;
  }

  try {
    const empMap = await fetchAttendance(start, end);

    if (empMap.size === 0) {
      res.status(404).json({ error: "指定期間に対象実習生のデータがありません" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    let seed = 12345;

    for (const [, emp] of empMap) {
      for (const [ym, daySet] of emp.months) {
        const [year, month] = ym.split("-").map(Number);
        const workingDays = Array.from(daySet).sort((a, b) => a - b);
        if (workingDays.length === 0) continue;

        const shortName = emp.name.split(/\s+/)[0];
        const sheetName = `${year}.${month}_${shortName}`.slice(0, 31);
        const ws = wb.addWorksheet(sheetName);

        buildDiarySheet(ws, year, month, emp.name, workingDays, supervisor, seed++);
        console.log(`[diary-excel] ${sheetName}: ${workingDays.length}日`);
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `技能実習日誌_${startDate}_${endDate}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("[diary-excel]", err);
    res.status(500).json({ error: "Excel生成に失敗しました", detail: err?.message ?? String(err) });
  }
}
