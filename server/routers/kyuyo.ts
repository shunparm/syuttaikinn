import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster } from "../../drizzle/schema";

// ─── JST ユーティリティ ──────────────────────────────────────────
const JST_OFFSET = 9 * 60 * 60 * 1000;

function toJST(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET);
}

function toJSTDateStr(d: Date): string {
  const j = toJST(d);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}

// ─── 実働時間計算（6h以上の場合は休憩1h控除、時給制用）──────────
function calcActualHours(clockIn: Date, clockOut: Date): number {
  const rawMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const rawHours = rawMinutes / 60;
  // 6時間以上の場合は休憩1時間を控除
  return rawHours >= 6 ? rawHours - 1 : rawHours;
}

// ─── 雇用区分別 基本給計算 ────────────────────────────────────────
type EmploymentType = "月給" | "日給" | "時給" | "実習生";

interface AttendanceSummary {
  fullDays: number;       // ○ の日数
  halfDays: number;       // △ の日数
  paidLeaveDays: number;  // 有給 の日数
  actualHours: number;    // 実働時間合計（時給制用）
  overtimeHours: number;  // 残業時間合計
  manualAllowance: number; // 手当・控除合計（J列）
  replacementCost: number; // 立替金合計
}

function calcBasicPay(
  empType: EmploymentType,
  monthlySalary: number,
  dailyWage: number,
  hourlyWage: number,
  summary: AttendanceSummary,
): number {
  switch (empType) {
    case "月給":
    case "実習生":
      return monthlySalary;
    case "日給": {
      // ○=1日、△=0.5日、有給=1日
      const effectiveDays = summary.fullDays + summary.halfDays * 0.5 + summary.paidLeaveDays;
      return Math.floor(dailyWage * effectiveDays);
    }
    case "時給":
      return Math.floor(hourlyWage * summary.actualHours);
    default:
      return 0;
  }
}

