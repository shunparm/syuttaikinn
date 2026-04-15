import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

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
      const start = new Date(input.startDate); start.setHours(0,0,0,0);
      const end = new Date(input.endDate); end.setHours(23,59,59,999);
      const conditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (input.employeeId) conditions.push(eq(attendanceRecords.employeeId, input.employeeId));
      const rows = await db.select({
        id: attendanceRecords.id, clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
        workReport: attendanceRecords.workReport,
        companionEmployeeIds: attendanceRecords.companionEmployeeIds,
        employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
        siteName: siteMaster.siteName, siteCode: siteMaster.siteId, location: siteMaster.location,
      }).from(attendanceRecords)
        .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .where(and(...conditions)).orderBy(attendanceRecords.clockInTime);

      // workingMinutes をDB保存値ではなく clockIn/clockOut から都度再計算
      const rowsWithMinutes = rows.map(r => ({
        ...r,
        workingMinutes: computeWorkingMinutes(r.clockInTime, r.clockOutTime),
      }));

      const summaryMap = new Map<string, {
        employeeName: string; employeeCode: string;
        totalWorkingMinutes: number; totalAttendanceDays: Set<string>;
        records: typeof rowsWithMinutes;
      }>();
      for (const row of rowsWithMinutes) {
        if (!summaryMap.has(row.employeeCode))
          summaryMap.set(row.employeeCode, { employeeName: row.employeeName, employeeCode: row.employeeCode, totalWorkingMinutes: 0, totalAttendanceDays: new Set(), records: [] });
        const e = summaryMap.get(row.employeeCode)!;
        e.totalWorkingMinutes += row.workingMinutes ?? 0;
        e.totalAttendanceDays.add(fmtDate(row.clockInTime)); // JST基準の日付でグループ化
        e.records.push(row);
      }
      const summaries = Array.from(summaryMap.values()).map(s => ({
        employeeName: s.employeeName, employeeCode: s.employeeCode,
        totalWorkingMinutes: s.totalWorkingMinutes,
        totalWorkingHours: minToHHMM(s.totalWorkingMinutes),
        totalAttendanceDays: s.totalAttendanceDays.size,
        records: s.records,
      }));
      return { rows: rowsWithMinutes, summaries };
    }),

  generateCsvString: publicProcedure
    .input(z.object({ startDate: z.date(), endDate: z.date(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const start = new Date(input.startDate); start.setHours(0,0,0,0);
      const end = new Date(input.endDate); end.setHours(23,59,59,999);
      const conditions: any[] = [eq(attendanceRecords.status, "active"), gte(attendanceRecords.clockInTime, iso(start)), lte(attendanceRecords.clockInTime, iso(end))];
      if (input.employeeId) conditions.push(eq(attendanceRecords.employeeId, input.employeeId));
      const [rows, allEmpRows] = await Promise.all([
        db.select({
          clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime,
          workReport: attendanceRecords.workReport, companionEmployeeIds: attendanceRecords.companionEmployeeIds,
          employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
          siteName: siteMaster.siteName, location: siteMaster.location,
        }).from(attendanceRecords)
          .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
          .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
          .where(and(...conditions)).orderBy(attendanceRecords.clockInTime),
        db.select({ id: employeeMaster.id, name: employeeMaster.name }).from(employeeMaster),
      ]);
      const empMap = new Map(allEmpRows.map(e => [e.id, e.name]));
      const resolveCompanions = (json: string | null | undefined) => {
        if (!json) return "";
        try { return (JSON.parse(json) as number[]).map(id => empMap.get(id) ?? `ID:${id}`).join("、"); }
        catch { return ""; }
      };
      const header = ["日付","作業員コード","作業員名","現場名","所在地","出勤時刻","退勤時刻","実働時間","同行作業員","作業日報"];
      const csvRows = rows.map(r => {
        const wm = computeWorkingMinutes(r.clockInTime, r.clockOutTime);
        return [
          fmtDate(r.clockInTime),
          r.employeeCode,
          r.employeeName,
          r.siteName,
          r.location ?? "",
          fmtDateTime(r.clockInTime),
          fmtDateTime(r.clockOutTime) || "-",
          minToHHMM(wm),
          resolveCompanions(r.companionEmployeeIds),
          (r.workReport ?? "").replace(/,/g,"、").replace(/\n/g," "),
        ];
      });
      const csvContent = [header, ...csvRows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      return { csv: "\uFEFF" + csvContent };
    }),
});
