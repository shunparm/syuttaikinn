import { useState, useEffect } from "react";
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
import { useLang } from "@/hooks/useLang";
import { useIsMobile } from "@/hooks/useMobile";

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
  const [newClockInDate, setNewClockInDate] = useState("");
  const [newClockInTimeStr, setNewClockInTimeStr] = useState("");
  const [newClockOutDate, setNewClockOutDate] = useState("");
  const [newClockOutTimeStr, setNewClockOutTimeStr] = useState("");
  const [newSiteId, setNewSiteId] = useState<string>("");
  const [saved, setSaved] = useState(false);

  // date(YYYY-MM-DD) + time(HH:mm) → Date in JST
  const combineDT = (date: string, time: string): Date | undefined => {
    if (!date || !time) return undefined;
    return new Date(`${date}T${time}:00+09:00`);
  };

  const { lang, toggle, t } = useLang();
  const isMobile = useIsMobile();

  const displayName = (emp: { name: string; nameKana?: string | null }) =>
    lang === "id" && emp.nameKana ? emp.nameKana : emp.name;

  const { data: employees } = trpc.master.listEmployees.useQuery();
  const { data: sites } = trpc.master.listSites.useQuery();

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
      setNewClockInDate(""); setNewClockInTimeStr("");
      setNewClockOutDate(""); setNewClockOutTimeStr("");
      setNewSiteId("");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    },
    onError: (err) => {
      toast.error(err.message || t("申請の送信に失敗しました", "Gagal mengirim permohonan"));
    },
  });

  const selectedRecord = records?.find((r) => r.id === Number(selectedRecordId));
  const selectedEmployee = employees?.find((e) => e.id === Number(selectedEmployeeId));

  // time_correction 選択時 & レコード選択時に既存の日付を自動セット（日付忘れ防止）
  useEffect(() => {
    if (correctionType !== "time_correction" || !selectedRecord) return;
    const toJSTDate = (isoStr: string) => {
      const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000);
      return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
    };
    setNewClockInDate(toJSTDate(selectedRecord.clockInTime));
    setNewClockInTimeStr("");
    if (selectedRecord.clockOutTime) {
      setNewClockOutDate(toJSTDate(selectedRecord.clockOutTime));
      setNewClockOutTimeStr("");
    }
  }, [selectedRecordId, correctionType]);

  const handleSubmit = () => {
    if (!selectedEmployeeId || !selectedRecordId || !reason) {
      toast.error(t("必須項目を入力してください", "Harap isi semua kolom wajib"));
      return;
    }
    if (correctionType === "time_correction") {
      if (newClockInDate && !newClockInTimeStr) {
        toast.error(t("出勤時刻の時分を入力してください", "Masukkan jam/menit waktu masuk"));
        return;
      }
      if (!newClockInDate && newClockInTimeStr) {
        toast.error(t("出勤時刻の日付を入力してください", "Masukkan tanggal waktu masuk"));
        return;
      }
      if (newClockOutDate && !newClockOutTimeStr) {
        toast.error(t("退勤時刻の時分を入力してください", "Masukkan jam/menit waktu pulang"));
        return;
      }
      if (!newClockOutDate && newClockOutTimeStr) {
        toast.error(t("退勤時刻の日付を入力してください", "Masukkan tanggal waktu pulang"));
        return;
      }
    }
    if (correctionType === "time_correction" && !hasClockIn && !hasClockOut) {
      toast.error(t("修正する時刻を少なくとも1つ入力してください", "Masukkan setidaknya satu waktu yang ingin dikoreksi"));
      return;
    }
    createMutation.mutate({
      attendanceRecordId: Number(selectedRecordId),
      employeeId: Number(selectedEmployeeId),
      reason,
      correctionType,
      newClockInTime: combineDT(newClockInDate, newClockInTimeStr),
      newClockOutTime: combineDT(newClockOutDate, newClockOutTimeStr),
      newSiteId: newSiteId ? Number(newSiteId) : undefined,
    });
  };

  const hasClockIn  = !!(newClockInDate  && newClockInTimeStr);
  const hasClockOut = !!(newClockOutDate && newClockOutTimeStr);
  const isFormValid =
    selectedEmployeeId &&
    selectedRecordId &&
    reason &&
    (correctionType !== "time_correction" || hasClockIn || hasClockOut);

  // ステップ定義
  const steps = [
    { key: "select-employee", label: t("作業員選択", "Pilih Pekerja") },
    { key: "correction-form", label: t("申請内容入力", "Isi Permohonan") },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {t("訂正申請", "Permohonan Koreksi")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("打刻の訂正・キャンセルを申請できます", "Anda dapat mengajukan koreksi atau pembatalan absensi")}
          </p>
        </div>
        {isMobile && (
          <button
            onClick={toggle}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-white shadow-sm"
          >
            {lang === "ja" ? "🇮🇩 Indonesia" : "🇯🇵 日本語"}
          </button>
        )}
      </div>

      {/* 成功バナー */}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-medium">
          <span>✓</span> {t("訂正申請を送信しました", "Permohonan koreksi telah dikirim")}
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
            {step === "select-employee" && `① ${t("作業員を選択", "Pilih Pekerja")}`}
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
                  {t("作業員を選択", "Pilih Pekerja")}<span className="text-destructive">*</span>
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
                          <p className="text-sm font-semibold">{displayName(emp)}</p>
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
                  if (!selectedEmployeeId) { toast.error(t("作業員を選択してください", "Pilih pekerja terlebih dahulu")); return; }
                  setSelectedRecordId("");
                  setStep("correction-form");
                }}
                disabled={!selectedEmployeeId}
              >
                <span className="flex items-center gap-2">{t("次へ", "Berikutnya")} <ChevronRight className="h-4 w-4" /></span>
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
                  <p className="text-sm font-semibold">{selectedEmployee ? displayName(selectedEmployee) : ""}</p>
                  <p className="text-xs text-muted-foreground">{selectedEmployee?.employeeId}</p>
                </div>
              </div>

              {/* 対象記録選択 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("記録を選択", "Pilih Catatan")}<span className="text-destructive">*</span>
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
                  {t("訂正の種類", "Jenis Koreksi")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={correctionType}
                  onValueChange={(v) => {
                    setCorrectionType(v as typeof correctionType);
                    setNewClockInDate(""); setNewClockInTimeStr("");
                    setNewClockOutDate(""); setNewClockOutTimeStr("");
                    setNewSiteId("");
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_correction">{t("出勤時刻の修正", "Koreksi waktu masuk")} / {t("退勤時刻の修正", "Koreksi waktu pulang")}</SelectItem>
                    <SelectItem value="cancel">{t("記録のキャンセル", "Batalkan catatan")}</SelectItem>
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
                    <Label className="text-sm font-medium">{t("新しい出勤時刻", "Waktu masuk baru")}</Label>
                    <div className="flex gap-2">
                      <Input type="date" value={newClockInDate} onChange={(e) => setNewClockInDate(e.target.value)} className="h-11 flex-1" />
                      <Input type="time" value={newClockInTimeStr} onChange={(e) => setNewClockInTimeStr(e.target.value)} className="h-11 w-28" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("新しい退勤時刻", "Waktu pulang baru")}</Label>
                    <div className="flex gap-2">
                      <Input type="date" value={newClockOutDate} onChange={(e) => setNewClockOutDate(e.target.value)} className="h-11 flex-1" />
                      <Input type="time" value={newClockOutTimeStr} onChange={(e) => setNewClockOutTimeStr(e.target.value)} className="h-11 w-28" />
                    </div>
                  </div>
                </div>
              )}

              {/* 現場変更（site_change選択時のみ） */}
              {correctionType === "site_change" && (
                <div className="space-y-3 bg-muted/30 rounded-lg p-4 border border-border/50">
                  <p className="text-xs text-muted-foreground">変更先の現場を選択してください</p>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      新しい現場
                    </Label>
                    <Select value={newSiteId} onValueChange={setNewSiteId}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="現場を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.siteName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* 訂正理由 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("申請理由", "Alasan permohonan")} <span className="text-destructive">*</span>
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
                  <ChevronLeft className="h-4 w-4 mr-1" /> {t("戻る", "Kembali")}
                </Button>
                <Button
                  className="flex-1 h-11"
                  onClick={handleSubmit}
                  disabled={!isFormValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      {t("申請中...", "Memproses...")}
                    </span>
                  ) : t("申請する", "Ajukan")}
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
