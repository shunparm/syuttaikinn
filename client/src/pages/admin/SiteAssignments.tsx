import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Copy, MapPin, Plus, Shield, Trash2, X, Clock } from "lucide-react";

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

function todayJSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = DOW_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日(${dow})`;
}

// "8時〜12時" 形式の表示（分が00なら「時」表記、それ以外はHH:MM）
function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (t: string) => {
    const [h, mi] = t.split(":");
    return mi === "00" ? `${Number(h)}時` : `${Number(h)}:${mi}`;
  };
  return `${start ? fmt(start) : ""}〜${end ? fmt(end) : ""}`;
}

type AssignmentDraft = { employeeId: number; startTime: string | null; endTime: string | null };

export default function SiteAssignments() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [date, setDate] = useState(todayJSTStr());
  // 時間帯編集ダイアログ
  const [timeDialog, setTimeDialog] = useState<{ reportSiteId: number; employeeId: number; employeeName: string; startTime: string; endTime: string } | null>(null);
  // 担当者一括追加ダイアログ（対象現場のsiteIdと選択中の従業員ID）
  const [memberDialog, setMemberDialog] = useState<{ siteId: number; siteName: string } | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [copying, setCopying] = useState(false);

  const isOwner = user?.role === "owner";
  const canView = isAdminRole(user?.role);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.siteAssignment.getByDate.useQuery({ date }, { enabled: canView });
  const { data: sites } = trpc.master.listSites.useQuery(undefined, { enabled: canView });
  const { data: employees } = trpc.master.listEmployees.useQuery({}, { enabled: canView });
  const { data: siteUsage } = trpc.siteAssignment.getSiteUsage.useQuery(undefined, { enabled: canView && isOwner });

  const upsertMutation = trpc.siteAssignment.upsertReport.useMutation({
    onSuccess: () => {
      utils.siteAssignment.getByDate.invalidate({ date });
      utils.siteAssignment.getSiteUsage.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存に失敗しました"),
  });
  const deleteMutation = trpc.siteAssignment.deleteReport.useMutation({
    onSuccess: () => {
      toast.success("現場を削除しました");
      utils.siteAssignment.getByDate.invalidate({ date });
    },
    onError: (e) => toast.error(e.message || "削除に失敗しました"),
  });

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground font-medium">このページは管理者のみアクセスできます</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/")}>
          ダッシュボードへ
        </Button>
      </div>
    );
  }

  const reportSites = data?.sites ?? [];
  const usedSiteIds = new Set(reportSites.map(s => s.siteId));

  // 「現場を追加」の並び順: 過去60日の使用回数が多い順 → 直近使用順 → 現場ID順
  const usageMap = new Map((siteUsage ?? []).map(u => [u.siteId, u]));
  const availableSites = (sites ?? [])
    .filter(s => s.status === "active" && !usedSiteIds.has(s.id))
    .sort((a, b) => {
      const ua = usageMap.get(a.id), ub = usageMap.get(b.id);
      if ((ub?.count ?? 0) !== (ua?.count ?? 0)) return (ub?.count ?? 0) - (ua?.count ?? 0);
      if ((ub?.lastUsed ?? "") !== (ua?.lastUsed ?? "")) return (ub?.lastUsed ?? "").localeCompare(ua?.lastUsed ?? "");
      return a.siteId.localeCompare(b.siteId, undefined, { numeric: true });
    });
  const activeEmployees = (employees ?? []).filter(e => e.status === "active");

  const saveAssignments = (siteId: number, assignments: AssignmentDraft[]) =>
    upsertMutation.mutateAsync({ date, siteId, assignments });

  const addSite = (siteId: number) => {
    saveAssignments(siteId, []);
    // 現場を追加したらすぐ担当者選択を開く（タップ数削減）
    const site = (sites ?? []).find(s => s.id === siteId);
    if (site) {
      setSelectedMemberIds(new Set());
      setMemberDialog({ siteId, siteName: site.siteName });
    }
  };

  const openMemberDialog = (report: (typeof reportSites)[number]) => {
    setSelectedMemberIds(new Set());
    setMemberDialog({ siteId: report.siteId, siteName: report.siteName });
  };

  const confirmAddMembers = () => {
    if (!memberDialog) return;
    const report = reportSites.find(r => r.siteId === memberDialog.siteId);
    const current: AssignmentDraft[] = report
      ? report.assignments.map(a => ({ employeeId: a.employeeId, startTime: a.startTime, endTime: a.endTime }))
      : [];
    const additions: AssignmentDraft[] = Array.from(selectedMemberIds)
      .filter(id => !current.some(c => c.employeeId === id))
      .map(id => ({ employeeId: id, startTime: null, endTime: null }));
    if (additions.length > 0) {
      saveAssignments(memberDialog.siteId, [...current, ...additions]);
    }
    setMemberDialog(null);
  };

  const removeEmployee = (report: (typeof reportSites)[number], employeeId: number) => {
    const drafts = report.assignments
      .filter(a => a.employeeId !== employeeId)
      .map(a => ({ employeeId: a.employeeId, startTime: a.startTime, endTime: a.endTime }));
    saveAssignments(report.siteId, drafts);
  };

  const saveTime = () => {
    if (!timeDialog) return;
    const report = reportSites.find(r => r.siteId === timeDialog.reportSiteId);
    if (!report) return;
    const drafts = report.assignments.map(a =>
      a.employeeId === timeDialog.employeeId
        ? { employeeId: a.employeeId, startTime: timeDialog.startTime || null, endTime: timeDialog.endTime || null }
        : { employeeId: a.employeeId, startTime: a.startTime, endTime: a.endTime }
    );
    saveAssignments(report.siteId, drafts);
    setTimeDialog(null);
  };

  // 前日の配置をコピー（当日に既にある現場はスキップ）
  const copyFromYesterday = async () => {
    const prevDate = shiftDate(date, -1);
    setCopying(true);
    try {
      const prev = await utils.siteAssignment.getByDate.fetch({ date: prevDate });
      if (!prev || prev.sites.length === 0) {
        toast.error(`前日（${formatDateLabel(prevDate)}）の配置がありません`);
        return;
      }
      const targets = prev.sites.filter(s => !usedSiteIds.has(s.siteId));
      if (targets.length === 0) {
        toast.info("前日の現場はすべて登録済みです");
        return;
      }
      for (const s of targets) {
        await saveAssignments(
          s.siteId,
          s.assignments.map(a => ({ employeeId: a.employeeId, startTime: a.startTime, endTime: a.endTime }))
        );
      }
      toast.success(`前日から${targets.length}現場をコピーしました`);
    } finally {
      setCopying(false);
    }
  };

  // 担当者ダイアログ内での表示対象（対象現場に未登録の従業員のみ）
  const dialogReport = memberDialog ? reportSites.find(r => r.siteId === memberDialog.siteId) : null;
  const dialogAssignedIds = new Set(dialogReport?.assignments.map(a => a.employeeId) ?? []);
  const dialogCandidates = activeEmployees.filter(e => !dialogAssignedIds.has(e.id));

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          現場配置
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isOwner ? "その日の現場と担当者を登録します（変更は自動保存）" : "現場ごとの担当者を確認できます（閲覧のみ）"}
        </p>
      </div>

      {/* 日付ナビゲーション */}
      <div className="bg-card rounded-xl border shadow-sm px-2 py-2 sticky top-0 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDate(shiftDate(date, -1))}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold">{formatDateLabel(date)}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="text-xs text-muted-foreground bg-transparent border-0 text-center cursor-pointer"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDate(shiftDate(date, 1))}>
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
        {isOwner && (
          <Button
            variant="outline"
            className="w-full h-10 gap-2 text-sm"
            onClick={copyFromYesterday}
            disabled={copying || isLoading}
          >
            <Copy className="h-4 w-4" />
            {copying ? "コピー中..." : "前日をコピー"}
          </Button>
        )}
      </div>

      {/* 現場カード一覧 */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">読み込み中...</p>
      ) : reportSites.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          この日の現場配置はまだ登録されていません
        </div>
      ) : (
        reportSites.map(report => (
          <Card key={report.id} className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                {report.siteName}
              </CardTitle>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`「${report.siteName}」をこの日の配置から削除しますか？`)) {
                      deleteMutation.mutate({ id: report.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5">
              {report.assignments.map(a => {
                const timeLabel = formatTimeRange(a.startTime, a.endTime);
                return (
                  <div key={a.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                    <button
                      className="flex items-center gap-2 text-sm text-left flex-1 min-w-0"
                      disabled={!isOwner}
                      onClick={() => isOwner && setTimeDialog({
                        reportSiteId: report.siteId,
                        employeeId: a.employeeId,
                        employeeName: a.employeeName,
                        startTime: a.startTime ?? "",
                        endTime: a.endTime ?? "",
                      })}
                    >
                      <span className="font-medium">{a.employeeName}</span>
                      {timeLabel ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">（{timeLabel}）</span>
                      ) : isOwner ? (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
                      ) : null}
                    </button>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeEmployee(report, a.employeeId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {report.assignments.length === 0 && (
                <p className="text-xs text-muted-foreground py-1">担当者未設定</p>
              )}
              {isOwner && (
                <Button
                  variant="outline"
                  className="w-full h-11 border-dashed text-muted-foreground gap-1.5"
                  onClick={() => openMemberDialog(report)}
                >
                  <Plus className="h-4 w-4" />
                  担当者を追加（複数選択可）
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* 現場追加（社長のみ・使用頻度順） */}
      {isOwner && availableSites.length > 0 && (
        <Select value="" onValueChange={(v) => addSite(Number(v))}>
          <SelectTrigger className="h-12 border-dashed border-2 text-muted-foreground bg-card">
            <span className="flex items-center gap-1.5"><Plus className="h-5 w-5" />現場を追加</span>
          </SelectTrigger>
          <SelectContent>
            {availableSites.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.siteName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 担当者一括追加ダイアログ */}
      <Dialog open={memberDialog !== null} onOpenChange={(open) => !open && setMemberDialog(null)}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{memberDialog?.siteName} の担当者を選択</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {dialogCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">追加できる担当者がいません</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {dialogCandidates.map(e => {
                  const checked = selectedMemberIds.has(e.id);
                  return (
                    <label
                      key={e.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer select-none ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedMemberIds(prev => {
                            const next = new Set(prev);
                            if (v === true) next.add(e.id); else next.delete(e.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm font-medium truncate">{e.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11"
              disabled={selectedMemberIds.size === 0}
              onClick={confirmAddMembers}
            >
              {selectedMemberIds.size > 0 ? `${selectedMemberIds.size}人を追加` : "担当者を選択してください"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 時間帯編集ダイアログ */}
      <Dialog open={timeDialog !== null} onOpenChange={(open) => !open && setTimeDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{timeDialog?.employeeName} の時間帯</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">開始</p>
              <Input
                type="time"
                value={timeDialog?.startTime ?? ""}
                onChange={(e) => timeDialog && setTimeDialog({ ...timeDialog, startTime: e.target.value })}
                className="h-11"
              />
            </div>
            <span className="text-muted-foreground mt-5">〜</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">終了</p>
              <Input
                type="time"
                value={timeDialog?.endTime ?? ""}
                onChange={(e) => timeDialog && setTimeDialog({ ...timeDialog, endTime: e.target.value })}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => timeDialog && setTimeDialog({ ...timeDialog, startTime: "", endTime: "" })}
            >
              時間なしにする
            </Button>
            <Button className="flex-1" onClick={saveTime}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
