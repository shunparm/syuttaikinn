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
import { Building2, Plus, Pencil, Shield, MapPin } from "lucide-react";
import { useLocation } from "wouter";

type Site = {
  id: number;
  siteId: string;
  siteName: string;
  location: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function AdminSites() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Site | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [form, setForm] = useState<{
    siteId: string;
    siteName: string;
    location: string;
    status: "active" | "inactive";
  }>({ siteId: "", siteName: "", location: "", status: "active" });

  const { data: sites, refetch } = trpc.master.listSites.useQuery({ includeInactive: true });

  const createMutation = trpc.master.createSite.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      refetch();
      setSavedMsg("登録しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => toast.error(err.message || "登録に失敗しました"),
  });

  const updateMutation = trpc.master.updateSite.useMutation({
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
    setForm({ siteId: "", siteName: "", location: "", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditTarget(site);
    setForm({
      siteId: site.siteId,
      siteName: site.siteName,
      location: site.location ?? "",
      status: site.status === "inactive" ? "inactive" : "active",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.siteId || !form.siteName) {
      toast.error("現場IDと現場名は必須です");
      return;
    }
    const payload = {
      ...form,
      location: form.location || undefined,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            工事現場管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            工事現場の登録・編集・ステータス管理を行います
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          現場を登録
        </Button>
      </div>

      {/* 成功バナー */}
      {savedMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> {savedMsg}
        </div>
      )}

      {/* 現場一覧 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {!sites || sites.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">工事現場が登録されていません</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                最初の現場を登録
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">現場ID</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">現場名</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">場所</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">登録日</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{site.siteId}</td>
                      <td className="py-3 px-4 font-semibold">{site.siteName}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {site.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {site.location}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={`text-xs border-0 ${
                            site.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {site.status === "active" ? "稼働中" : "終了"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(site.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(site)}
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
            <DialogTitle>{editTarget ? "工事現場情報の編集" : "工事現場の新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                現場ID <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="例: SITE001"
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                現場名 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="例: ○○ビル新築工事"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">場所（任意）</Label>
              <Input
                placeholder="例: 東京都渋谷区○○1-2-3"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
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
                  <SelectItem value="inactive">終了</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "保存中..." : editTarget ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
