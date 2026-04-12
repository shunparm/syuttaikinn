import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Clock, MapPin, User, AlertCircle, HardHat, ChevronRight, ChevronLeft, Check } from "lucide-react";

const correctionTypeLabels = {
  time_correction: "時刻の修正",
  cancel: "記録のキャンセル",
  site_change: "現場の変更",
  other: "その他",
};

function formatTime(date: Date | string | null) {
  if (!date) return "―";
  return new Date(date).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date | string | null) {
  if (!date) return "―";
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

type Step = "select-employee" | "correction-form";

export default function Correction() {
  const [step, setStep] = useState<Step>("select-employee");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [correctionType, setCorrectionType] = useState<"time_correction" | "cancel" | "site_change" | "other">("cancel");
  const [reason, setReason] = useState("");
  const [newClockInTime, setNewClockInTime] = useState("");
  const [newClockOutTime, setNewClockOutTime] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: employees } = trpc.master.listEmployees.useQuery();

  const { data: records } = trpc.correction.getRecordsByEmployee.useQuery(
    { employeeId: Number(selectedEmployeeId) },
    { enabled: !!selectedEmployeeId }
  );

  const { data: myRequests, refetch: refetchRequests } =
    trpc.correction.listCorrectionRequests.useQuery({ status: "pending" });

  const createMutation = trpc.correction.createCorrectionRequest.useMutation({
    onSuccess: () => {
      refetchRequests();
      setStep("select-employee");
      setSelectedEmployeeId("");
      setSelectedRecordId("");
      setCorrectionType("cancel");
      setReason("");
      setNewClockInTime("");
      setNewClockOutTime("");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    },
    onError: (err) => {
      toast.error(err.message || "申請の送信に失敗しました");
    },
  });

  const selectedRecord = records?.find((r) => r.id === Number(selectedRecordId));
  const selectedEmployee = employees?.find((e) => e.id === Number(selectedEmployeeId));

  const handleSubmit = () => {
    if (!selectedEmployeeId || !selectedRecordId || !reason) {
      toast.error("必須項目を入力してください");
      return;
    }
    if (correctionType === "time_correction" && !newClockInTime && !newClockOutTime) {
      toast.error("修正する時刻を少なくとも1つ入力してください");
      return;
    }
    createMutation.mutate({
      attendanceRecordId: Number(selectedRecordId),
      employeeId: Number(selectedEmployeeId),
      reason,
      correctionType,
      newClockInTime: newClockInTime ? new Date(newClockInTime) : undefined,
      newClockOutTime: newClockOutTime ? new Date(newClockOutTime) : undefined,
    });
  };

  const isFormValid =
    selectedEmployeeId &&
    selectedRecordId &&
    reason &&
    (correctionType !== "time_correction" || newClockInTime || newClockOutTime);

  // ステップ定義
  const steps = [
    { key: "select-employee", label: "作業員選択" },
    { key: "correction-form", label: "申請内容入力" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          訂正申請
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          打刻ミスがある場合は訂正申請を送信してください。管理者が審査します。
        </p>
      </div>

      {/* 成功バナー */}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> 訂正申請を送信しました
        </div>
      )}

      {/* ステップインジケーター */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              i === currentStepIndex
                ? "bg-primary text-primary-foreground"
                : i < currentStepIndex
                ? "bg-emerald-100 text-emerald-700"
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
            {step === "select-employee" && "① 作業員を選択"}
            {step === "correction-form" && "② 訂正内容を入力"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ステップ1: 作業員選択（カードリスト） */}
          {step === "select-employee" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  申請者（作業員名）<span className="text-destructive">*</span>
                </Label>
                <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
                  {employees?.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(String(emp.id))}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-border/50 last:border-b-0 transition-colors ${
                        selectedEmployeeId === String(emp.id) ? "bg-orange-50" : "bg-white hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <HardHat className={`h-4 w-4 shrink-0 ${selectedEmployeeId === String(emp.id) ? "text-orange-500" : "text-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-semibold">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.employeeId}</p>
                        </div>
                      </div>
                      {selectedEmployeeId === String(emp.id) && <Check className="h-4 w-4 text-orange-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full h-11"
                onClick={() => {
                  if (!selectedEmployeeId) { toast.error("作業員を選択してください"); return; }
                  setSelectedRecordId("");
                  setStep("correction-form");
                }}
                disabled={!selectedEmployeeId}
              >
                <span className="flex items-center gap-2">次へ <ChevronRight className="h-4 w-4" /></span>
              </Button>
            </>
          )}

          {/* ステップ2: 申請フォーム */}
          {step === "correction-form" && (
            <>
              {/* 選択済み作業員表示 */}
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <User className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{selectedEmployee?.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedEmployee?.employeeId}</p>
                </div>
              </div>

              {/* 対象記録選択 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  対象の出退勤記録<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedRecordId}
                  onValueChange={setSelectedRecordId}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="訂正する記録を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {records && records.length === 0 && (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        該当する記録がありません
                      </div>
                    )}
                    {records?.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {new Date(r.clockInTime).toLocaleDateString("ja-JP", {
                              month: "numeric",
                              day: "numeric",
                              weekday: "short",
                            })}
                          </span>
                          <span className="text-muted-foreground">|</span>
                          <span>{r.siteName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(r.clockInTime)}〜{r.clockOutTime ? formatTime(r.clockOutTime) : "稼働中"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 選択記録プレビュー */}
              {selectedRecord && (
                <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm border border-border/50">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    選択中の記録
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{formatDate(selectedRecord.clockInTime)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{selectedRecord.siteName}</span>
                  </div>
                  <div className="flex gap-6 pt-1">
                    <div>
                      <span className="text-xs text-muted-foreground">出勤</span>
                      <span className="ml-2 font-semibold">{formatTime(selectedRecord.clockInTime)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">退勤</span>
                      <span className="ml-2 font-semibold">
                        {selectedRecord.clockOutTime ? formatTime(selectedRecord.clockOutTime) : "稼働中"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 訂正種別 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  訂正の種類 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={correctionType}
                  onValueChange={(v) => {
                    setCorrectionType(v as typeof correctionType);
                    setNewClockInTime("");
                    setNewClockOutTime("");
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_correction">時刻の修正</SelectItem>
                    <SelectItem value="cancel">記録のキャンセル</SelectItem>
                    <SelectItem value="site_change">現場の変更</SelectItem>
                    <SelectItem value="other">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 時刻入力（「時刻の修正」選択時のみ表示） */}
              {correctionType === "time_correction" && (
                <div className="space-y-3 bg-muted/30 rounded-lg p-4 border border-border/50">
                  <p className="text-xs text-muted-foreground">修正する時刻を入力してください（片方のみでも可）</p>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">新しい出勤時刻</Label>
                    <Input
                      type="datetime-local"
                      value={newClockInTime}
                      onChange={(e) => setNewClockInTime(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">新しい退勤時刻</Label>
                    <Input
                      type="datetime-local"
                      value={newClockOutTime}
                      onChange={(e) => setNewClockOutTime(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
              )}

              {/* 訂正理由 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  訂正理由 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="訂正が必要な理由を入力してください..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep("select-employee")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> 戻る
                </Button>
                <Button
                  className="flex-1 h-11"
                  onClick={handleSubmit}
                  disabled={!isFormValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      送信中...
                    </span>
                  ) : "申請する"}
                </Button>
              </div>
            </>
          )}

        </CardContent>
      </Card>

      {/* 審査待ち一覧（送信後に下部表示・承認/却下後は自動で消える） */}
      {myRequests && myRequests.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                審査待ちの申請
              </CardTitle>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0 text-xs">
                {myRequests.length}件
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              管理者が承認または却下すると、この一覧から消えます
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {myRequests.map((req) => (
                <div key={req.id} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{req.employeeName}</span>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0 text-xs">
                          審査中
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {correctionTypeLabels[req.correctionType as keyof typeof correctionTypeLabels]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {req.siteName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          {formatTime(req.clockInTime)} 〜 {req.clockOutTime ? formatTime(req.clockOutTime) : "稼働中"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        理由：{req.reason}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {new Date(req.createdAt).toLocaleDateString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                      })} 申請
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
