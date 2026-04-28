import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Shield,
} from "lucide-react";
import { useLocation } from "wouter";

const leaveTypeLabels: Record<string, string> = {
  paid_leave: "有給休暇",
  substitute_holiday: "代休",
  special_leave: "特別休暇",
  holiday_request: "休日希望",
};

type LeaveRequestRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  requestDate: string;
  reason: string | null;
  status: string;
  approvedBy: number | null;
  approvedAt: string | null;
  note: string | null;
  createdAt: string;
};

export default function AdminLeaveRequests() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<LeaveRequestRow | null>(null);
  const [note, setNote] = useState("");
  const [dialogType, setDialogType] = useState<"approve" | "reject" | "delete" | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const { data: requests, refetch } = trpc.leaveRequest.listAll.useQuery();

  const approveMutation = trpc.leaveRequest.approve.useMutation({
    onSuccess: () => {
      setDialogType(null);
      setSelected(null);
      refetch();
      setSavedMsg("休暇申請を承認しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "承認に失敗しました"),
  });

  const rejectMutation = trpc.leaveRequest.reject.useMutation({
    onSuccess: () => {
      setDialogType(null);
      setSelected(null);
      setNote("");
      refetch();
      setSavedMsg("休暇申請を却下しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "却下に失敗しました"),
  });

  const deleteMutation = trpc.leaveRequest.delete.useMutation({
    onSuccess: () => {
      setDialogType(null);
      setSelected(null);
      refetch();
      setSavedMsg("申請記録を削除しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "削除に失敗しました"),
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground font-medium">
          このページは管理者のみアクセスできます
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation("/")}
        >
          ダッシュボードへ
        </Button>
      </div>
    );
  }

  const pendingRequests = requests?.filter((r) => r.status === "pending") ?? [];
  const processedRequests =
    requests?.filter((r) => r.status !== "pending") ?? [];

  const openApprove = (req: LeaveRequestRow) => {
    setSelected(req);
    setNote("");
    setDialogType("approve");
  };
  const openReject = (req: LeaveRequestRow) => {
    setSelected(req);
    setNote("");
    setDialogType("reject");
  };
  const openDelete = (req: LeaveRequestRow) => {
    setSelected(req);
    setDialogType("delete");
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string; icon: React.ElementType }> = {
      pending: { label: "審査中", className: "bg-amber-100 text-amber-700", icon: Clock },
      approved: { label: "承認済", className: "bg-blue-100 text-blue-700", icon: CheckCircle },
      rejected: { label: "却下", className: "bg-red-100 text-red-700", icon: XCircle },
    };
    const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600", icon: Clock };
    return (
      <Badge
        variant="secondary"
        className={`text-xs border-0 flex items-center gap-1 ${s.className}`}
      >
        <s.icon className="h-3 w-3" />
        {s.label}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            休暇申請管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            作業員からの休暇申請を審査・承認します
          </p>
        </div>
        {pendingRequests.length > 0 && (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-700 border-0 text-sm px-3 py-1.5"
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {pendingRequests.length}件 審査待ち
          </Badge>
        )}
      </div>

      {/* 成功バナー */}
      {savedMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> {savedMsg}
        </div>
      )}

      {/* 審査待ち */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            審査待ち ({pendingRequests.length}件)
          </h2>
          {pendingRequests.map((req) => (
            <Card
              key={req.id}
              className="border-0 shadow-sm border-l-4 border-l-amber-400"
            >
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {req.employeeName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString("ja-JP")} 申請
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium text-foreground">種別:</span>{" "}
                        {leaveTypeLabels[req.leaveType] ?? req.leaveType}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">希望日:</span>{" "}
                        {formatDate(req.requestDate)}
                      </p>
                      {req.reason && (
                        <p>
                          <span className="font-medium text-foreground">理由:</span>{" "}
                          {req.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => openReject(req as LeaveRequestRow)}
                    >
                      <XCircle className="h-4 w-4" />
                      却下
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openApprove(req as LeaveRequestRow)}
                    >
                      <CheckCircle className="h-4 w-4" />
                      承認
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 処理済み */}
      {processedRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            処理済み ({processedRequests.length}件)
          </h2>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                        申請日
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                        作業員
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                        種別
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                        希望日
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                        状態
                      </th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedRequests.map((req) => (
                      <tr
                        key={req.id}
                        className="border-b border-border/50 hover:bg-muted/20"
                      >
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap text-xs">
                          {new Date(req.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="py-3 px-4 font-medium whitespace-nowrap">
                          {req.employeeName}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-xs">
                          {leaveTypeLabels[req.leaveType] ?? req.leaveType}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-xs">
                          {new Date(req.requestDate).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="py-3 px-4">{statusBadge(req.status)}</td>
                        <td className="py-3 px-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDelete(req as LeaveRequestRow)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {(!requests || requests.length === 0) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">休暇申請はありません</p>
          </CardContent>
        </Card>
      )}

      {/* 承認ダイアログ */}
      <Dialog
        open={dialogType === "approve"}
        onOpenChange={(o) => !o && setDialogType(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>休暇申請の承認</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">申請者</span>
                  <span className="font-medium">{selected.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">種別</span>
                  <span className="font-medium">
                    {leaveTypeLabels[selected.leaveType] ?? selected.leaveType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">希望日</span>
                  <span className="font-medium">
                    {formatDate(selected.requestDate)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">コメント（任意）</Label>
                <Textarea
                  placeholder="承認時のコメントを入力..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                承認するとこの申請が承認済みになります。
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              キャンセル
            </Button>
            <Button
              onClick={() =>
                selected &&
                approveMutation.mutate({ id: selected.id, note: note || undefined })
              }
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "処理中..." : "承認する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 却下ダイアログ */}
      <Dialog
        open={dialogType === "reject"}
        onOpenChange={(o) => !o && setDialogType(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>休暇申請の却下</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selected?.employeeName} さんの申請を却下します。
            </p>
            <div className="space-y-2">
              <Label className="text-sm font-medium">却下理由（任意）</Label>
              <Textarea
                placeholder="却下理由を入力してください..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selected &&
                rejectMutation.mutate({ id: selected.id, note: note || undefined })
              }
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "処理中..." : "却下する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog
        open={dialogType === "delete"}
        onOpenChange={(o) => !o && setDialogType(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申請記録の削除</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">この申請記録を削除しますか？</p>
            {selected && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">申請者</span>
                  <span className="font-medium">{selected.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">種別</span>
                  <span className="font-medium">
                    {leaveTypeLabels[selected.leaveType] ?? selected.leaveType}
                  </span>
                </div>
              </div>
            )}
            <p className="text-xs text-destructive">この操作は取り消せません。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selected && deleteMutation.mutate({ id: selected.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "削除中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
