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
import { Users, Plus, Pencil, Shield } from "lucide-react";
import { useLocation } from "wouter";

type Employee = {
  id: number;
  employeeId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function AdminEmployees() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [form, setForm] = useState<{ employeeId: string; name: string; status: "active" | "inactive" }>({
    employeeId: "", name: "", status: "active",
  });

  const { data: employees, refetch } = trpc.master.listEmployees.useQuery({ includeInactive: true });

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
    setForm({ employeeId: "", name: "", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setForm({ employeeId: emp.employeeId, name: emp.name, status: emp.status === "inactive" ? "inactive" : "active" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.employeeId || !form.name) {
      toast.error("作業員IDと氏名は必須です");
      return;
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

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
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">作業員ID</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">氏名</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">登録日</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{emp.employeeId}</td>
                      <td className="py-3 px-4 font-semibold">{emp.name}</td>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(emp)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          編集
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                作業員ID <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="例: EMP001"
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="h-10"
                disabled={!!editTarget}
              />
              {editTarget && <p className="text-xs text-muted-foreground">作業員IDは変更できません</p>}
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
              <Label className="text-sm font-medium">ステータス</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">稼働中</SelectItem>
                  <SelectItem value="inactive">非稼働</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "保存中..." : editTarget ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
