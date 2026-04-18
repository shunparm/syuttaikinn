import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePushNotification } from "@/hooks/usePushNotification";
import { Bell, BellOff, Clock, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function NotificationSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "staff";
  const { permission, isSubscribed, isLoading, vapidLoading, error, subscribe, unsubscribe } = usePushNotification();

  const { data: config, refetch } = trpc.push.getConfig.useQuery();
  const updateConfigMutation = trpc.push.updateConfig.useMutation({
    onSuccess: () => { toast.success("通知時刻を保存しました"); refetch(); },
    onError: (e) => toast.error(`保存失敗: ${e.message}`),
  });
  const sendTestMutation = trpc.push.sendTest.useMutation({
    onSuccess: () => toast.success("テスト通知を送信しました"),
    onError: (e) => toast.error(`送信失敗: ${e.message}`),
  });

  const [clockInTime, setClockInTime] = useState("08:00");
  const [clockOutTime, setClockOutTime] = useState("17:00");

  useEffect(() => {
    if (config) {
      setClockInTime(config.clock_in_time);
      setClockOutTime(config.clock_out_time);
    }
  }, [config]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6 text-sky-500" />
          通知設定
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          打刻リマインダーの受信設定を管理します
        </p>
      </div>

      {/* ON/OFF切り替え */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">リマインダー通知</CardTitle>
          <CardDescription>
            出勤・退勤の打刻忘れを防ぐ通知を受け取ります（平日のみ）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permission === "unsupported" && (
            <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
              このブラウザはプッシュ通知に対応していません。
              iPhoneの場合はホーム画面に追加してから設定してください。
            </p>
          )}
          {permission === "denied" && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              通知がブロックされています。ブラウザの設定から通知を「許可」にしてください。
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}

          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
            <div className="flex items-center gap-3">
              {isSubscribed
                ? <Bell className="h-5 w-5 text-sky-500" />
                : <BellOff className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">
                  {isSubscribed ? "通知ON" : "通知OFF"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isSubscribed ? "リマインダーを受け取っています" : "通知を受け取っていません"}
                </p>
              </div>
            </div>
            <Button
              variant={isSubscribed ? "outline" : "default"}
              size="sm"
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={isLoading || permission === "denied" || permission === "unsupported"}
            >
              {isLoading ? "処理中..." : isSubscribed ? "OFFにする" : vapidLoading ? "読込中..." : "ONにする"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 時刻設定（管理者のみ） */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              通知時刻の設定
            </CardTitle>
            <CardDescription>管理者のみ変更できます（日本時間・平日のみ送信）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">出勤リマインダー</label>
                <input
                  type="time"
                  value={clockInTime}
                  onChange={e => setClockInTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">退勤リマインダー</label>
                <input
                  type="time"
                  value={clockOutTime}
                  onChange={e => setClockOutTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <Button
              onClick={() => updateConfigMutation.mutate({ clockInTime, clockOutTime })}
              disabled={updateConfigMutation.isPending}
              className="w-full"
            >
              {updateConfigMutation.isPending ? "保存中..." : "時刻を保存"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* テスト送信（管理者のみ） */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />
              テスト送信
            </CardTitle>
            <CardDescription>通知を受け取る設定をした全員に今すぐ送信します</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => sendTestMutation.mutate()}
              disabled={sendTestMutation.isPending}
            >
              {sendTestMutation.isPending ? "送信中..." : "テスト通知を送信"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
