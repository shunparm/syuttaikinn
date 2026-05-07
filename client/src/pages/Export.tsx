import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Users, Clock, Calendar } from "lucide-react";

const LEAVE_TYPE_LABEL: Record<string, string> = {
  paid_leave: "有給休暇",
  substitute_holiday: "代休",
  special_leave: "特別休暇",
  holiday_request: "休日希望",
};

function minutesToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function Export() {
  // JST基準の今日・月初を計算
  const todayJST = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const todayJSTStr = todayJST.toISOString().split("T")[0];
  const firstOfMonthJSTStr = todayJSTStr.slice(0, 7) + "-01";

  const [startDate, setStartDate] = useState(firstOfMonthJSTStr);
  const [endDate, setEndDate] = useState(todayJSTStr);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [queryParams, setQueryParams] = useState({
    startDate: new Date(firstOfMonthJSTStr + "T00:00:00+09:00"),
    endDate:   new Date(todayJSTStr + "T23:59:59+09:00"),
    employeeId: undefined as number | undefined,
  });

  const { data: employees } = trpc.master.listEmployees.useQuery();
  const { data: allEmployees } = trpc.master.listEmployees.useQuery({});
  const { data: exportData, isLoading } = trpc.export.getExportData.useQuery(queryParams);

  // 同行作業員ID→名前変換ヘルパー
  const resolveCompanionNames = (companionJson: string | null | undefined): string => {
    if (!companionJson || !allEmployees) return "-";
    try {
      const ids: number[] = JSON.parse(companionJson);
      if (!ids.length) return "-";
      return ids
        .map((id) => allEmployees.find((e) => e.id === id)?.name ?? `ID:${id}`)
        .join("、");
    } catch {
      return "-";
    }
  };
  const { data: csvData, isLoading: csvLoading } = trpc.export.generateCsvString.useQuery(queryParams);

  const handleSearch = () => {
    setQueryParams({
      startDate: new Date(startDate + "T00:00:00+09:00"),
      endDate:   new Date(endDate   + "T23:59:59+09:00"),
      employeeId: filterEmployeeId !== "all" ? Number(filterEmployeeId) : undefined,
    });
  };

  const handleDownload = () => {
    if (!csvData?.csv) {
      toast.error("ダウンロードするデータがありません");
      return;
    }
    const blob = new Blob([csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `出退勤簿_${startDate}_${endDate}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSVをダウンロードしました");
  };

  const hasData = (exportData?.rows.length ?? 0) > 0 || (exportData?.leaveRows.length ?? 0) > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Download className="h-6 w-6 text-primary" />
          CSV出力
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          期間・作業員を指定して出退勤データをCSV形式でエクスポートします
        </p>
      </div>

      {/* 条件設定 */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">出力条件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                開始日
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                終了日
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                作業員
              </Label>
              <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての作業員</SelectItem>
                  {employees?.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSearch} variant="outline" size="sm">
              集計を確認
            </Button>
            <Button
              onClick={handleDownload}
              size="sm"
              className="gap-2"
              disabled={csvLoading || !hasData}
            >
              <Download className="h-4 w-4" />
              CSVダウンロード
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 集計サマリー */}
      {exportData && exportData.summaries.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              作業員別集計
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">作業員コード</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">氏名</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">出勤日数</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">休暇日数</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">合計実働時間</th>
                  </tr>
                </thead>
                <tbody>
                  {exportData.summaries.map((s) => (
                    <tr key={s.employeeCode} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{s.employeeCode}</td>
                      <td className="py-3 px-4 font-medium">{s.employeeName}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span className="flex items-center justify-end gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.totalAttendanceDays}日
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {s.totalLeaveDays > 0 ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                            {s.totalLeaveDays}日
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">
                        <span className="flex items-center justify-end gap-1 text-primary">
                          <Clock className="h-3.5 w-3.5" />
                          {s.totalWorkingHours}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20">
                    <td colSpan={2} className="py-3 px-4 text-xs font-semibold text-muted-foreground">
                      合計 ({exportData.summaries.length}名)
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-semibold tabular-nums">
                      {exportData.summaries.reduce((s, r) => s + r.totalAttendanceDays, 0)}日
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-semibold tabular-nums text-green-600">
                      {exportData.summaries.reduce((s, r) => s + r.totalLeaveDays, 0)}日
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-semibold tabular-nums text-primary">
                      {minutesToHHMM(exportData.summaries.reduce((s, r) => s + (r.totalWorkingMinutes ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 明細データ */}
      {exportData && hasData && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              明細データ ({exportData.rows.length}件
              {exportData.leaveRows.length > 0 && `・休暇${exportData.leaveRows.length}件`})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">日付</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">作業員</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">現場 / 種別</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">出勤</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">退勤</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">実働</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">同行作業員</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 出退勤行 */}
                  {exportData.rows.map((row) => (
                    <tr key={`at-${row.id}`} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap tabular-nums">
                        {new Date(row.clockInTime).toLocaleDateString("ja-JP", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">{row.employeeName}</td>
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{row.siteName}</td>
                      <td className="py-2.5 px-4 tabular-nums whitespace-nowrap">
                        {new Date(row.clockInTime).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums whitespace-nowrap">
                        {row.clockOutTime
                          ? new Date(row.clockOutTime).toLocaleTimeString("ja-JP", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                        {minutesToHHMM(row.workingMinutes ?? 0)}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-40 truncate">
                        {resolveCompanionNames(row.companionEmployeeIds)}
                      </td>
                    </tr>
                  ))}
                  {/* 承認済み休暇行 */}
                  {exportData.leaveRows.map((lr) => (
                    <tr key={`lv-${lr.id}`} className="border-b border-border/50 bg-green-50/60 hover:bg-green-50">
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap tabular-nums">
                        {lr.requestDate.slice(5).replace("-", "/")}
                      </td>
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">{lr.employeeName}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          {LEAVE_TYPE_LABEL[lr.leaveType] ?? lr.leaveType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">-</td>
                      <td className="py-2.5 px-4 text-muted-foreground">-</td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">-</td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-40 truncate">
                        {lr.reason ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {exportData && !hasData && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">指定期間のデータがありません</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
