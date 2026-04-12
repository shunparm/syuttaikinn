import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

const iso = (d: Date) => d.toISOString();
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
const fmtDateTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const minToHHMM = (m: number | null | undefined) => { if (!m) return "0:00"; return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`; };

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
        workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes,
        companionEmployeeIds: attendanceRecords.companionEmployeeIds,
        employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId,
        siteName: siteMaster.siteName, siteCode: siteMaster.siteId, location: siteMaster.location,
      }).from(attendanceRecords)
        .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
        .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
        .where(and(...conditions)).orderBy(attendanceRecords.clockInTime);
      const summaryMap = new Map<string, { employeeName: string; employeeCode: string; totalWorkingMinutes: number; totalAttendanceDays: Set<string>; records: typeof rows }>();
      for (const row of rows) {
        if (!summaryMap.has(row.employeeCode)) summaryMap.set(row.employeeCode, { employeeName: row.employeeName, employeeCode: row.employeeCode, totalWorkingMinutes: 0, totalAttendanceDays: new Set(), records: [] });
        const e = summaryMap.get(row.employeeCode)!;
        e.totalWorkingMinutes += row.workingMinutes ?? 0;
        e.totalAttendanceDays.add(fmtDate(row.clockInTime));
        e.records.push(row);
      }
      const summaries = Array.from(summaryMap.values()).map(s => ({ employeeName: s.employeeName, employeeCode: s.employeeCode, totalWorkingMinutes: s.totalWorkingMinutes, totalWorkingHours: minToHHMM(s.totalWorkingMinutes), totalAttendanceDays: s.totalAttendanceDays.size, records: s.records }));
      return { rows, summaries };
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
        db.select({ clockInTime: attendanceRecords.clockInTime, clockOutTime: attendanceRecords.clockOutTime, workReport: attendanceRecords.workReport, workingMinutes: attendanceRecords.workingMinutes, companionEmployeeIds: attendanceRecords.companionEmployeeIds, employeeName: employeeMaster.name, employeeCode: employeeMaster.employeeId, siteName: siteMaster.siteName, location: siteMaster.location })
          .from(attendanceRecords).innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id)).innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id)).where(and(...conditions)).orderBy(attendanceRecords.clockInTime),
        db.select({ id: employeeMaster.id, name: employeeMaster.name }).from(employeeMaster),
      ]);
      const empMap = new Map(allEmpRows.map(e => [e.id, e.name]));
      const resolveCompanions = (json: string | null | undefined) => { if (!json) return ""; try { return (JSON.parse(json) as number[]).map(id => empMap.get(id) ?? `ID:${id}`).join("、"); } catch { return ""; } };
      const header = ["日付","作業員コード","作業員名","現場名","所在地","出勤時刻","退勤時刻","実働時間","同行作業員","作業日報"];
      const csvRows = rows.map(r => [fmtDate(r.clockInTime), r.employeeCode, r.employeeName, r.siteName, r.location ?? "", fmtDateTime(r.clockInTime), fmtDateTime(r.clockOutTime), minToHHMM(r.workingMinutes), resolveCompanions(r.companionEmployeeIds), (r.workReport ?? "").replace(/,/g,"、").replace(/\n/g," ")]);
      const csvContent = [header, ...csvRows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      return { csv: "\uFEFF" + csvContent };
    }),
});
