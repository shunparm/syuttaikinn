import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attendanceRecords, employeeMaster, siteMaster, nisshoRecords } from "../../drizzle/schema";

// ─── JST ユーティリティ ──────────────────────────────────────────
const JST = 9 * 60 * 60 * 1000;

function toJST(d: Date): Date {
  return new Date(d.getTime() + JST);
}

function fmtTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "-";
  const d = toJST(new Date(isoStr));
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function calcWorkingMinutes(clockIn: Date, clockOut: Date): number {
  const total = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const j = toJST(clockIn);
  const y = j.getUTCFullYear(), mo = j.getUTCMonth(), d = j.getUTCDate();
  const breakStart = new Date(Date.UTC(y, mo, d, 3, 0));
  const breakEnd   = new Date(Date.UTC(y, mo, d, 4, 0));
  const overlap = Math.max(0,
    Math.min(clockOut.getTime(), breakEnd.getTime()) -
    Math.max(clockIn.getTime(), breakStart.getTime())
  );
  return Math.max(0, total - Math.floor(overlap / 60000));
}

// ─── 日報テキスト生成 ─────────────────────────────────────────────
async function generateNisshoContent(date: string, employeeId: number): Promise<{ content: string; found: boolean }> {
  const db = getDb();

  const start = new Date(`${date}T00:00:00+09:00`);
  const end   = new Date(`${date}T23:59:59+09:00`);

  const allEmps = await db.select({ id: employeeMaster.id, name: employeeMaster.name }).from(employeeMaster);
  const empMap = new Map(allEmps.map(e => [e.id, e.name]));

  const rows = await db.select({
    clockInTime: attendanceRecords.clockInTime,
    clockOutTime: attendanceRecords.clockOutTime,
    workReport: attendanceRecords.workReport,
    companionEmployeeIds: attendanceRecords.companionEmployeeIds,
    employeeName: employeeMaster.name,
    siteName: siteMaster.siteName,
    location: siteMaster.location,
  })
    .from(attendanceRecords)
    .innerJoin(employeeMaster, eq(attendanceRecords.employeeId, employeeMaster.id))
    .innerJoin(siteMaster, eq(attendanceRecords.siteId, siteMaster.id))
    .where(and(
      eq(attendanceRecords.employeeId, employeeId),
      eq(attendanceRecords.status, "active"),
      and(
        // clockInTime >= start
        // drizzleのgte/lteはtextフィールドでもISOソートで比較可能
      ),
    ));

  // date条件はJavaScript側でフィルタ（textフィールドのため）
  const filtered = rows.filter(r => {
    const clockIn = new Date(r.clockInTime);
    return clockIn >= start && clockIn <= end;
  });

  if (filtered.length === 0) {
    return { content: "", found: false };
  }

  const r = filtered[0];
  const clockIn  = new Date(r.clockInTime);
  const clockOut = r.clockOutTime ? new Date(r.clockOutTime) : null;
  const workMin  = clockOut ? calcWorkingMinutes(clockIn, clockOut) : 0;
  const workH    = Math.floor(workMin / 60);
  const workM    = workMin % 60;

  const companions = (() => {
    if (!r.companionEmployeeIds) return "なし";
    try {
      const ids: number[] = JSON.parse(r.companionEmployeeIds);
      return ids.map(id => empMap.get(id) ?? `ID:${id}`).join("、") || "なし";
    } catch { return "なし"; }
  })();

  const lines = [
    `【日　報】`,
    `日　付: ${date}`,
    `氏　名: ${r.employeeName}`,
    `現　場: ${r.siteName}${r.location ? `（${r.location}）` : ""}`,
    ``,
    `■ 勤怠`,
    `　出勤: ${fmtTime(r.clockInTime)}`,
    `　退勤: ${fmtTime(r.clockOutTime)}`,
    `　実働: ${workH}時間${workM}分`,
    ``,
    `■ 同行作業員`,
    `　${companions}`,
    ``,
    `■ 作業内容`,
    `　${r.workReport || "記録なし"}`,
  ];

  return { content: lines.join("\n"), found: true };
}

// ─── ルーター ────────────────────────────────────────────────────
export const nisshoRouter = router({
  // 日報を自動生成（DBには保存しない）
  generate: publicProcedure
    .input(z.object({
      date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      employeeId: z.number().int(),
    }))
    .query(async ({ input }) => {
      const { content, found } = await generateNisshoContent(input.date, input.employeeId);
      return { date: input.date, employeeId: input.employeeId, content, found };
    }),

  // 日報を保存
  save: publicProcedure
    .input(z.object({
      date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      employeeId: z.number().int(),
      content:    z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date().toISOString();

      // 既存レコードを確認
      const existing = await db.select()
        .from(nisshoRecords)
        .where(and(
          eq(nisshoRecords.employeeId, input.employeeId),
          eq(nisshoRecords.date, input.date),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(nisshoRecords)
          .set({ content: input.content, updatedAt: now })
          .where(eq(nisshoRecords.id, existing[0].id));
        return { id: existing[0].id, created: false };
      } else {
        const result = await db.insert(nisshoRecords)
          .values({ employeeId: input.employeeId, date: input.date, content: input.content, createdAt: now, updatedAt: now })
          .returning({ id: nisshoRecords.id });
        return { id: result[0].id, created: true };
      }
    }),

  // 指定日の日報を取得
  getByDate: publicProcedure
    .input(z.object({
      date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      employeeId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const conditions: any[] = [eq(nisshoRecords.date, input.date)];
      if (input.employeeId) conditions.push(eq(nisshoRecords.employeeId, input.employeeId));

      const rows = await db.select({
        id: nisshoRecords.id,
        employeeId: nisshoRecords.employeeId,
        date: nisshoRecords.date,
        content: nisshoRecords.content,
        createdAt: nisshoRecords.createdAt,
        updatedAt: nisshoRecords.updatedAt,
        employeeName: employeeMaster.name,
      })
        .from(nisshoRecords)
        .innerJoin(employeeMaster, eq(nisshoRecords.employeeId, employeeMaster.id))
        .where(and(...conditions));

      return rows;
    }),
});
