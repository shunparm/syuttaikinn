import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Clock, HardHat, MapPin, ChevronRight, ChevronLeft, Check } from "lucide-react";

type Step = "select-employee" | "select-site";

export default function ClockIn() {
  const [step, setStep] = useState<Step>("select-employee");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAnim, setShowAnim] = useState(false);

  const { data: employees } = trpc.master.listEmployees.useQuery();
  const { data: sites } = trpc.master.listSites.useQuery();
  const utils = trpc.useUtils();

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      utils.attendance.getActiveWorkers.invalidate();
      utils.attendance.getDashboardStats.invalidate();
      setShowAnim(true);
      setTimeout(() => {
        setShowAnim(false);
        setStep("select-employee");
        setSelectedEmployeeId(null);
        setSelectedSiteId(null);
        setErrorMsg("");
      }, 1800);
    },
    onError: (err) => {
      setErrorMsg(err.message || "出勤の記録に失敗しました");
    },
  });

  const selectedEmployee = employees?.find((e) => e.id === selectedEmployeeId);

  const handleSubmit = () => {
    if (!selectedEmployeeId || !selectedSiteId) return;
    setErrorMsg("");
    clockInMutation.mutate({
      employeeId: selectedEmployeeId,
      siteId: selectedSiteId,
    });
  };

  const steps = [
    { key: "select-employee", label: "作業員選択" },
    { key: "select-site", label: "現場選択" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          出勤
        </h1>
        <p className="text-sm text-muted-foreground mt-1">作業員と現場を選択して出勤を記録してください</p>
      </div>

      {/* ステップインジケーター */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              i === currentStepIndex ? "bg-orange-500 text-white"
              : i < currentStepIndex ? "bg-emerald-100 text-emerald-700"
              : "bg-muted text-muted-foreground"
            }`}>
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">
            {step === "select-employee" ? "① 作業員を選択" : "② 工事現場を選択"}
          </CardTitle>
          <CardDescription>
            現在時刻:{" "}
            <span className="font-semibold text-foreground">
              {new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent key={step} className="space-y-4">

          {/* ステップ1: 作業員選択 */}
          {step === "select-employee" && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <HardHat className="h-4 w-4 text-muted-foreground" />
                  作業員 <span className="text-destructive">*</span>
                </Label>
                {!employees || employees.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    作業員が登録されていません。管理者メニューから登録してください。
                  </p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
                    {employees.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setSelectedEmployeeId(emp.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-border/50 last:border-b-0 transition-colors ${
                          selectedEmployeeId === emp.id ? "bg-orange-50" : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <HardHat className={`h-4 w-4 shrink-0 ${selectedEmployeeId === emp.id ? "text-orange-500" : "text-muted-foreground"}`} />
                          <div>
                            <p className="text-sm font-semibold">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.employeeId}</p>
                          </div>
                        </div>
                        {selectedEmployeeId === emp.id && <Check className="h-4 w-4 text-orange-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                className="w-full h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => { if (selectedEmployeeId) { setStep("select-site"); setSelectedSiteId(null); } }}
                disabled={!selectedEmployeeId}
              >
                次へ <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </>
          )}

          {/* ステップ2: 現場選択 */}
          {step === "select-site" && (
            <>
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <HardHat className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{selectedEmployee?.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedEmployee?.employeeId}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  工事現場 <span className="text-destructive">*</span>
                </Label>
                {sites !== undefined && sites.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    現場が登録されていません。管理者メニュー「現場管理」から登録してください。
                  </p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
                    {sites?.map((site) => (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => setSelectedSiteId(site.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-border/50 last:border-b-0 transition-colors ${
                          selectedSiteId === site.id ? "bg-orange-50" : "bg-white hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className={`h-4 w-4 shrink-0 ${selectedSiteId === site.id ? "text-orange-500" : "text-muted-foreground"}`} />
                          <div>
                            <p className="text-sm font-semibold">{site.siteName}</p>
                            {site.location && <p className="text-xs text-muted-foreground">{site.location}</p>}
                          </div>
                        </div>
                        {selectedSiteId === site.id && <Check className="h-4 w-4 text-orange-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errorMsg && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{errorMsg}</p>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep("select-employee")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> 戻る
                </Button>
                <Button
                  className="flex-1 h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleSubmit}
                  disabled={clockInMutation.isPending || !selectedSiteId}
                >
                  {clockInMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      記録中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      本日もご安全に！
                    </span>
                  )}
                </Button>
              </div>
            </>
          )}

        </CardContent>
      </Card>

      {/* 成功アニメーションオーバーレイ */}
      {showAnim && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl px-12 py-10 flex flex-col items-center gap-4 shadow-2xl">
            <div className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-28 w-28 rounded-full bg-emerald-400 opacity-20 animate-ping" />
              <div
                className="relative p-5 rounded-full bg-emerald-100"
                style={{ animation: "scaleIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}
              >
                <svg className="h-16 w-16 text-emerald-600" viewBox="0 0 52 52" fill="none">
                  <circle cx="26" cy="26" r="25" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.2" />
                  <path
                    d="M14 26 L22 34 L38 18"
                    stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" fill="none"
                    style={{ strokeDasharray: 40, strokeDashoffset: 0, animation: "drawCheck 0.5s ease-out 0.3s both" }}
                  />
                </svg>
              </div>
            </div>
            <p className="text-lg font-bold text-gray-800">出勤を記録しました</p>
            <p className="text-sm text-gray-500">本日もご安全に！</p>
          </div>
        </div>
      )}
    </div>
  );
}
