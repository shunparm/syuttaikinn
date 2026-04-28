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
import {
  CalendarDays,
  User,
  HardHat,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useLang } from "@/hooks/useLang";
import { useIsMobile } from "@/hooks/useMobile";

const leaveTypeLabels: Record<string, { ja: string; id: string }> = {
  paid_leave: { ja: "有給休暇", id: "Cuti berbayar" },
  substitute_holiday: { ja: "代休", id: "Cuti pengganti" },
  special_leave: { ja: "特別休暇", id: "Cuti khusus" },
  holiday_request: { ja: "休日希望", id: "Permintaan libur" },
};

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "審査中", className: "bg-amber-100 text-amber-700" },
  approved: { label: "承認済", className: "bg-blue-100 text-blue-700" },
  rejected: { label: "却下", className: "bg-red-100 text-red-700" },
};

type Step = "select-employee" | "request-form";

export default function LeaveRequest() {
  const [step, setStep] = useState<Step>("select-employee");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [leaveType, setLeaveType] = useState<
    "paid_leave" | "substitute_holiday" | "special_leave" | "holiday_request"
  >("paid_leave");
  const [requestDate, setRequestDate] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);

  const { lang, toggle, t } = useLang();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (sessionStorage.getItem("leaveRequestSuccess")) {
      sessionStorage.removeItem("leaveRequestSuccess");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    }
  }, []);

  const displayName = (emp: { name: string; nameKana?: string | null }) =>
    lang === "id" && emp.nameKana ? emp.nameKana : emp.name;

  const { data: employees } = trpc.master.listEmployees.useQuery();

  const { data: myRequests, refetch: refetchRequests } =
    trpc.leaveRequest.listByEmployee.useQuery(
      { employeeId: Number(selectedEmployeeId) },
      { enabled: !!selectedEmployeeId }
    );

  const createMutation = trpc.leaveRequest.create.useMutation({
    onSuccess: () => {
      sessionStorage.setItem("leaveRequestSuccess", "1");
      refetchRequests();
      setRequestDate("");
      setReason("");
      setLeaveType("paid_leave");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    },
    onError: (err) => {
      toast.error(err.message || t("申請の送信に失敗しました", "Gagal mengirim permohonan"));
    },
  });

  const selectedEmployee = employees?.find((e) => e.id === Number(selectedEmployeeId));

  const handleSubmit = () => {
    if (!selectedEmployeeId || !requestDate) {
      toast.error(t("必須項目を入力してください", "Harap isi semua kolom wajib"));
      return;
    }
    createMutation.mutate({
      employeeId: Number(selectedEmployeeId),
      leaveType,
      requestDate,
      reason: reason || undefined,
    });
  };

  const isFormValid = !!selectedEmployeeId && !!requestDate;

  const steps = [
    { key: "select-employee", label: t("作業員選択", "Pilih Pekerja") },
    { key: "request-form", label: t("申請内容入力", "Isi Permohonan") },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            {t("休暇申請", "Permohonan Cuti")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "有給休暇・代休・休日希望を申請できます",
              "Anda dapat mengajukan cuti berbayar, cuti pengganti, atau permintaan libur"
            )}
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
          <span>✓</span>{" "}
          {t("休暇申請を送信しました", "Permohonan cuti telah dikirim")}
        </div>
      )}

      {/* ステップインジケーター */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                i === currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < currentStepIndex
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">
            {step === "select-employee" &&
              `① ${t("作業員を選択", "Pilih Pekerja")}`}
            {step === "request-form" &&
              `② ${t("申請内容を入力", "Isi permohonan")}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ステップ1: 作業員選択 */}
          {step === "select-employee" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("作業員を選択", "Pilih Pekerja")}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
                  {employees?.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(String(emp.id))}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-border/50 last:border-b-0 transition-colors ${
                        selectedEmployeeId === String(emp.id)
                          ? "bg-orange-50"
                          : "bg-white hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <HardHat
                          className={`h-4 w-4 shrink-0 ${
                            selectedEmployeeId === String(emp.id)
                              ? "text-orange-500"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-semibold">
                            {displayName(emp)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {emp.employeeId}
                          </p>
                        </div>
                      </div>
                      {selectedEmployeeId === String(emp.id) && (
                        <Check className="h-4 w-4 text-orange-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full h-11"
                onClick={() => {
                  if (!selectedEmployeeId) {
                    toast.error(
                      t(
                        "作業員を選択してください",
                        "Pilih pekerja terlebih dahulu"
                      )
                    );
                    return;
                  }
                  setStep("request-form");
                }}
                disabled={!selectedEmployeeId}
              >
                <span className="flex items-center gap-2">
                  {t("次へ", "Berikutnya")}{" "}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Button>
            </>
          )}

          {/* ステップ2: 申請フォーム */}
          {step === "request-form" && (
            <>
              {/* 選択済み作業員 */}
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <User className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    {selectedEmployee ? displayName(selectedEmployee) : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEmployee?.employeeId}
                  </p>
                </div>
              </div>

              {/* 休暇種別 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("休暇の種類", "Jenis cuti")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={leaveType}
                  onValueChange={(v) => setLeaveType(v as typeof leaveType)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(leaveTypeLabels).map(([value, labels]) => (
                      <SelectItem key={value} value={value}>
                        {lang === "id" ? labels.id : labels.ja}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 申請日 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("希望日", "Tanggal yang diminta")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* 理由（任意） */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("理由・備考", "Alasan / keterangan")}{" "}
                  <span className="text-xs text-muted-foreground">
                    {t("（任意）", "(opsional)")}
                  </span>
                </Label>
                <Textarea
                  placeholder={t(
                    "理由や備考があれば入力してください...",
                    "Masukkan alasan atau keterangan jika ada..."
                  )}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => setStep("select-employee")}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />{" "}
                  {t("戻る", "Kembali")}
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
                  ) : (
                    t("申請する", "Ajukan")
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 自分の申請履歴 */}
      {myRequests && myRequests.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                {t("申請履歴", "Riwayat permohonan")}
              </CardTitle>
              <Badge
                variant="secondary"
                className="bg-muted text-muted-foreground border-0 text-xs"
              >
                {myRequests.length}件
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {myRequests.map((req) => {
                const st = statusMap[req.status] ?? {
                  label: req.status,
                  className: "bg-gray-100 text-gray-600",
                };
                return (
                  <div
                    key={req.id}
                    className="px-6 py-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {leaveTypeLabels[req.leaveType]
                              ? lang === "id"
                                ? leaveTypeLabels[req.leaveType].id
                                : leaveTypeLabels[req.leaveType].ja
                              : req.leaveType}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`border-0 text-xs ${st.className}`}
                          >
                            {st.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {t("希望日:", "Tanggal:")}{" "}
                            {new Date(req.requestDate).toLocaleDateString(
                              "ja-JP",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                weekday: "short",
                              }
                            )}
                          </span>
                        </div>
                        {req.reason && (
                          <p className="text-xs text-muted-foreground">
                            {t("理由:", "Alasan:")} {req.reason}
                          </p>
                        )}
                        {req.note && (
                          <p className="text-xs text-muted-foreground">
                            {t("管理者コメント:", "Komentar admin:")} {req.note}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {new Date(req.createdAt).toLocaleDateString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                        })}{" "}
                        申請
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
