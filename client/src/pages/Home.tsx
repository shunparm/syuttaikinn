import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Building2, Clock, HardHat, LogIn, LogOut, TrendingUp, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  color,
  onClick,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`border-0 shadow-sm hover:shadow-md transition-all duration-200 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1 text-foreground">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { data: stats, isLoading } = trpc.attendance.getDashboardStats.useQuery();
  const { data: activeWorkers } = trpc.attendance.getActiveWorkers.useQuery();

  const now = new Date();
  const timeStr = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="space-y-6">
      {/* スマホ用出勤・退勤ボタン */}
      {isMobile && (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button
            onClick={() => setLocation("/clock-in")}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 shadow-xl active:shadow-md active:translate-y-0.5 transition-all duration-100 text-white"
          >
            <LogIn className="h-10 w-10" />
            <span className="text-xl font-bold">出勤</span>
          </button>
          <button
            onClick={() => setLocation("/clock-out")}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-2xl bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-xl active:shadow-md active:translate-y-0.5 transition-all duration-100 text-white"
          >
            <LogOut className="h-10 w-10" />
            <span className="text-xl font-bold">退勤</span>
          </button>
        </div>
      )}
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-xl px-4 py-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-lg font-semibold text-primary tabular-nums">{timeStr}</span>
        </div>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="稼働中"
          value={isLoading ? "..." : (stats?.activeWorkers ?? 0)}
          icon={HardHat}
          description="現在出勤中の作業員"
          color="bg-amber-50 text-amber-500"
          onClick={() => setLocation("/active-workers")}
        />
        <StatCard
          title="本日出勤"
          value={isLoading ? "..." : (stats?.todayAttendance ?? 0)}
          icon={TrendingUp}
          description="本日の出勤記録数"
          color="bg-sky-50 text-sky-500"
          onClick={() => setLocation("/records")}
        />
        <StatCard
          title="作業員数"
          value={isLoading ? "..." : (stats?.totalEmployees ?? 0)}
          icon={Users}
          description="登録済み作業員"
          color="bg-violet-100 text-violet-600"
          onClick={() => user?.role === "admin" ? setLocation("/admin/employees") : undefined}
        />
        <StatCard
          title="現場数"
          value={isLoading ? "..." : (stats?.totalSites ?? 0)}
          icon={Building2}
          description="稼働中の工事現場"
          color="bg-amber-100 text-amber-600"
          onClick={() => user?.role === "admin" ? setLocation("/admin/sites") : undefined}
        />
      </div>

      {/* 稼働中作業員テーブル */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              出勤中の作業員
            </CardTitle>
            <button
              onClick={() => setLocation("/active-workers")}
              className="text-xs text-primary hover:underline"
            >
              すべて表示
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {!activeWorkers || activeWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HardHat className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">現在作業中の作業員はいません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">作業員名</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">現場名</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">出勤時刻</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">経過時間</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWorkers.slice(0, 5).map((w) => {
                    const elapsed = Math.floor(
                      (Date.now() - new Date(w.clockInTime).getTime()) / 60000
                    );
                    const h = Math.floor(elapsed / 60);
                    const m = elapsed % 60;
                    return (
                      <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 font-medium">{w.employeeName}</td>
                        <td className="py-3 px-3 text-muted-foreground">{w.siteName}</td>
                        <td className="py-3 px-3 text-muted-foreground tabular-nums">
                          {new Date(w.clockInTime).toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <Clock className="h-3 w-3" />
                            {h > 0 ? `${h}時間${m}分` : `${m}分`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* クイックアクション（PCのみ） */}
      {!isMobile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setLocation("/clock-in")}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-sky-50 group-hover:bg-sky-100 transition-colors">
                <Clock className="h-6 w-6 text-sky-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">出勤申請</p>
                <p className="text-xs text-muted-foreground mt-0.5">作業員・現場を選択して出勤</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setLocation("/clock-out")}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-red-50 group-hover:bg-red-100 transition-colors">
                <HardHat className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">退勤申請</p>
                <p className="text-xs text-muted-foreground mt-0.5">業務報告を入力して退勤</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
