import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, HardHat, MapPin, RefreshCw, Users } from "lucide-react";

function ElapsedTime({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calc = () => {
      setElapsed(Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000));
    };
    calc();
    const interval = setInterval(calc, 30000);
    return () => clearInterval(interval);
  }, [clockIn]);

  const h = Math.floor(elapsed / 60);
  const m = elapsed % 60;
  return (
    <span className="tabular-nums font-medium text-emerald-600">
      {h > 0 ? `${h}時間${m}分` : `${m}分`}
    </span>
  );
}

export default function ActiveWorkers() {
  const { data: workers, isLoading, refetch, dataUpdatedAt } = trpc.attendance.getActiveWorkers.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("clockInSuccess")) {
      sessionStorage.removeItem("clockInSuccess");
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "-";

  return (
    <div className="space-y-6">
      {/* 出勤成功バナー */}
      {showSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span className="text-lg">✓</span>
          出勤を記録しました。本日もご安全に！
        </div>
      )}
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            稼働中一覧
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            最終更新: {lastUpdated}（30秒ごとに自動更新）
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm px-3 py-1.5">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {workers?.length ?? 0}名稼働中
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            更新
          </Button>
        </div>
      </div>

      {/* 稼働中カード一覧 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-5">
                <div className="h-4 bg-muted rounded w-2/3 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !workers || workers.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <HardHat className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">現在稼働中の作業員はいません</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              出勤打刻を行うと、ここに表示されます
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id} className="border-0 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {worker.employeeName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{worker.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{worker.employeeCode}</p>
                    </div>
                  </div>
                  <span className="flex h-2.5 w-2.5 mt-1">
                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{worker.siteName}</span>
                  </div>
                  {worker.location && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span className="ml-5 truncate">{worker.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {new Date(worker.clockInTime).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      出勤
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">経過時間</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    <ElapsedTime clockIn={worker.clockInTime} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
