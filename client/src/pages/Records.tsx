import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, Filter, Search, Trash2, Users } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

function minutesToHHMM(min: number | null | undefined) {
  if (!min) return "-";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function Records() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "staff";
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("clockOutSuccess")) {
      sessionStorage.removeItem("clockOutSuccess");
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);
  const [filterSiteId, setFilterSiteId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [queryParams, setQueryParams] = useState({
    startDate: firstOfMonth,
    endDate: today,
    employeeId: undefined as number | undefined,
    siteId: undefined as number | undefined,
  });

  const deleteMutation = trpc.attendance.deleteRecord.useMutation({
    onSuccess: () => refetch(),
  });

  const handleDelete = (id: number) => {
    if (!window.confirm("この出勤記録を削除しますか？")) return;
    deleteMutation.mutate({ id });
  };

  const { data: employees } = trpc.master.listEmployees.useQuery({ includeInactive: false });
  const { data: allEmployees } = trpc.master.listEmployees.useQuery({});
  const { data: sites } = trpc.master.listSites.useQuery({ includeInactive: false });
  const { data: records, isLoading, refetch } = trpc.attendance.getAttendanceRecords.useQuery(queryParams);

  // 作業員IDから名前を解決するヘルパー
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

  const handleSearch = () => {
    setQueryParams({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      employeeId: filterEmployeeId !== "all" ? Number(filterEmployeeId) : undefined,
      siteId: filterSiteId !== "all" ? Number(filterSiteId) : undefined,
    });
  };

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        (r.workReport ?? "").toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  const totalMinutes = filteredRecords.reduce((sum, r) => sum + (r.workingMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* 退勤成功バナー */}
      {showSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span className="text-lg">✓</span>
          退勤を記録しました。本日もおつかれさまでした！
        </div>
      )}
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          出退勤簿一覧
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          期間・作業員・現場を指定して出退勤記録を確認できます
        </p>
      </div>

      {/* フィルターパネル */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Filter className="h-4 w-4" />
            絞り込み条件
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">開始日</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">終了日</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">作業員</Label>
              <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                <SelectTrigger className="h-9">
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
            <div className="space-y-1.5">
              <Label className="text-xs">現場</Label>
              <Select value={filterSiteId} onValueChange={setFilterSiteId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての現場</SelectItem>
                  {sites?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.siteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={handleSearch} size="sm" className="gap-2">
              <Search className="h-4 w-4" />
              検索
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 集計バー */}
      {filteredRecords.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 px-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{filteredRecords.length}件の記録</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              合計実働: {minutesToHHMM(totalMinutes)}
            </span>
          </div>
          {/* 検索ボックス */}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="氏名・現場名で絞り込み"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 w-48 text-xs"
            />
          </div>
        </div>
      )}

      {/* テーブル */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">読み込み中...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">該当する記録がありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">日付</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">作業員</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">現場</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">出勤</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">退勤</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">実働</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">状態</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">同行作業員</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">作業日報</th>
                    {isAdmin && <th className="py-3 px-4" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-3 px-4 text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(record.clockInTime).toLocaleDateString("ja-JP", {
                          month: "2-digit",
                          day: "2-digit",
                          weekday: "short",
                        })}
                      </td>
                      <td className="py-3 px-4 font-medium whitespace-nowrap">{record.employeeName}</td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{record.siteName}</td>
                      <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                        {new Date(record.clockInTime).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                        {record.clockOutTime
                          ? new Date(record.clockOutTime).toLocaleTimeString("ja-JP", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : (
                            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 border-0">
                              稼働中
                            </Badge>
                          )}
                      </td>
                      <td className="py-3 px-4 tabular-nums font-medium whitespace-nowrap">
                        {minutesToHHMM(record.workingMinutes)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={`text-xs border-0 ${
                            record.clockOutTime
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {record.clockOutTime ? "退勤済" : "稼働中"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground max-w-40 truncate">
                        <span className="flex items-center gap-1">
                          {resolveCompanionNames(record.companionEmployeeIds) !== "-" && (
                            <Users className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                          )}
                          {resolveCompanionNames(record.companionEmployeeIds)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground max-w-48 truncate">
                        {record.workReport || "-"}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            削除
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
