import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users, Clock, CalendarDays, TrendingUp } from "lucide-react";

function minToHHMM(m: number): string {
  if (m === 0) return "0:00";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

function toJST(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

export default function AdminSummary() {
  const now = toJST(new Date());
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const { data, isLoading } = trpc.export.getMonthlySummary.useQuery(
    { year, month },
    { staleTime: 30_000 },
  );

  const avgWorkingMinutes = useMemo(() => {
    if (!data) return 0;
    const workers = data.summaries.filter(s => s.attendanceDays > 0);
    if (workers.length === 0) return 0;
    return Math.round(data.totals.totalWorkingMinutes / workers.length);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月次サマリー</h1>
          <p className="text-sm text-muted-foreground mt-1">作業員ごとの出勤・実働・休暇の集計</p>
        </div>

        {/* 月選択 */}
        <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-semibold">
            {year}年{month}月
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              出勤・休暇あり
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.totals.activeEmployeeCount ?? "-"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">名</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              延べ出勤日数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.totals.totalAttendanceDays ?? "-"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">日（全員合計）</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              1人あたり実働
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data ? minToHHMM(avgWorkingMinutes) : "-"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">時間（出勤者平均）</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              承認済み休暇
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.totals.totalLeaveDays ?? "-"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">日（有給+代休+特休）</p>
          </CardContent>
        </Card>
      </div>

      {/* 詳細テーブル */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">作業員別内訳</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              読み込み中…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">社員ID</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">氏名</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">出勤日数</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">総実働時間</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">残業時間</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">有給</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">休日希望</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.summaries ?? []).map((s, i) => (
                    <tr
                      key={s.employeeCode}
                      className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                        i % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.employeeCode}</td>
                      <td className="px-4 py-3 font-medium">{s.employeeName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.attendanceDays > 0 ? (
                          <span className="font-semibold">{s.attendanceDays}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                        {s.attendanceDays > 0 && <span className="text-xs text-muted-foreground ml-0.5">日</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.totalWorkingMinutes > 0 ? (
                          <span>{minToHHMM(s.totalWorkingMinutes)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.overtimeMinutes > 0 ? (
                          <span className="text-orange-600 font-medium">{minToHHMM(s.overtimeMinutes)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.paidLeaveDays > 0 ? (
                          <span className="text-green-700 font-medium">{s.paidLeaveDays}日</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.holidayRequestDays > 0 ? (
                          <span className="text-gray-700 font-medium">{s.holidayRequestDays}日</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data && data.summaries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground text-sm">
                        この月のデータがありません
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* フッター合計行 */}
                {data && data.summaries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold text-sm">
                      <td colSpan={2} className="px-4 py-3 text-muted-foreground text-xs">合計</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {data.totals.totalAttendanceDays}日
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {minToHHMM(data.totals.totalWorkingMinutes)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-orange-600">
                        {minToHHMM(data.summaries.reduce((s, e) => s + e.overtimeMinutes, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">
                        {data.summaries.reduce((s, e) => s + e.paidLeaveDays, 0)}日
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {data.summaries.reduce((s, e) => s + e.holidayRequestDays, 0)}日
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
