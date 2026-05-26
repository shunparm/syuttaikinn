import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Building2, CalendarDays, CalendarPlus, CheckCircle2, Clock, FilePen, HardHat, LogIn, LogOut, TrendingUp, Users, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
import { useLang } from "@/hooks/useLang";

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

const ONBOARDING_KEY = "onboarding_dismissed_v1";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { lang, toggle, t } = useLang();
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) === "true"
  );

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setOnboardingDismissed(true);
  };
  const { data: stats, isLoading } = trpc.attendance.getDashboardStats.useQuery();
  const { data: activeWorkers } = trpc.attendance.getActiveWorkers.useQuery();
  const isAdmin = user?.role === "admin";
  const { data: allCorrections } = trpc.correction.listAllCorrectionRequests.useQuery(undefined, { enabled: isAdmin });
  const { data: allLeaveRequests } = trpc.leaveRequest.listAll.useQuery(undefined, { enabled: isAdmin });
  const pendingCorrectionCount = allCorrections?.filter((c) => c.status === "pending").length ?? 0;
  const pendingLeaveCount = allLeaveRequests?.filter((l) => l.status === "pending").length ?? 0;
  const totalPending = pendingCorrectionCount + pendingLeaveCount;

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
            <span className="text-xl font-bold">{t("出勤", "Pergi kerja")}</span>
          </button>
          <button
            onClick={() => setLocation("/clock-out")}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-2xl bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-xl active:shadow-md active:translate-y-0.5 transition-all duration-100 text-white"
          >
            <LogOut className="h-10 w-10" />
            <span className="text-xl font-bold">{t("退勤", "Pulang kerja")}</span>
          </button>
        </div>
      )}
      {isMobile && (
        <div className="flex justify-end -mt-1">
          <button
            onClick={toggle}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-white shadow-sm"
          >
            {lang === "ja" ? "🇮🇩 Indonesia" : "🇯🇵 日本語"}
          </button>
        </div>
      )}
      {/* 作業員向けオンボーディングカード */}
      {!isAdmin && !onboardingDismissed && (
        <Card className="border border-violet-200 bg-violet-50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-violet-900">はじめての方へ — 使い方ガイド</p>
                  <button
                    onClick={dismissOnboarding}
                    className="p-1 rounded-full hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                    aria-label="閉じる"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-violet-700 mt-1">このアプリで毎日の出退勤を記録できます。3ステップだけです。</p>
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => setLocation("/clock-in")}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-violet-100 hover:bg-violet-50 transition-colors text-left"
                  >
                    <div className="p-1.5 rounded-lg bg-sky-100 shrink-0">
                      <LogIn className="h-4 w-4 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("① 出勤ボタンを押す", "① Tekan tombol masuk kerja")}</p>
                      <p className="text-xs text-muted-foreground">{t("現場に着いたら現場を選んで押す", "Pilih lokasi lalu tekan tombol")}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation("/clock-out")}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-violet-100 hover:bg-violet-50 transition-colors text-left"
                  >
                    <div className="p-1.5 rounded-lg bg-red-100 shrink-0">
                      <LogOut className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("② 退勤ボタンを押す", "② Tekan tombol pulang kerja")}</p>
                      <p className="text-xs text-muted-foreground">{t("帰る前に作業内容を入力して押す", "Isi laporan lalu tekan tombol")}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation("/correction")}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-violet-100 hover:bg-violet-50 transition-colors text-left"
                  >
                    <div className="p-1.5 rounded-lg bg-orange-100 shrink-0">
                      <FilePen className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("③ 打刻を間違えたら訂正申請", "③ Jika ada kesalahan, ajukan koreksi")}</p>
                      <p className="text-xs text-muted-foreground">{t("打刻ミスは申請ページから修正できます", "Buka halaman申請 untuk mengkoreksi")}</p>
                    </div>
                  </button>
                </div>
                <button
                  onClick={dismissOnboarding}
                  className="mt-3 text-xs text-violet-500 hover:text-violet-700 underline underline-offset-2"
                >
                  理解しました — 次回から表示しない
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
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

      {/* 初回セットアップガイド（管理者かつ作業員or現場が未登録） */}
      {user?.role === "admin" && !isLoading && ((stats?.totalEmployees ?? 0) === 0 || (stats?.totalSites ?? 0) === 0) && (
        <Card className="border border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-900">はじめに初期設定が必要です</p>
                <p className="text-sm text-amber-700 mt-1">出退勤管理を開始するには、以下の順番で設定してください。</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    {(stats?.totalEmployees ?? 0) > 0
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      : <span className="w-4 h-4 rounded-full bg-amber-300 flex items-center justify-center text-xs font-bold text-amber-900 shrink-0">1</span>
                    }
                    <span className={(stats?.totalEmployees ?? 0) > 0 ? "text-emerald-700 line-through" : "text-amber-800"}>作業員を登録する</span>
                    {(stats?.totalEmployees ?? 0) === 0 && (
                      <button onClick={() => setLocation("/admin/employees")} className="ml-auto text-xs font-medium text-amber-700 underline underline-offset-2">登録ページへ →</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {(stats?.totalSites ?? 0) > 0
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      : <span className="w-4 h-4 rounded-full bg-amber-300 flex items-center justify-center text-xs font-bold text-amber-900 shrink-0">2</span>
                    }
                    <span className={(stats?.totalSites ?? 0) > 0 ? "text-emerald-700 line-through" : "text-amber-800"}>工事現場を登録する</span>
                    {(stats?.totalSites ?? 0) === 0 && (
                      <button onClick={() => setLocation("/admin/sites")} className="ml-auto text-xs font-medium text-amber-700 underline underline-offset-2">登録ページへ →</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-amber-800/50">
                    <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    出勤打刻を開始する
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 保留中の申請通知（管理者・スタッフ向け） */}
      {isAdmin && totalPending > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {pendingCorrectionCount > 0 && (
            <button
              onClick={() => setLocation("/admin/corrections")}
              className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-left hover:bg-orange-100 transition-colors flex-1"
            >
              <FilePen className="h-5 w-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-800">訂正申請 {pendingCorrectionCount}件 が審査待ちです</p>
                <p className="text-xs text-orange-600">タップして確認する</p>
              </div>
            </button>
          )}
          {pendingLeaveCount > 0 && (
            <button
              onClick={() => setLocation("/admin/leave-requests")}
              className="flex items-center gap-3 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl text-left hover:bg-sky-100 transition-colors flex-1"
            >
              <CalendarDays className="h-5 w-5 text-sky-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-sky-800">休暇申請 {pendingLeaveCount}件 が審査待ちです</p>
                <p className="text-xs text-sky-600">タップして確認する</p>
              </div>
            </button>
          )}
        </div>
      )}

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <Card
            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setLocation("/leave-request")}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-50 group-hover:bg-green-100 transition-colors">
                <CalendarDays className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">休暇申請</p>
                <p className="text-xs text-muted-foreground mt-0.5">有給・代休・休日希望を申請</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
