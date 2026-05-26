import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, leaveRequests } from "../../drizzle/schema";

const iso = (d: Date) => d.toISOString();

// ─── JST変換ユーティリティ ───────────────────────────────────────
const JST_OFFSET = 9 * 60 * 60 * 1000;

function toJSTDate(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  return new Date(new Date(s).getTime() + JST_OFFSET);
}

// "YYYY/MM/DD"（JST基準）
function fmtDate(s: string | Date | null | undefined): string {
  const d = toJSTDate(s);
  if (!d) return "";
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}`;
}

// "YYYY/MM/DD HH:mm"（JST基準）
function fmtDateTime(s: string | Date | null | undefined): string {
  const d = toJSTDate(s);
  if (!d) return "";
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

const minToHHMM = (m: number | null | undefined): string => {
  if (!m && m !== 0) return "-";
  return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`;
};

// "YYYY-MM-DD"（JST基準）― leave_requests の requestDate と比較用
function toJSTDateStr(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth()+1).padStart(2,"0")}-${String(jst.getUTCDate()).padStart(2,"0")}`;
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  paid_leave: "有給休暇",
  substitute_holiday: "代休",
  special_leave: "特別休暇",
  holiday_request: "休日希望",
};

// ─── 実働時間計算（JST 12:00〜13:00 の重複分を差し引く）─────────
function jstBreakRange(clockIn: Date): { breakStart: Date; breakEnd: Date } {
  const jst = new Date(clockIn.getTime() + JST_OFFSET);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();
  return {
    breakStart: new Date(Date.UTC(y, mo, d, 3, 0, 0)),  // UTC 03:00 = JST 12:00
    breakEnd:   new Date(Date.UTC(y, mo, d, 4, 0, 0)),  // UTC 04:00 = JST 13:00
  };
}

function calcWorkingMinutes(clockIn: Date, clockOut: Date): number {
  const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const { breakStart, breakEnd } = jstBreakRange(clockIn);
  const overlapMs = Math.max(0, Math.min(clockOut.getTime(), breakEnd.getTime()) - Math.max(clockIn.getTime(), breakStart.getTime()));
  return Math.max(0, totalMinutes - Math.floor(overlapMs / 60000));
}

function computeWorkingMinutes(clockInStr: string | null | undefined, clockOutStr: string | null | undefined): number | null {
  if (!clockInStr || !clockOutStr) return null;
  return calcWorkingMinutes(new Date(clockInStr), new Date(clockOutStr));
}

export const exportRouter = router({
  getExportData: publicProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (input.employeeId) atConditions.push(eq(attendanceRecords.employeeId, input.employeeId));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (input.employeeId) leaveConditions.push(eq(leaveRequests.employeeId, input.employeeId));

      const [rows, leaveRows] = await Promise.all([
        db.select({
          id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
          workReport: attendanceRecords.workReport,
          companionEmployeeIds: attendanceRecords.companionEmployeeIds,
          employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
          siteName: siteMaster.siteName, siteCode: siteMaster.siteId, location: siteMaster.location,
        }).from(attendanceRecords)
          .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
          .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
          .where(and(...atConditions)).orderBy(attendanceRecords.clockInTime),
        db.select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          leaveType: leaveRequests.leaveType,
          requestDate: leaveRequests.requestDate,
          reason: leaveRequests.reason,
          employeeName: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
        }).from(leaveRequests)
          .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
          .where(and(...leaveConditions))
          .orderBy(leaveRequests.requestDate),
      ]);

      const rowsWithMinutes = rows.map(r => ({
        ...r,
        workingMinutes: computeWorkingMinutes(r.clockInTime, r.clockOutTime),
      }));

      const summaryMap = new Map<string, {
        employeeName: string; employeeCode: string;
        totalWorkingMinutes: number; totalAttendanceDays: Set<string>;
        totalLeaveDays: number;
        records: typeof rowsWithMinutes;
      }>();

      const ensureSummary = (code: string, name: string) => {
        if (!summaryMap.has(code))
          summaryMap.set(code, { employeeName: name, employeeCode: code, totalWorkingMinutes: 0, totalAttendanceDays: new Set(), totalLeaveDays: 0, records: [] });
        return summaryMap.get(code)!;
      };

      for (const row of rowsWithMinutes) {
        const e = ensureSummary(row.employeeCode, row.employeeName);
        e.totalWorkingMinutes += row.workingMinutes ?? 0;
        e.totalAttendanceDays.add(fmtDate(row.clockInTime));
        e.records.push(row);
      }
      for (const lr of leaveRows) {
        const e = ensureSummary(lr.employeeCode, lr.employeeName);
        e.totalLeaveDays += 1;
      }

      const summaries = Array.from(summaryMap.values()).map(s => ({
        employeeName: s.employeeName, employeeCode: s.employeeCode,
        totalWorkingMinutes: s.totalWorkingMinutes,
        totalWorkingHours: minToHHMM(s.totalWorkingMinutes),
        totalAttendanceDays: s.totalAttendanceDays.size,
        totalLeaveDays: s.totalLeaveDays,
        records: s.records,
      })).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true }));

      return { rows: rowsWithMinutes, summaries, leaveRows };
    }),

  generateCsvString: publicProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (input.employeeId) atConditions.push(eq(attendanceRecords.employeeId, input.employeeId));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (input.employeeId) leaveConditions.push(eq(leaveRequests.employeeId, input.employeeId));

      const [rows, leaveRows, allEmpRows] = await Promise.all([
        db.select({
          clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
          workReport: attendanceRecords.workReport, companionEmployeeIds: attendanceRecords.companionEmployeeIds,
          employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
          siteName: siteMaster.siteName, location: siteMaster.location,
        }).from(attendanceRecords)
          .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
          .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
          .where(and(...atConditions)).orderBy(attendanceRecords.clockInTime),
        db.select({
          leaveType: leaveRequests.leaveType,
          requestDate: leaveRequests.requestDate,
          reason: leaveRequests.reason,
          employeeName: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
        }).from(leaveRequests)
          .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
          .where(and(...leaveConditions)),
        db.select({ id: employeeMaster.id, name: employeeMaster.name }).from(employeeMaster),
      ]);

      const empMap = new Map(allEmpRows.map(e => [e.id, e.name]));
      const resolveCompanions = (json: string | null | undefined) => {
        if (!json) return "";
        try { return (JSON.parse(json) as number[]).map(id => empMap.get(id) ?? `ID:${id}`).join("、"); }
        catch { return ""; }
      };

      const header = ["日付","作業員コード","作業員名","現場名","所在地","出勤時刻","退勤時刻","実働時間","同行作業員","作業日報","種別"];

      type SortableRow = { sortKey: string; cells: string[] };

      const atRows: SortableRow[] = rows.map(r => {
        const wm = computeWorkingMinutes(r.clockInTime, r.clockOutTime);
        return {
          sortKey: `${toJSTDateStr(new Date(r.clockInTime))}_${r.employeeCode}`,
          cells: [
            fmtDate(r.clockInTime), r.employeeCode, r.employeeName,
            r.siteName, r.location ?? "",
            fmtDateTime(r.clockInTime), fmtDateTime(r.clockOutTime) || "-",
            minToHHMM(wm),
            resolveCompanions(r.companionEmployeeIds),
            (r.workReport ?? "").replace(/,/g,"、").replace(/\n/g," "),
            "",
          ],
        };
      });

      const lvRows: SortableRow[] = leaveRows.map(lr => {
        const [y, m, d] = lr.requestDate.split("-");
        const label = LEAVE_TYPE_LABEL[lr.leaveType] ?? lr.leaveType;
        return {
          sortKey: `${lr.requestDate}_${lr.employeeCode}`,
          cells: [
            `${y}/${m}/${d}`, lr.employeeCode, lr.employeeName,
            "", "", "", "", "", "",
            (lr.reason ?? "").replace(/,/g,"、").replace(/\n/g," "),
            label,
          ],
        };
      });

      const allRows = [...atRows, ...lvRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const csvContent = [header, ...allRows.map(r => r.cells)].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      return { csv: "﻿" + csvContent };
    }),

  // 給与計算システム用CSV（Sheet4：出退勤入力 形式）
  generatePayrollCsvString: publicProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (input.employeeId) atConditions.push(eq(attendanceRecords.employeeId, input.employeeId));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (input.employeeId) leaveConditions.push(eq(leaveRequests.employeeId, input.employeeId));

      const [rows, leaveRows] = await Promise.all([
        db.select({
          clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
          workingMinutes: attendanceRecords.workingMinutes,
          employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
          siteName: siteMaster.siteName, siteCode: siteMaster.siteId,
        }).from(attendanceRecords)
          .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
          .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
          .where(and(...atConditions)).orderBy(attendanceRecords.clockInTime),
        db.select({
          leaveType: leaveRequests.leaveType,
          requestDate: leaveRequests.requestDate,
          employeeName: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
        }).from(leaveRequests)
          .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
          .where(and(...leaveConditions)),
      ]);

      // 残業時間計算（8時間=480分超の分）
      const calcOvertime = (wm: number | null | undefined): string => {
        if (!wm || wm <= 480) return "0";
        return ((wm - 480) / 60).toFixed(2).replace(/\.?0+$/, "");
      };

      // 時刻を HH:MM（JST）で返す
      const fmtTime = (s: string | null | undefined): string => {
        const d = toJSTDate(s);
        if (!d) return "";
        return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
      };

      const LEAVE_ATTENDANCE_TYPE: Record<string, string> = {
        paid_leave: "有給",
        substitute_holiday: "代休",
        special_leave: "特休",
        holiday_request: "休日希望",
      };

      // 実働時間を時間単位（小数）で返す
      const fmtHours = (minutes: number | null | undefined): string => {
        if (!minutes && minutes !== 0) return "";
        const h = minutes / 60;
        return h % 1 === 0 ? String(h) : h.toFixed(2).replace(/0+$/, "");
      };

      const header = ["日付","社員ID","氏名","区分","出勤区分","現場コード","現場名","出勤時刻","退勤時刻","残業時間(h)","遅刻早退(h)","備考","実働時間(h)"];

      type SortableRow = { sortKey: string; cells: string[] };

      const atRows: SortableRow[] = rows.map(r => {
        const wm = r.workingMinutes ?? computeWorkingMinutes(r.clockInTime, r.clockOutTime);
        return {
          sortKey: `${toJSTDateStr(new Date(r.clockInTime))}_${r.employeeCode}`,
          cells: [
            fmtDate(r.clockInTime),   // A: 日付
            r.employeeCode,            // B: 社員ID
            r.employeeName,            // C: 氏名
            "",                        // D: 区分
            "○",                      // E: 出勤区分
            r.siteCode,               // F: 現場コード
            r.siteName,               // G: 現場名
            fmtTime(r.clockInTime),   // H: 出勤時刻
            fmtTime(r.clockOutTime),  // I: 退勤時刻
            calcOvertime(wm),          // J: 残業時間(h)
            "0",                       // K: 遅刻早退(h)
            "",                        // L: 備考
            fmtHours(wm),             // M: 実働時間(h)
          ],
        };
      });

      const lvRows: SortableRow[] = leaveRows.map(lr => {
        const [y, m, d] = lr.requestDate.split("-");
        return {
          sortKey: `${lr.requestDate}_${lr.employeeCode}`,
          cells: [
            `${y}/${m}/${d}`,                                    // A: 日付
            lr.employeeCode,                                      // B: 社員ID
            lr.employeeName,                                      // C: 氏名
            "",                                                   // D: 区分
            LEAVE_ATTENDANCE_TYPE[lr.leaveType] ?? lr.leaveType, // E: 出勤区分
            "",                                                   // F: 現場コード
            "",                                                   // G: 現場名
            "",                                                   // H: 出勤時刻
            "",                                                   // I: 退勤時刻
            "0",                                                  // J: 残業時間(h)
            "0",                                                  // K: 遅刻早退(h)
            "",                                                   // L: 備考
            "0",                                                  // M: 実働時間(h)
          ],
        };
      });

      const allRows = [...atRows, ...lvRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const csvContent = [header, ...allRows.map(r => r.cells)].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      return { csv: "﻿" + csvContent };
    }),
});
