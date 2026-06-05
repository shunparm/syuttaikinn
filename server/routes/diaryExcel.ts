import type { Request, Response } from "express";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { eq, and, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, leaveRequests } from "../../drizzle/schema";

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

// ─── training_content.json を読み込んで NUM_TO_WORKS を構築 ─────
function loadNumToWorks(): Record<number, Array<[string, string[]]>> {
  const jsonPath = join(process.cwd(), "training_content.json");
  if (!existsSync(jsonPath)) return FALLBACK_WORKS;
  try {
    const db = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const entries = db.entries ?? {};
    const result: Record<number, Array<[string, string[]]>> = {};
    for (let num = 1; num <= 6; num++) {
      const worksDict: Record<string, Record<string, number>> = entries[String(num)] ?? {};
      if (Object.keys(worksDict).length === 0) {
        result[num] = FALLBACK_WORKS[num] ?? [];
        continue;
      }
      const sorted = Object.entries(worksDict).sort(
        ([, a], [, b]) => Object.values(b).reduce((s, v) => s + v, 0) - Object.values(a).reduce((s, v) => s + v, 0)
      );
      result[num] = sorted.map(([w, gs]) => [
        w,
        Object.entries(gs).sort(([, a], [, b]) => b - a).map(([g]) => g),
      ]);
    }
    return result;
  } catch {
    return FALLBACK_WORKS;
  }
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
    alloc[1] += nDays - totalMin;
  } else if (nDays > 0) {
    const deficit = totalMin - nDays;
    const take1 = Math.min(deficit, alloc[1] - 1);
    alloc[1] -= take1;
  }
  return alloc;
}

function shuffleNoTriple(arr: number[], seed: number): number[] {
  const rng = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0x100000000; }; })();
  const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (let t = 0; t < 200; t++) {
    shuffle(arr);
    if (arr.every((v, i) => i < 2 || !(v === arr[i - 1] && v === arr[i - 2]))) return arr;
  }
  return arr;
}

// ─── 日誌シート生成（exceljs）───────────────────────────────────
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDiarySheet(
  ws: ExcelJS.Worksheet,
  year: number,
  month: number,
  employeeName: string,
  workingDays: number[],
  supervisor: string,
  seed: number,
) {
  // ヘッダー
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "技能実習日誌";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getCell("D5").value = `（　　　${year}　　年　　${month}　　月分）`;
  ws.getCell("E6").value = `　　　　　　氏名　${employeeName}`;

  // 列ヘッダー（行8）
  const colHeaders = ["年月日", "業務内容", "", "番号", "指導内容", "", "", "確認欄"];
  ws.getRow(8).values = ["", ...colHeaders];
  ws.getRow(8).font = { bold: true };
  ws.getRow(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

  // 番号シーケンスを生成
  const alloc = allocateDays(workingDays.length, month);
  const numSeq: number[] = [];
  for (const [num, cnt] of Object.entries(alloc)) numSeq.push(...Array(cnt).fill(Number(num)));
  shuffleNoTriple(numSeq, seed);

  const workIdx: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const totalDays = daysInMonth(year, month);

  for (let day = 1; day <= 31; day++) {
    const row = 8 + day; // day1 → row9
    if (day > totalDays) {
      ws.getRow(row).values = [];
      continue;
    }

    const dateVal = new Date(year, month - 1, day);
    const dateStr = `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;

    if (workingDays.includes(day)) {
      const seqIdx = workingDays.indexOf(day);
      const num = numSeq[seqIdx] ?? 1;
      const works = NUM_TO_WORKS[num] ?? [];
      const wi = workIdx[num] % Math.max(works.length, 1);
      const [wname, shidouList] = works[wi] ?? ["作業", ["作業内容"]];
      const shidou = shidouList[workIdx[num] % Math.max(shidouList.length, 1)];
      workIdx[num]++;

      ws.getRow(row).values = ["", dateStr, wname, "", num, shidou, "", "", supervisor];
    } else {
      ws.getRow(row).values = ["", dateStr, "休み", "", "", "", "", "", ""];
    }

    // 罫線
    for (let c = 2; c <= 9; c++) {
      ws.getRow(row).getCell(c).border = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    }
  }

  // 列幅
  ws.columns = [
    { width: 2 },  // A
    { width: 14 }, // B 年月日
    { width: 30 }, // C 業務内容
    { width: 4 },  // D
    { width: 6 },  // E 番号
    { width: 24 }, // F 指導内容
    { width: 4 },  // G
    { width: 4 },  // H
    { width: 10 }, // I 確認欄
  ];
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

  // 従業員別・月別に出勤日をまとめる
  type EmpMonths = Map<string, { name: string; months: Map<string, Set<number>> }>;
  const empMap: EmpMonths = new Map();

  for (const r of rows) {
    const jst = toJSTDate(r.clockInTime);
    const ym = `${jst.getUTCFullYear()}-${jst.getUTCMonth() + 1}`;
    const day = jst.getUTCDate();
    const code = r.employeeCode;
    if (!empMap.has(code)) empMap.set(code, { name: r.employeeName, months: new Map() });
    const emp = empMap.get(code)!;
    if (!emp.months.has(ym)) emp.months.set(ym, new Set());
    emp.months.get(ym)!.add(day);
  }

  for (const lr of leaveRows) {
    if (lr.leaveType !== "paid_leave") continue;
    const [y, m, d] = lr.requestDate.split("-").map(Number);
    const ym = `${y}-${m}`;
    const code = lr.employeeCode;
    if (!empMap.has(code)) empMap.set(code, { name: lr.employeeName, months: new Map() });
    const emp = empMap.get(code)!;
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
      res.status(404).json({ error: "指定期間に出勤データがありません" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    let seed = Date.now();

    for (const [code, emp] of empMap) {
      for (const [ym, daySet] of emp.months) {
        const [year, month] = ym.split("-").map(Number);
        const workingDays = Array.from(daySet).sort((a, b) => a - b);
        if (workingDays.length === 0) continue;

        const shortName = emp.name.split(/\s+/)[0];
        const sheetName = `${year}.${month}_${shortName}`.slice(0, 31);
        const ws = wb.addWorksheet(sheetName);

        buildDiarySheet(ws, year, month, emp.name, workingDays, supervisor, seed++);
        console.log(`[diary-excel] generated: ${sheetName} (${workingDays.length}日)`);
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
