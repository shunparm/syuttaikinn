import { z } from "zod";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, leaveRequests } from "../../drizzle/schema";
import { JST_OFFSET, toJSTDateStr, calcWorkingMinutes } from "../utils/time";

const iso = (d: Date) => d.toISOString();

function toJSTDate(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  return new Date(new Date(s).getTime() + JST_OFFSET);
}

const DOW_JA = ["（日）", "（月）", "（火）", "（水）", "（木）", "（金）", "（土）"];

// "YYYY-MM-DD" 文字列から曜日インデックスを取得（タイムゾーン非依存）
function dowFromDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DOW_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// "YYYY/MM/DD（曜）"（JST基準）
function fmtDate(s: string | Date | null | undefined): string {
  const d = toJSTDate(s);
  if (!d) return "";
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}${dowFromDateStr(dateStr)}`;
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

const LEAVE_TYPE_LABEL: Record<string, string> = {
  paid_leave: "有給休暇",
  substitute_holiday: "代休",
  special_leave: "特別休暇",
  holiday_request: "休日希望",
};

function computeWorkingMinutes(clockInStr: string | null | undefined, clockOutStr: string | null | undefined): number | null {
  if (!clockInStr || !clockOutStr) return null;
  return calcWorkingMinutes(new Date(clockInStr), new Date(clockOutStr));
}

// ─── 月次サマリー ────────────────────────────────────────────────
export const exportRouter = router({
  getMonthlySummary: adminProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const { year, month } = input;

      // 月の開始・終了をJST基準のUTCに変換
      const startUTC = new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET);
      const endUTC   = new Date(Date.UTC(year, month,     1) - JST_OFFSET);
      const startDateStr = `${year}-${String(month).padStart(2,"0")}-01`;
      const endDateStr   = new Date(Date.UTC(year, month, 0))
        .toISOString().slice(0, 10);  // 月末日 YYYY-MM-DD

      const [atRows, lvRows, employees] = await Promise.all([
        db.select({
          clockInTime: attendanceRecords.clockInTime,
          clockOutTime: attendanceRecords.clockOutTime,
          workingMinutes: attendanceRecords.workingMinutes,
          employeeId: attendanceRecords.employeeId,
          employeeName: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
          employmentType: employeeMaster.employmentType,
        }).from(attendanceRecords)
          .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
          .where(and(
            eq(attendanceRecords.status, "active"),
            gte(attendanceRecords.clockInTime, startUTC.toISOString()),
            lte(attendanceRecords.clockInTime, endUTC.toISOString()),
          )),

        db.select({
          employeeId: leaveRequests.employeeId,
          leaveType: leaveRequests.leaveType,
          employeeName: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
          employmentType: employeeMaster.employmentType,
        }).from(leaveRequests)
          .innerJoin(employeeMaster, eq(leaveRequests.employeeId, employeeMaster.id))
          .where(and(
            eq(leaveRequests.status, "approved"),
            gte(leaveRequests.requestDate, startDateStr),
            lte(leaveRequests.requestDate, endDateStr),
          )),

        db.select({
          id: employeeMaster.id,
          name: employeeMaster.name,
          employeeCode: employeeMaster.employeeId,
          employmentType: employeeMaster.employmentType,
          isActive: employeeMaster.isActive,
        }).from(employeeMaster)
          .where(eq(employeeMaster.isActive, true)),
      ]);

      type EmpSummary = {
        employeeCode: string;
        employeeName: string;
        employmentType: string | null;
        attendanceDays: Set<string>;
        totalWorkingMinutes: number;
        overtimeMinutes: number;
        leaveCount: Record<string, number>;
      };

      const map = new Map<number, EmpSummary>();

      const ensure = (empId: number, code: string, name: string, empType: string | null) => {
        if (!map.has(empId))
          map.set(empId, {
            employeeCode: code,
            employeeName: name,
            employmentType: empType,
            attendanceDays: new Set(),
            totalWorkingMinutes: 0,
            overtimeMinutes: 0,
            leaveCount: { paid_leave: 0, substitute_holiday: 0, special_leave: 0, holiday_request: 0 },
          });
        return map.get(empId)!;
      };

      for (const r of atRows) {
        const e = ensure(r.employeeId, r.employeeCode, r.employeeName, r.employmentType);
        const wm = r.workingMinutes ?? computeWorkingMinutes(r.clockInTime, r.clockOutTime) ?? 0;
        const dayStr = toJSTDateStr(new Date(r.clockInTime));
        e.attendanceDays.add(dayStr);
        e.totalWorkingMinutes += wm;
        if (wm > 480) e.overtimeMinutes += wm - 480;
      }

      for (const lv of lvRows) {
        const e = ensure(lv.employeeId, lv.employeeCode, lv.employeeName, lv.employmentType);
        if (lv.leaveType in e.leaveCount) e.leaveCount[lv.leaveType]++;
      }

      // 在籍中だが出勤・休暇ゼロの社員も含める
      for (const emp of employees) {
        ensure(emp.id, emp.employeeCode, emp.name, emp.employmentType);
      }

      const summaries = Array.from(map.values()).map(e => ({
        employeeCode:        e.employeeCode,
        employeeName:        e.employeeName,
        employmentType:      e.employmentType ?? "日給",
        attendanceDays:      e.attendanceDays.size,
        totalWorkingMinutes: e.totalWorkingMinutes,
        overtimeMinutes:     e.overtimeMinutes,
        paidLeaveDays:       e.leaveCount.paid_leave,
        substituteDays:      e.leaveCount.substitute_holiday,
        specialLeaveDays:    e.leaveCount.special_leave,
        holidayRequestDays:  e.leaveCount.holiday_request,
      })).sort((a, b) =>
        a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true })
      );

      const totalAttendanceDays  = summaries.reduce((s, e) => s + e.attendanceDays, 0);
      const totalWorkingMinutes  = summaries.reduce((s, e) => s + e.totalWorkingMinutes, 0);
      const totalLeaveDays       = summaries.reduce((s, e) => s + e.paidLeaveDays + e.substituteDays + e.specialLeaveDays, 0);
      const activeEmployeeCount  = summaries.filter(e => e.attendanceDays > 0 || e.paidLeaveDays > 0 || e.substituteDays > 0).length;

      return {
        summaries,
        totals: { totalAttendanceDays, totalWorkingMinutes, totalLeaveDays, activeEmployeeCount },
      };
    }),


  getExportData: adminProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeIds: z.number().array().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);
      const ids = input.employeeIds?.length ? input.employeeIds : undefined;

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (ids) atConditions.push(inArray(attendanceRecords.employeeId, ids));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (ids) leaveConditions.push(inArray(leaveRequests.employeeId, ids));

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

  generateCsvString: adminProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeIds: z.number().array().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);
      const ids = input.employeeIds?.length ? input.employeeIds : undefined;

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (ids) atConditions.push(inArray(attendanceRecords.employeeId, ids));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (ids) leaveConditions.push(inArray(leaveRequests.employeeId, ids));

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
        const dow = dowFromDateStr(lr.requestDate);
        return {
          sortKey: `${lr.requestDate}_${lr.employeeCode}`,
          cells: [
            `${y}/${m}/${d}${dow}`, lr.employeeCode, lr.employeeName,
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
  generatePayrollCsvString: adminProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeIds: z.number().array().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = input.startDate;
      const end   = input.endDate;
      const startDateStr = toJSTDateStr(start);
      const endDateStr   = toJSTDateStr(end);
      const ids = input.employeeIds?.length ? input.employeeIds : undefined;

      const atConditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (ids) atConditions.push(inArray(attendanceRecords.employeeId, ids));

      const leaveConditions: any[] = [
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.requestDate, startDateStr),
        lte(leaveRequests.requestDate, endDateStr),
      ];
      if (ids) leaveConditions.push(inArray(leaveRequests.employeeId, ids));

      const [rows, leaveRows] = await Promise.all([
        db.select({
          clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
          workingMinutes: attendanceRecords.workingMinutes,
          employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
          standardWorkMinutes: employeeMaster.standardWorkMinutes,
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

      // 遅刻早退計算: 実働が所定勤務時間に満たない分をマイナスの時間で返す
      // 実働が取得できない日（打刻漏れ・勤務進行中）は誤ったマイナスを防ぐため 0
      const calcLateEarly = (wm: number | null | undefined, standardMinutes: number | null | undefined): string => {
        if (wm === null || wm === undefined || !Number.isFinite(wm)) return "0";
        const std = standardMinutes ?? 480;
        if (wm >= std) return "0";
        return ((wm - std) / 60).toFixed(2).replace(/\.?0+$/, "");
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
            calcLateEarly(wm, r.standardWorkMinutes), // K: 遅刻早退(h)（所定未満はマイナス）
            "",                        // L: 備考
            fmtHours(wm),             // M: 実働時間(h)
          ],
        };
      });

      const lvRows: SortableRow[] = leaveRows.map(lr => {
        const [y, m, d] = lr.requestDate.split("-");
        const dow = dowFromDateStr(lr.requestDate);
        return {
          sortKey: `${lr.requestDate}_${lr.employeeCode}`,
          cells: [
            `${y}/${m}/${d}${dow}`,                              // A: 日付
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
