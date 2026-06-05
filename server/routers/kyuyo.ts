import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

// ─── JST ユーティリティ ──────────────────────────────────────────
const JST = 9 * 60 * 60 * 1000;

function toJST(d: Date): Date {
  return new Date(d.getTime() + JST);
}

function toJSTDateStr(d: Date): string {
  const j = toJST(d);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}

// ─── 実働時間計算（昼休憩12:00〜13:00 JSTを除く）────────────────
function calcWorkingMinutes(clockIn: Date, clockOut: Date): number {
  const total = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const jst = toJST(clockIn);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();
  const breakStart = new Date(Date.UTC(y, mo, d, 3, 0));  // 12:00 JST
  const breakEnd   = new Date(Date.UTC(y, mo, d, 4, 0));  // 13:00 JST
  const overlap = Math.max(0,
    Math.min(clockOut.getTime(), breakEnd.getTime()) -
    Math.max(clockIn.getTime(), breakStart.getTime())
  );
  return Math.max(0, total - Math.floor(overlap / 60000));
}

// ─── 深夜時間計算（22:00〜翌5:00 JST）──────────────────────────
function calcLateNightMinutes(clockIn: Date, clockOut: Date): number {
  let lateNight = 0;
  const jst = toJST(clockIn);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();

  // 当日 22:00〜24:00 (UTC 13:00〜15:00)
  const lnStart1 = new Date(Date.UTC(y, mo, d, 13, 0));
  const lnEnd1   = new Date(Date.UTC(y, mo, d, 15, 0));
  // 翌日 0:00〜5:00 (UTC 15:00〜20:00)
  const lnStart2 = new Date(Date.UTC(y, mo, d, 15, 0));
  const lnEnd2   = new Date(Date.UTC(y, mo, d, 20, 0));

  for (const [s, e] of [[lnStart1, lnEnd1], [lnStart2, lnEnd2]]) {
    const overlap = Math.max(0,
      Math.min(clockOut.getTime(), e.getTime()) -
      Math.max(clockIn.getTime(), s.getTime())
    );
    lateNight += Math.floor(overlap / 60000);
  }
  return lateNight;
}

// ─── 遅刻・早退計算（標準8:00〜17:00 JST）──────────────────────
function calcDeductionMinutes(clockIn: Date, clockOut: Date | null): number {
  const jst = toJST(clockIn);
  const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate();
  const stdIn  = new Date(Date.UTC(y, mo, d, 23, 0));   // 8:00 JST = UTC前日23:00... ※要補正
  // 正しい UTC換算: 8:00 JST = UTC -1日 23:00 ではなく当日-9h
  const stdStart = new Date(Date.UTC(y, mo, d) - JST + 8 * 60 * 60 * 1000);  // 8:00 JST
  const stdEnd   = new Date(Date.UTC(y, mo, d) - JST + 17 * 60 * 60 * 1000); // 17:00 JST

  let deduction = 0;
  // 遅刻
  if (clockIn > stdStart) {
    deduction += Math.floor((clockIn.getTime() - stdStart.getTime()) / 60000);
  }
  // 早退（退勤が17:00より早く かつ 実働8時間未満）
  if (clockOut && clockOut < stdEnd) {
    const worked = calcWorkingMinutes(clockIn, clockOut);
    if (worked < 480) {
      deduction += Math.floor((stdEnd.getTime() - clockOut.getTime()) / 60000);
    }
  }
  return deduction;
}

// ─── 1日分の給与計算 ─────────────────────────────────────────────
function calcDaySalary(clockIn: Date, clockOut: Date | null, hourlyWage: number) {
  if (!clockOut) {
    return { workMinutes: 0, regularPay: 0, overtimePay: 0, lateNightPay: 0, deduction: 0 };
  }
  const workMinutes   = calcWorkingMinutes(clockIn, clockOut);
  const overtimeMin   = Math.max(0, workMinutes - 480);
  const regularMin    = workMinutes - overtimeMin;
  const lateNightMin  = calcLateNightMinutes(clockIn, clockOut);
  const deductionMin  = calcDeductionMinutes(clockIn, clockOut);

  const perMin = hourlyWage / 60;
  const regularPay   = Math.floor(regularMin * perMin);
  const overtimePay  = Math.floor(overtimeMin * perMin * 0.25);   // 割増25%分のみ
  const lateNightPay = Math.floor(lateNightMin * perMin * 0.25);  // 深夜割増25%分のみ
  const deduction    = Math.floor(deductionMin * perMin);

  return { workMinutes, regularPay, overtimePay, lateNightPay, deduction };
}

