import type { Request, Response } from "express";
import { spawn } from "child_process";
import { readFile, writeFile, unlink, copyFile, access } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { eq, and, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, leaveRequests } from "../../drizzle/schema";

const RUN_PY = join(process.cwd(), "run.py");
const DIARY_TEMPLATE = process.env.DIARY_TEMPLATE_PATH ?? join(process.cwd(), "日誌テンプレート.xlsx");

// ─── JST ユーティリティ ─────────────────────────────────────────
const JST_OFFSET = 9 * 60 * 60 * 1000;

function toJSTDate(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  return new Date(new Date(s).getTime() + JST_OFFSET);
}

function fmtDate(s: string | Date | null | undefined): string {
  const d = toJSTDate(s);
  if (!d) return "";
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtDateTime(s: string | Date | null | undefined): string {
  const d = toJSTDate(s);
  if (!d) return "";
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function toJSTDateStr(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

const minToHHMM = (m: number | null | undefined): string => {
  if (!m && m !== 0) return "-";
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  paid_leave: "有給休暇",
  substitute_holiday: "代休",
  special_leave: "特別休暇",
  holiday_request: "休日希望",
};

function jstBreakRange(clockIn: Date): { breakStart: Date; breakEnd: Date } {
  const jst = new Date(clockIn.getTime() + JST_OFFSET);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();
  return {
    breakStart: new Date(Date.UTC(y, mo, d, 3, 0, 0)),
    breakEnd:   new Date(Date.UTC(y, mo, d, 4, 0, 0)),
  };
}

function calcWorkingMinutes(clockIn: Date, clockOut: Date): number {
  const total = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const { breakStart, breakEnd } = jstBreakRange(clockIn);
  const overlap = Math.max(0, Math.min(clockOut.getTime(), breakEnd.getTime()) - Math.max(clockIn.getTime(), breakStart.getTime()));
  return Math.max(0, total - Math.floor(overlap / 60000));
}

// ─── DB → CSV 文字列 ───────────────────────────────────────────
async function buildCsvContent(start: Date, end: Date): Promise<string> {
  const db = getDb();
  const iso = (d: Date) => d.toISOString();
  const startStr = toJSTDateStr(start);
  const endStr   = toJSTDateStr(end);

  const [rows, leaveRows, allEmps] = await Promise.all([
    db.select({
      clockInTime: attendanceRecords.clockInTime,
      clockOutTime: attendanceRecords.clockOutTime,
      workReport: attendanceRecords.workReport,
      companionEmployeeIds: attendanceRecords.companionEmployeeIds,
      employeeName: employeeMaster.name,
      employeeCode: employeeMaster.employeeId,
      siteName: siteMaster.siteName,
      location: siteMaster.location,
    })
      .from(attendanceRecords)
      .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
      .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
      .where(and(
        eq(attendanceRecords.status, "active"),
        gte(attendanceRecords.clockInTime, iso(start)),
        lte(attendanceRecords.clockInTime, iso(end)),
      ))
      .orderBy(attendanceRecords.clockInTime),

    db.select({
      leaveType: leaveRequests.leaveType,
      requestDate: leaveRequests.requestDate,
      reason: leaveRequests.reason,
      employeeName: employeeMaster.name,
      employeeCode: employeeMaster.employeeId,
    })
      .from(leaveRequests)
      .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
      .where(and(
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startStr),
        lte(leaveRequests.requestDate, endStr),
      )),

    db.select({ id: employeeMaster.id, name: employeeMaster.name }).from(employeeMaster),
  ]);

  const empMap = new Map(allEmps.map(e => [e.id, e.name]));
  const resolveCompanions = (json: string | null | undefined) => {
    if (!json) return "";
    try { return (JSON.parse(json) as number[]).map(id => empMap.get(id) ?? `ID:${id}`).join("、"); }
    catch { return ""; }
  };

  type Row = { sortKey: string; cells: string[] };

  const atRows: Row[] = rows.map(r => {
    const wm = r.clockInTime && r.clockOutTime
      ? calcWorkingMinutes(new Date(r.clockInTime), new Date(r.clockOutTime))
      : null;
    return {
      sortKey: `${toJSTDateStr(new Date(r.clockInTime))}_${r.employeeCode}`,
      cells: [
        fmtDate(r.clockInTime), r.employeeCode, r.employeeName,
        r.siteName, r.location ?? "",
        fmtDateTime(r.clockInTime), fmtDateTime(r.clockOutTime) || "-",
        minToHHMM(wm),
        resolveCompanions(r.companionEmployeeIds),
        (r.workReport ?? "").replace(/,/g, "、").replace(/\n/g, " "),
        "",
      ],
    };
  });

  const lvRows: Row[] = leaveRows.map(lr => {
    const [y, m, d] = lr.requestDate.split("-");
    return {
      sortKey: `${lr.requestDate}_${lr.employeeCode}`,
      cells: [
        `${y}/${m}/${d}`, lr.employeeCode, lr.employeeName,
        "", "", "", "", "", "",
        (lr.reason ?? "").replace(/,/g, "、").replace(/\n/g, " "),
        LEAVE_TYPE_LABEL[lr.leaveType] ?? lr.leaveType,
      ],
    };
  });

  const header = ["日付","作業員コード","作業員名","現場名","所在地","出勤時刻","退勤時刻","実働時間","同行作業員","作業日報","種別"];
  const allRows = [...atRows, ...lvRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return [header, ...allRows.map(r => r.cells)]
    .map(row => row.map(cell => `"${cell}"`).join(","))
    .join("\n");
}

// ─── Python 実行 ───────────────────────────────────────────────
function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", args);
    let out = "", err = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`Python exited ${code}\n${err}`));
    });
    proc.on("error", reject);
  });
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
    await access(DIARY_TEMPLATE);
  } catch {
    res.status(500).json({ error: `テンプレートが見つかりません: ${DIARY_TEMPLATE}` });
    return;
  }

  const tempId    = randomBytes(8).toString("hex");
  const tempCsv   = join(tmpdir(), `diary_${tempId}.csv`);
  const tempXlsx  = join(tmpdir(), `diary_${tempId}.xlsx`);

  try {
    const csv = await buildCsvContent(start, end);
    await writeFile(tempCsv, "﻿" + csv, "utf-8");
    await copyFile(DIARY_TEMPLATE, tempXlsx);

    const log = await runPython([RUN_PY, tempCsv, "--excel", tempXlsx, "--supervisor", supervisor]);
    console.log("[diary-excel]", log.trim());

    const buf = await readFile(tempXlsx);
    const filename = `技能実習日誌_${startDate}_${endDate}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (err) {
    console.error("[diary-excel]", err);
    if (!res.headersSent) res.status(500).json({ error: "Excel生成に失敗しました" });
  } finally {
    await unlink(tempCsv).catch(() => {});
    await unlink(tempXlsx).catch(() => {});
  }
}
