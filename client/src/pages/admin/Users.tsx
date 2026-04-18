import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, LogIn, LogOut, Shield, User, Users, AlertTriangle } from "lucide-react";

type NotifyDialog = {
  open: boolean;
  openId: string;
  userName: string;
  type: "clock-in" | "clock-out" | null;
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [savedMsg, setSavedMsg] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: number;
    userName: string;
    newRole: "admin" | "user";
  } | null>(null);
  const [notifyDialog, setNotifyDialog] = useState<NotifyDialog | null>(null);

  const { data: userList, isLoading, refetch } = trpc.users.listUsers.useQuery();
  const { data: subscribedIds = [] } = trpc.push.getSubscribedUserIds.useQuery();

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      refetch();
      setConfirmDialog(null);
      setSavedMsg("ロールを変更しました");
      setTimeout(() => setSavedMsg(""), 3000);
    },
    onError: (err) => {
      toast.error(err.message || "ロールの変更に失敗しました");
      setConfirmDialog(null);
    },
  });

  const sendToUserMutation = trpc.push.sendToUser.useMutation({
    onSuccess: (data) => {
      setNotifyDialog(null);
      if (data.sent > 0) {
        toast.success("催促通知を送信しました");
      } else {
        toast.error("送信できる端末が見つかりませんでした。通知をONにしていない可能性があります。");
      }
    },
    onError: (e) => toast.error(`送信失敗: ${e.message}`),
  });

  const handleRoleChange = (userId: number, userName: string, newRole: "admin" | "user") => {
    setConfirmDialog({ open: true, userId, userName, newRole });
  };

  const confirmRoleChange = () => {
    if (!confirmDialog) return;
    updateRoleMutation.mutate({ userId: confirmDialog.userId, role: confirmDialog.newRole });
  };

  const openNotifyDialog = (openId: string, userName: string) => {
    setNotifyDialog({ open: true, openId, userName, type: null });
  };

  const confirmNotify = () => {
    if (!notifyDialog?.type) return;
    sendToUserMutation.mutate({ openId: notifyDialog.openId, type: notifyDialog.type });
  };

  const adminCount = userList?.filter((u) => u.role === "admin").length ?? 0;
  const userCount  = userList?.filter((u) => u.role === "user").length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          ユーザー管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ログインユーザーの一覧と管理者権限の付与・剥奪、打刻催促通知の送信を行います
        </p>
      </div>

      {/* 成功バナー */}
      {savedMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> {savedMsg}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{adminCount}</p>
              <p className="text-xs text-muted-foreground">管理者</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-slate-100">
              <Users className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{userCount}</p>
              <p className="text-xs text-muted-foreground">一般ユーザー</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ユーザー一覧 */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">ログインユーザー一覧</CardTitle>
          <CardDescription>
            <Bell className="h-3 w-3 inline mr-1 text-sky-500" />
            アイコンが表示されているユーザーには打刻催促通知を個別送信できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : !userList || userList.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">ユーザーがいません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {userList.map((u) => {
                const isSelf = currentUser?.id === u.id;
                const hasSubscription = subscribedIds.includes(u.openId);
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {(u.name ?? "?").charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm truncate">
                            {u.name ?? "（名前未設定）"}
                          </p>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 flex-shrink-0">
                              あなた
                            </Badge>
                          )}
                          {hasSubscription && (
                            <Bell className="h-3 w-3 text-sky-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {u.email ?? u.openId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          最終ログイン:{" "}
                          {u.lastSignedIn
                            ? new Date(u.lastSignedIn).toLocaleString("ja-JP", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* 催促通知ボタン（購読済みユーザーのみ） */}
                      {hasSubscription && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 text-sky-600 border-sky-200 hover:bg-sky-50"
                          onClick={() => openNotifyDialog(u.openId, u.name ?? "このユーザー")}
                        >
                          <Bell className="h-3 w-3 mr-1" />
                          催促
                        </Button>
                      )}
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className={
                          u.role === "admin"
                            ? "bg-primary/15 text-primary border-primary/20"
                            : ""
                        }
                      >
                        {u.role === "admin" ? (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            管理者
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            一般
                          </span>
                        )}
                      </Badge>
                      {!isSelf && (
                        <Button
                          size="sm"
                          variant={u.role === "admin" ? "outline" : "default"}
                          className={
                            u.role === "admin"
                              ? "text-xs h-8"
                              : "text-xs h-8 bg-primary hover:bg-primary/90"
                          }
                          onClick={() =>
                            handleRoleChange(
                              u.id,
                              u.name ?? "このユーザー",
                              u.role === "admin" ? "user" : "admin"
                            )
                          }
                        >
                          {u.role === "admin" ? "権限を剥奪" : "管理者に昇格"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 注意書き */}
      <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">管理者権限について</p>
          <p className="mt-0.5 text-amber-700">
            管理者は作業員・現場の登録・編集、訂正申請の承認・却下、CSV出力、ユーザーのロール変更が可能です。
            自分自身のロールは変更できません。
          </p>
        </div>
      </div>

      {/* ロール変更確認ダイアログ */}
      {confirmDialog && (
        <Dialog open={confirmDialog.open} onOpenChange={() => setConfirmDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>ロール変更の確認</DialogTitle>
              <DialogDescription>
                <span className="font-semibold text-foreground">{confirmDialog.userName}</span>{" "}
                さんのロールを{" "}
                <span className="font-semibold text-foreground">
                  {confirmDialog.newRole === "admin" ? "管理者" : "一般ユーザー"}
                </span>{" "}
                に変更しますか？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                キャンセル
              </Button>
              <Button
                onClick={confirmRoleChange}
                disabled={updateRoleMutation.isPending}
                className={
                  confirmDialog.newRole === "admin"
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-destructive hover:bg-destructive/90"
                }
              >
                {updateRoleMutation.isPending ? "変更中..." : "変更する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 催促通知ダイアログ */}
      {notifyDialog && (
        <Dialog open={notifyDialog.open} onOpenChange={() => setNotifyDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-sky-500" />
                打刻催促通知を送る
              </DialogTitle>
              <DialogDescription>
                <span className="font-semibold text-foreground">{notifyDialog.userName}</span>{" "}
                さんに送る催促の種類を選んでください。
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                onClick={() => setNotifyDialog(d => d ? { ...d, type: "clock-in" } : d)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  notifyDialog.type === "clock-in"
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-border hover:border-sky-300 hover:bg-sky-50/50"
                }`}
              >
                <LogIn className="h-6 w-6" />
                <span className="text-sm font-medium">出勤催促</span>
              </button>
              <button
                onClick={() => setNotifyDialog(d => d ? { ...d, type: "clock-out" } : d)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  notifyDialog.type === "clock-out"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-border hover:border-red-300 hover:bg-red-50/50"
                }`}
              >
                <LogOut className="h-6 w-6" />
                <span className="text-sm font-medium">退勤催促</span>
              </button>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setNotifyDialog(null)}>
                キャンセル
              </Button>
              <Button
                onClick={confirmNotify}
                disabled={!notifyDialog.type || sendToUserMutation.isPending}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {sendToUserMutation.isPending ? "送信中..." : "送信する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
