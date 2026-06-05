import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Users, Plus, Pencil, Shield, Trash2, Bell, LogIn, LogOut } from "lucide-react";

const PAGE_SIZE = 10;
import { useLocation } from "wouter";

type Employee = {
  id: number;
  employeeId: string;
  name: string;
  nameKana?: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type RoleValue = "worker" | "staff" | "admin" | "応援";

export default function AdminEmployees() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ employeeId: string; name: string; nameKana: string; role: RoleValue; password: string }>({
    employeeId: "", name: "", nameKana: "", role: "worker", password: "",
  });

  // 削除確認ダイアログ用
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  // 通知コード発行ダイアログ用
  const [linkTokenDialog, setLinkTokenDialog] = useState<{
    open: boolean; employeeId: number; employeeName: string; token: string | null; expiresAt: string | null;
  } | null>(null);

  // 催促通知ダイアログ用（作業員）
  const [empNotifyDialog, setEmpNotifyDialog] = useState<{
    open: boolean; employeeId: number; employeeName: string; type: "clock-in" | "clock-out" | null;
  } | null>(null);

  const { data: employees, refetch } = trpc.master.listEmployees.useQuery({ includeInactive: false });
  const { data: linkedEmployeeIds = [] } = trpc.push.getEmployeesWithSubscriptions.useQuery();

  const createMutation = trpc.master.createEmployee.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      refetch();
      setSavedMsg("登録しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "登録に失敗しました"),
  });

  const updateMutation = trpc.master.updateEmployee.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      refetch();
      setSavedMsg("更新しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "更新に失敗しました"),
  });

  const deleteMutation = trpc.master.deleteEmployee.useMutation({
    onSuccess: () => {
      toast.success("作業員を削除しました");
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "削除に失敗しました"),
  });

  const generateLinkTokenMutation = trpc.push.generateLinkToken.useMutation({
    onSuccess: (data) => {
      setLinkTokenDialog(d => d ? { ...d, token: data.token, expiresAt: data.expiresAt } : d);
    },
    onError: (err) => toast.error(err.message || "コードの発行に失敗しました"),
  });

  const sendToEmployeeMutation = trpc.push.sendToEmployee.useMutation({
    onSuccess: (data) => {
      setEmpNotifyDialog(null);
      if (data.sent > 0) {
        toast.success("催促通知を送信しました");
      } else {
        toast.error("送信できる端末が見つかりませんでした");
      }
    },
    onError: (e) => toast.error(`送信失敗: ${e.message}`),
  });

  if (user?.role !== "admin") {
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

  const openCreate = () => {
    setEditTarget(null);
    setForm({ employeeId: "", name: "", nameKana: "", role: "worker", password: "" });
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setForm({
      employeeId: emp.employeeId,
      name: emp.name,
      nameKana: emp.nameKana ?? "",
      role: (["worker", "staff", "admin", "応援"].includes(emp.role) ? emp.role : "worker") as RoleValue,
      password: "",
    });
    setDialogOpen(true);
  };

  const openDeleteConfirm = (emp: Employee) => {
    setDeleteTarget(emp);
    setDeleteConfirmOpen(true);
  };

  const handleSubmit = () => {
    if (!form.employeeId || !form.name) {
      toast.error("従業員IDと氏名は必須です");
      return;
    }
    if (editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        employeeId: form.employeeId,
        name: form.name,
        nameKana: form.nameKana || undefined,
        role: form.role,
        password: form.password || undefined,
      });
    } else {
      createMutation.mutate({
        employeeId: form.employeeId,
        name: form.name,
        nameKana: form.nameKana || undefined,
        role: form.role,
        password: form.password || undefined,
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const roleLabel = (role: string) => {
    if (role === "admin") return "管理者";
    if (role === "staff") return "事務";
    if (role === "応援") return "応援";
    return "作業員";
  };

  const roleBadgeClass = (role: string) => {
    if (role === "admin") return "bg-purple-100 text-purple-700";
    if (role === "staff") return "bg-blue-100 text-blue-700";
    if (role === "応援") return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            作業員管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            作業員の登録・編集・ステータス管理を行います
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          作業員を登録
        </Button>
      </div>

      {/* 成功バナー */}
      {savedMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> {savedMsg}
        </div>
      )}

      {/* 作業員一覧 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {!employees || employees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">作業員が登録されていません</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                最初の作業員を登録
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">従業員ID</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">氏名</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">役割</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">登録日</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((emp) => (
                    <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{emp.employeeId}</td>
                      <td className="py-3 px-4 font-semibold">{emp.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className={`text-xs border-0 ${roleBadgeClass(emp.role)}`}>
                          {roleLabel(emp.role)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={`text-xs border-0 ${
                            emp.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {emp.status === "active" ? "稼働中" : "非稼働"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(emp.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {linkedEmployeeIds.includes(emp.id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEmpNotifyDialog({ open: true, employeeId: emp.id, employeeName: emp.name, type: null })}
                              className="h-8 gap-1.5 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            >
                              <Bell className="h-3.5 w-3.5" />
                              催促
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setLinkTokenDialog({ open: true, employeeId: emp.id, employeeName: emp.name, token: null, expiresAt: null });
                                generateLinkTokenMutation.mutate({ employeeId: emp.id });
                              }}
                              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Bell className="h-3.5 w-3.5" />
                              通知登録
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(emp)}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            編集
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteConfirm(emp)}
                            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            削除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Math.ceil(employees.length / PAGE_SIZE) > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, employees.length)} / {employees.length}件
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs px-2 tabular-nums">{page} / {Math.ceil(employees.length / PAGE_SIZE)}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setPage(p => Math.min(Math.ceil(employees.length / PAGE_SIZE), p + 1))} disabled={page === Math.ceil(employees.length / PAGE_SIZE)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 登録・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "作業員情報の編集" : "作業員の新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                従業員ID <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="例: EMP001"
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">給与計算システムと同じIDを入力してください</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                氏名 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="例: 山田 太郎"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                ひらがな名
                <span className="text-xs text-muted-foreground ml-2">（インドネシア語表示時に使用）</span>
              </Label>
              <Input
                placeholder="例：やまだ たろう"
                value={form.nameKana}
                onChange={(e) => setForm({ ...form, nameKana: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">役割</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as RoleValue, password: "" })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">作業員</SelectItem>
                  <SelectItem value="staff">事務</SelectItem>
                  <SelectItem value="admin">管理者</SelectItem>
                  <SelectItem value="応援">応援</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "admin" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  ログインパスワード
                  {editTarget && <span className="text-xs text-muted-foreground ml-2">（空欄のまま保存すると変更しません）</span>}
                </Label>
                <Input
                  placeholder={editTarget ? "変更する場合のみ入力" : "4文字以上で設定してください"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-10"
                  type="password"
                />
                <p className="text-xs text-muted-foreground">管理者はこのパスワードと従業員IDでログインできます</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "保存中..." : editTarget ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 通知登録コード発行ダイアログ */}
      {linkTokenDialog && (
        <Dialog open={linkTokenDialog.open} onOpenChange={(open) => { if (!open) setLinkTokenDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-sky-500" />
                通知登録コード
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{linkTokenDialog.employeeName}</span> さんの端末に通知を紐付けるコードです。
              </p>
              <div className="flex items-center justify-center py-4">
                {linkTokenDialog.token ? (
                  <span className="text-5xl font-bold tracking-[0.3em] text-sky-600">
                    {linkTokenDialog.token}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">発行中...</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                このコードを作業員に口頭で伝えてください。<br />
                作業員は「通知設定」ページで入力します。有効期限は30分です。
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkTokenDialog(null)}>閉じる</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 作業員催促通知ダイアログ */}
      {empNotifyDialog && (
        <Dialog open={empNotifyDialog.open} onOpenChange={(open) => { if (!open) setEmpNotifyDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-sky-500" />
                打刻催促通知を送る
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{empNotifyDialog.employeeName}</span> さんに送る催促の種類を選んでください。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setEmpNotifyDialog(d => d ? { ...d, type: "clock-in" } : d)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    empNotifyDialog.type === "clock-in"
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-border hover:border-sky-300 hover:bg-sky-50/50"
                  }`}
                >
                  <LogIn className="h-6 w-6" />
                  <span className="text-sm font-medium">出勤催促</span>
                </button>
                <button
                  onClick={() => setEmpNotifyDialog(d => d ? { ...d, type: "clock-out" } : d)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    empNotifyDialog.type === "clock-out"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-border hover:border-red-300 hover:bg-red-50/50"
                  }`}
                >
                  <LogOut className="h-6 w-6" />
                  <span className="text-sm font-medium">退勤催促</span>
                </button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEmpNotifyDialog(null)}>キャンセル</Button>
              <Button
                onClick={() => {
                  if (!empNotifyDialog.type) return;
                  sendToEmployeeMutation.mutate({ employeeId: empNotifyDialog.employeeId, type: empNotifyDialog.type });
                }}
                disabled={!empNotifyDialog.type || sendToEmployeeMutation.isPending}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {sendToEmployeeMutation.isPending ? "送信中..." : "送信する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { setDeleteConfirmOpen(open); if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              作業員の削除
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm">この作業員を削除しますか？</p>
            {deleteTarget && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{deleteTarget.name}</p>
                  <p className="text-xs text-muted-foreground">{deleteTarget.employeeId}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">削除後は一覧から非表示になります。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>キャンセル</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
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