// ─── 月次給与集計 ────────────────────────────────────────────────
async function calcMonthly(year: number, month: number, employeeId?: number) {
  const db = getDb();
  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endStr   = `${year}-${String(month).padStart(2, "0")}-31`;

  const conditions: any[] = [
    eq(attendanceRecords.status, "active"),
    gte(attendanceRecords.clockInTime, new Date(`${startStr}T00:00:00+09:00`).toISOString()),
    lte(attendanceRecords.clockInTime, new Date(`${endStr}T23:59:59+09:00`).toISOString()),
  ];
  if (employeeId) conditions.push(eq(attendanceRecords.employeeId, employeeId));

  const rows = await db.select({
    clockInTime: attendanceRecords.clockInTime,
    clockOutTime: attendanceRecords.clockOutTime,
    employeeName: employeeMaster.name,
    employeeCode: employeeMaster.employeeId,
    empId: employeeMaster.id,
    hourlyWage: employeeMaster.hourlyWage,
    siteName: siteMaster.siteName,
  })
    .from(attendanceRecords)
    .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
    .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
    .where(and(...conditions))
    .orderBy(attendanceRecords.clockInTime);

  // 従業員ごとに集計
  const map = new Map<number, {
    employeeId: number; employeeName: string; employeeCode: string; hourlyWage: number;
    days: { date: string; siteName: string; workMinutes: number; regularPay: number; overtimePay: number; lateNightPay: number; deduction: number }[];
    totalWorkMinutes: number; totalRegularPay: number; totalOvertimePay: number; totalLateNightPay: number; totalDeduction: number; totalPay: number;
  }>();

  for (const row of rows) {
    if (!map.has(row.empId)) {
      map.set(row.empId, {
        employeeId: row.empId, employeeName: row.employeeName,
        employeeCode: row.employeeCode, hourlyWage: row.hourlyWage ?? 1000,
        days: [], totalWorkMinutes: 0, totalRegularPay: 0,
        totalOvertimePay: 0, totalLateNightPay: 0, totalDeduction: 0, totalPay: 0,
      });
    }
    const emp = map.get(row.empId)!;
    const clockIn  = new Date(row.clockInTime);
    const clockOut = row.clockOutTime ? new Date(row.clockOutTime) : null;
    const day = calcDaySalary(clockIn, clockOut, emp.hourlyWage);

    emp.days.push({ date: toJSTDateStr(clockIn), siteName: row.siteName, ...day });
    emp.totalWorkMinutes += day.workMinutes;
    emp.totalRegularPay  += day.regularPay;
    emp.totalOvertimePay += day.overtimePay;
    emp.totalLateNightPay += day.lateNightPay;
    emp.totalDeduction   += day.deduction;
    emp.totalPay = emp.totalRegularPay + emp.totalOvertimePay + emp.totalLateNightPay - emp.totalDeduction;
  }

  return Array.from(map.values());
}

// ─── ルーター ────────────────────────────────────────────────────
export const kyuyoRouter = router({
  // 月次給与計算
  getMonthly: publicProcedure
    .input(z.object({
      year:       z.number().int().min(2000).max(2100),
      month:      z.number().int().min(1).max(12),
      employeeId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const results = await calcMonthly(input.year, input.month, input.employeeId);
      return { year: input.year, month: input.month, employees: results };
    }),

  // 給与計算結果をExcelでダウンロード（base64）
  exportExcel: publicProcedure
    .input(z.object({
      year:       z.number().int().min(2000).max(2100),
      month:      z.number().int().min(1).max(12),
      employeeId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const results = await calcMonthly(input.year, input.month, input.employeeId);

      const wb = new ExcelJS.Workbook();

      for (const emp of results) {
        const ws = wb.addWorksheet(emp.employeeName);

        // ヘッダー
        ws.mergeCells("A1:G1");
        ws.getCell("A1").value = `給与計算書　${input.year}年${input.month}月　${emp.employeeName}`;
        ws.getCell("A1").font = { bold: true, size: 13 };
        ws.getCell("A1").alignment = { horizontal: "center" };

        ws.getRow(2).values = ["", `時給: ${emp.hourlyWage}円`];

        ws.getRow(4).values = ["日付", "現場", "実働(h)", "基本給", "残業割増", "深夜割増", "控除"];
        ws.getRow(4).font = { bold: true };
        ws.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

        let rowIdx = 5;
        for (const d of emp.days) {
          ws.getRow(rowIdx).values = [
            d.date,
            d.siteName,
            Math.round(d.workMinutes / 60 * 10) / 10,
            d.regularPay,
            d.overtimePay,
            d.lateNightPay,
            d.deduction,
          ];
          rowIdx++;
        }

        // 合計行
        ws.getRow(rowIdx).values = [
          "合計", "",
          Math.round(emp.totalWorkMinutes / 60 * 10) / 10,
          emp.totalRegularPay,
          emp.totalOvertimePay,
          emp.totalLateNightPay,
          emp.totalDeduction,
        ];
        ws.getRow(rowIdx).font = { bold: true };

        rowIdx += 2;
        ws.getCell(`A${rowIdx}`).value = "総支給額";
        ws.getCell(`B${rowIdx}`).value = emp.totalPay;
        ws.getCell(`B${rowIdx}`).font = { bold: true, size: 12, color: { argb: "FF0070C0" } };

        ws.columns = [
          { width: 14 }, { width: 24 }, { width: 10 },
          { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 },
        ];
      }

      const buffer = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const filename = `給与計算書_${input.year}年${input.month}月.xlsx`;
      return { base64, filename };
    }),
});