// ─── 月次給与集計 ────────────────────────────────────────────────
async function calcMonthly(year: number, month: number, employeeId?: number) {
  const db = getDb();
  const lastDay = new Date(year, month, 0).getDate(); // その月の末日
  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endStr   = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const conditions: any[] = [
    eq(attendanceRecords.status, "active"),
    gte(attendanceRecords.clockInTime, new Date(`${startStr}T00:00:00+09:00`).toISOString()),
    lte(attendanceRecords.clockInTime, new Date(`${endStr}T23:59:59+09:00`).toISOString()),
  ];
  if (employeeId) conditions.push(eq(attendanceRecords.employeeId, employeeId));

  const rows = await db.select({
    clockInTime: attendanceRecords.clockInTime,
    clockOutTime: attendanceRecords.clockOutTime,
    attendanceType: attendanceRecords.attendanceType,
    overtimeHours: attendanceRecords.overtimeHours,
    manualAllowance: attendanceRecords.manualAllowance,
    replacementCost: attendanceRecords.replacementCost,
    empId: employeeMaster.id,
    employeeCode: employeeMaster.employeeId,
    employeeName: employeeMaster.name,
    employmentType: employeeMaster.employmentType,
    monthlySalary: employeeMaster.monthlySalary,
    dailyWage: employeeMaster.dailyWage,
    hourlyWage: employeeMaster.hourlyWage,
    healthInsurance: employeeMaster.healthInsurance,
    pension: employeeMaster.pension,
    employmentInsuranceRate: employeeMaster.employmentInsuranceRate,
    incomeTax: employeeMaster.incomeTax,
    residentTax: employeeMaster.residentTax,
    welfareFee: employeeMaster.welfareFee,
    siteName: siteMaster.siteName,
  })
    .from(attendanceRecords)
    .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
    .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
    .where(and(...conditions))
    .orderBy(attendanceRecords.clockInTime);

  type EmpRecord = {
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    employmentType: EmploymentType;
    monthlySalary: number;
    dailyWage: number;
    hourlyWage: number;
    healthInsurance: number;
    pension: number;
    employmentInsuranceRate: number;
    incomeTax: number;
    residentTax: number;
    welfareFee: number;
    summary: AttendanceSummary;
    days: {
      date: string;
      siteName: string;
      attendanceType: string;
      overtimeHours: number;
      manualAllowance: number;
      replacementCost: number;
    }[];
  };

  const map = new Map<number, EmpRecord>();

  for (const row of rows) {
    if (!map.has(row.empId)) {
      map.set(row.empId, {
        employeeId: row.empId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        employmentType: (row.employmentType ?? "日給") as EmploymentType,
        monthlySalary: row.monthlySalary ?? 0,
        dailyWage: row.dailyWage ?? 0,
        hourlyWage: row.hourlyWage ?? 1000,
        healthInsurance: row.healthInsurance ?? 0,
        pension: row.pension ?? 0,
        employmentInsuranceRate: row.employmentInsuranceRate ?? 0.006,
        incomeTax: row.incomeTax ?? 0,
        residentTax: row.residentTax ?? 0,
        welfareFee: row.welfareFee ?? 0,
        summary: { fullDays: 0, halfDays: 0, paidLeaveDays: 0, actualHours: 0, overtimeHours: 0, manualAllowance: 0, replacementCost: 0 },
        days: [],
      });
    }

    const emp = map.get(row.empId)!;
    const aType = row.attendanceType ?? "○";
    const overtimeH = row.overtimeHours ?? 0;
    const manualAl = row.manualAllowance ?? 0;
    const repCost  = row.replacementCost ?? 0;

    // 勤怠区分の集計
    if (aType === "○" || aType === "出") emp.summary.fullDays++;
    else if (aType === "△") emp.summary.halfDays++;
    else if (aType === "有給") emp.summary.paidLeaveDays++;

    // 実働時間（時給制のみ使用）
    if (row.clockOutTime) {
      const clockIn  = new Date(row.clockInTime);
      const clockOut = new Date(row.clockOutTime);
      emp.summary.actualHours += calcActualHours(clockIn, clockOut);
    }

    emp.summary.overtimeHours  += overtimeH;
    emp.summary.manualAllowance += manualAl;
    emp.summary.replacementCost += repCost;

    emp.days.push({
      date: toJSTDateStr(new Date(row.clockInTime)),
      siteName: row.siteName,
      attendanceType: aType,
      overtimeHours: overtimeH,
      manualAllowance: manualAl,
      replacementCost: repCost,
    });
  }

  return Array.from(map.values()).map(emp => {
    const basicPay   = calcBasicPay(emp.employmentType, emp.monthlySalary, emp.dailyWage, emp.hourlyWage, emp.summary);
    const overtimePay = Math.floor(emp.hourlyWage * emp.summary.overtimeHours * 1.25);
    const manualAllowance = emp.summary.manualAllowance;
    const grossPay   = basicPay + overtimePay + manualAllowance;

    const healthInsurance      = emp.healthInsurance;
    const pension              = emp.pension;
    const employmentInsurance  = Math.round(grossPay * emp.employmentInsuranceRate);
    const incomeTax            = emp.incomeTax;
    const residentTax          = emp.residentTax;
    const welfareFee           = emp.welfareFee;
    const replacementCost      = emp.summary.replacementCost;

    const netPay = grossPay - healthInsurance - pension - employmentInsurance - incomeTax - residentTax - welfareFee - replacementCost;

    return {
      employeeId:   emp.employeeId,
      employeeCode: emp.employeeCode,
      employeeName: emp.employeeName,
      employmentType: emp.employmentType,
      dailyWage:    emp.dailyWage,
      hourlyWage:   emp.hourlyWage,
      monthlySalary: emp.monthlySalary,
      summary: {
        fullDays:       emp.summary.fullDays,
        halfDays:       emp.summary.halfDays,
        paidLeaveDays:  emp.summary.paidLeaveDays,
        actualHours:    Math.round(emp.summary.actualHours * 100) / 100,
        overtimeHours:  Math.round(emp.summary.overtimeHours * 100) / 100,
      },
      basicPay,
      overtimePay,
      manualAllowance,
      grossPay,
      healthInsurance,
      pension,
      employmentInsurance,
      incomeTax,
      residentTax,
      welfareFee,
      replacementCost,
      netPay,
      days: emp.days,
    };
  });
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
  // 列構成: A:社員ID B:氏名 C:雇用区分 D:基本給/日給単価 E:出勤日数 F:残業時間
  //         G:有給日数 H:基本給支給額 I:残業手当 J:手当合計 K:総支給額
  //         L:健康保険 M:厚生年金 N:雇用保険 O:所得税 P:控除後支給額
  //         Q:住民税 R:友愛会費 S:立替金 T:手取金額
  exportExcel: publicProcedure
    .input(z.object({
      year:       z.number().int().min(2000).max(2100),
      month:      z.number().int().min(1).max(12),
      employeeId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const results = await calcMonthly(input.year, input.month, input.employeeId);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${input.year}年${input.month}月`);

      // タイトル行
      ws.mergeCells("A1:T1");
      ws.getCell("A1").value = `給与計算書　${input.year}年${input.month}月`;
      ws.getCell("A1").font = { bold: true, size: 14 };
      ws.getCell("A1").alignment = { horizontal: "center" };

      // ヘッダー行
      const headers = [
        "社員ID", "氏名", "雇用区分", "基本給/日給単価",
        "出勤日数", "残業時間", "有給日数",
        "基本給支給額", "残業手当", "手当合計", "総支給額",
        "健康保険", "厚生年金", "雇用保険", "所得税",
        "控除後支給額", "住民税", "友愛会費", "立替金", "手取金額",
      ];
      ws.getRow(2).values = ["", ...headers];
      const headerRow = ws.getRow(2);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      headerRow.alignment = { horizontal: "center" };

      let rowIdx = 3;
      for (const emp of results) {
        const effectiveDays = emp.summary.fullDays + emp.summary.halfDays * 0.5;
        const afterDeduction = emp.grossPay - emp.healthInsurance - emp.pension - emp.employmentInsurance - emp.incomeTax;

        ws.getRow(rowIdx).values = [
          "",                      // A (index 1, skip)
          emp.employeeCode,        // A
          emp.employeeName,        // B
          emp.employmentType,      // C
          emp.employmentType === "月給" || emp.employmentType === "実習生"
            ? emp.monthlySalary
            : emp.employmentType === "日給"
              ? emp.dailyWage
              : emp.hourlyWage,    // D
          effectiveDays,           // E
          emp.summary.overtimeHours, // F
          emp.summary.paidLeaveDays, // G
          emp.basicPay,            // H
          emp.overtimePay,         // I
          emp.manualAllowance,     // J
          emp.grossPay,            // K
          emp.healthInsurance,     // L
          emp.pension,             // M
          emp.employmentInsurance, // N
          emp.incomeTax,           // O
          afterDeduction,          // P 控除後支給額
          emp.residentTax,         // Q
          emp.welfareFee,          // R
          emp.replacementCost,     // S
          emp.netPay,              // T
        ];

        // 金額列に数値フォーマット
        for (const col of [4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
          const cell = ws.getRow(rowIdx).getCell(col + 1);
          cell.numFmt = "#,##0";
        }

        rowIdx++;
      }

      // 合計行
      if (results.length > 0) {
        const totalRow = ws.getRow(rowIdx);
        totalRow.getCell(2).value = "合計";
        const sumCols = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // K〜T (1-indexed: 11〜20)
        for (const col of sumCols) {
          let total = 0;
          for (let r = 3; r < rowIdx; r++) {
            const v = ws.getRow(r).getCell(col).value;
            if (typeof v === "number") total += v;
          }
          totalRow.getCell(col).value = total;
          totalRow.getCell(col).numFmt = "#,##0";
        }
        totalRow.font = { bold: true };
        totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      }

      ws.columns = [
        { width: 2 },  // placeholder
        { width: 10 }, // A 社員ID
        { width: 16 }, // B 氏名
        { width: 10 }, // C 雇用区分
        { width: 14 }, // D 基本給/日給単価
        { width: 10 }, // E 出勤日数
        { width: 10 }, // F 残業時間
        { width: 10 }, // G 有給日数
        { width: 12 }, // H 基本給支給額
        { width: 12 }, // I 残業手当
        { width: 12 }, // J 手当合計
        { width: 12 }, // K 総支給額
        { width: 12 }, // L 健康保険
        { width: 12 }, // M 厚生年金
        { width: 12 }, // N 雇用保険
        { width: 12 }, // O 所得税
        { width: 12 }, // P 控除後支給額
        { width: 12 }, // Q 住民税
        { width: 12 }, // R 友愛会費
        { width: 12 }, // S 立替金
        { width: 12 }, // T 手取金額
      ];

      const buffer = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const filename = `給与計算書_${input.year}年${input.month}月.xlsx`;
      return { base64, filename };
    }),
});
