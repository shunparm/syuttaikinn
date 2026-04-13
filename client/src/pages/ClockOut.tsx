import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { HardHat, Clock, MapPin, FileText, Users, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

type Step = "select-employee" | "clock-out-form";

export default function ClockOut() {
  const [step, setStep] = useState<Step>("select-employee");
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [workReport, setWorkReport] = useState("");
  const [companionIds, setCompanionIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAnim, setShowAnim] = useState(false);
  const [clockOutTime, setClockOutTime] = useState("");
  const [clockInTimeForCalc, setClockInTimeForCalc] = useState<string | null>(null);

  const isMobile = useIsMobile();

  const { data: activeWorkers, isLoading } = trpc.attendance.getActiveWorkers.useQuery();
  const { data: employees } = trpc.master.listEmployees.useQuery();
  const utils = trpc.useUtils();

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      utils.attendance.getActiveWorkers.invalidate();
      utils.attendance.getDashboardStats.invalidate();
      const now = new Date();
      setClockOutTime(now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      setShowAnim(true);
      setTimeout(() => {
        setShowAnim(false);
        setStep("select-employee");
        setSelectedRecordId(null);
        setWorkReport("");
        setCompanionIds([]);
        setErrorMsg("");
        setClockInTimeForCalc(null);
      }, 1800);
    },
    onError: (err) => {
      setErrorMsg(err.message || "退勤の記録に失敗しました");
    },
  });

  const selectedWorker = activeWorkers?.find((w) => w.id === selectedRecordId);

  const handleSubmit = () => {
    if (!selectedRecordId) return;
    setErrorMsg("");
    if (selectedWorker?.clockInTime) {
      setClockInTimeForCalc(selectedWorker.clockInTime);
    }
    clockOutMutation.mutate({
      attendanceRecordId: selectedRecordId,
      workReport: workReport || undefined,
      companionEmployeeIds: companionIds.length > 0 ? companionIds : undefined,
    });
  };

  const formatElapsed = (clockIn: string) => {
    const elapsed = Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
    const h = Math.floor(elapsed / 60);
    const m = elapsed % 60;
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
  };

  const formatWorkingTime = (clockIn: string) => {
    const elapsed = Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
    const h = Math.floor(elapsed / 60);
    const m = elapsed % 60;
    return `${h}時間${String(m).padStart(2, "0")}分`;
  };

  // ─── 成功画面（ページ全体を差し替え） ────────────────────────────────────────
  if (showAnim) {
    return (
      <div className="max-w-lg mx-auto" translate="no">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="flex justify-center mb-6">
              <div className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-28 w-28 rounded-full bg-red-400 opacity-20 animate-ping" />
                <div
                  className="relative p-5 rounded-full bg-red-100"
                  style={{ animation: "scaleIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}
                >
                  <svg className="h-16 w-16 text-red-600" viewBox="0 0 52 52" fill="none">
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
            </div>
            <p className="text-lg font-bold text-gray-800">退勤を記録しました</p>
            {clockOutTime && (
              <p className="text-sm text-gray-500 mt-2">退勤時刻：{clockOutTime}</p>
            )}
            {clockInTimeForCalc && (
              <p className="text-sm text-gray-500 mt-1">勤務時間：{formatWorkingTime(clockInTimeForCalc)}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps = [
    { key: "select-employee", label: "作業員選択" },
    { key: "clock-out-form", label: "退勤入力" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl mx-auto space-y-6" translate="no">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <HardHat className="h-6 w-6 text-red-500" />
          退勤
        </h1>
        <p className="text-sm text-muted-foreground mt-1">稼働中の作業員を選択して退勤を記録してください</p>
      </div>

      {/* ステップインジケーター */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              i === currentStepIndex ? "bg-red-500 text-white"
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
            {step === "select-employee" ? "① 退勤する作業員を選択" : "② 退勤情報を入力"}
          </CardTitle>
          <CardDescription>
            現在時刻:{" "}
            <span className="font-semibold text-foreground">
              {new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ステップ1: 稼働中作業員選択 */}
          {step === "select-employee" && (
            <>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
              ) : !activeWorkers || activeWorkers.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <HardHat className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">現在稼働中の作業員はいません</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  {activeWorkers.map((worker) => (
                    <button
                      key={worker.id}
                      type="button"
                      onClick={() => setSelectedRecordId(worker.id)}
                      className={`w-full flex items-center gap-4 px-4 py-3 text-left border-b border-border/50 last:border-b-0 transition-colors ${
                        selectedRecordId === worker.id ? "bg-red-50" : "bg-white hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{worker.employeeName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{worker.siteName}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(worker.clockInTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 出勤
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          {formatElapsed(worker.clockInTime)}
                        </span>
                        {selectedRecordId === worker.id && <Check className="h-4 w-4 text-red-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {activeWorkers && activeWorkers.length > 0 && (
                <Button
                  className={`w-full text-base font-semibold bg-red-500 hover:bg-red-600 text-white${isMobile ? " h-20 text-xl font-bold sticky bottom-0 shadow-xl active:shadow-md active:translate-y-0.5 transition-all duration-100" : " h-12"}`}
                  onClick={() => { if (selectedRecordId) { setStep("clock-out-form"); setWorkReport(""); setCompanionIds([]); } }}
                  disabled={!selectedRecordId}
                >
                  次へ <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
              )}
            </>
          )}

          {/* ステップ2: 退勤情報入力 */}
          {step === "clock-out-form" && (
            <>
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <HardHat className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{selectedWorker?.employeeName}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedWorker?.siteName}</span>
                    {selectedWorker && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(selectedWorker.clockInTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 出勤
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* 同行作業員 */}
              {employees && employees.length > 1 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    同行作業員（任意）
                  </Label>
                  <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {employees
                      .filter((e) => e.id !== selectedWorker?.employeeId)
                      .map((emp) => (
                        <div key={emp.id} className="flex items-center gap-3 py-1">
                          <Checkbox
                            id={`companion-${emp.id}`}
                            checked={companionIds.includes(emp.id)}
                            onCheckedChange={() =>
                              setCompanionIds((prev) =>
                                prev.includes(emp.id) ? prev.filter((c) => c !== emp.id) : [...prev, emp.id]
                              )
                            }
                          />
                          <label htmlFor={`companion-${emp.id}`} className="text-sm cursor-pointer">
                            {emp.name}
                            <span className="text-xs text-muted-foreground ml-2">({emp.employeeId})</span>
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 作業日報 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  作業日報（任意）
                </Label>
                <Textarea
                  placeholder="本日の作業内容を入力してください..."
                  value={workReport}
                  onChange={(e) => setWorkReport(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep("select-employee")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> 戻る
                </Button>
                <Button
                  className={`flex-1 text-base font-semibold bg-red-500 hover:bg-red-600 text-white${isMobile ? " h-20 text-xl font-bold sticky bottom-0 shadow-xl active:shadow-md active:translate-y-0.5 transition-all duration-100" : " h-12"}`}
                  onClick={handleSubmit}
                  disabled={clockOutMutation.isPending}
                >
                  {clockOutMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      記録中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <HardHat className="h-5 w-5" />
                      退勤
                    </span>
                  )}
                </Button>
              </div>

              {errorMsg && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{errorMsg}</p>
              )}
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
