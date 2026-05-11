import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

type Tab = "staff" | "admin";

export default function Login() {
  const [tab, setTab] = useState<Tab>("staff");

  // スタッフログイン
  const [staffId, setStaffId] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  // 管理者ログイン
  const [adminPassword, setAdminPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, password: staffPassword }),
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "ログインに失敗しました");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("ネットワークエラーが発生しました");
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "ログインに失敗しました");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("ネットワークエラーが発生しました");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">ログイン</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* タブ切り替え */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => { setTab("staff"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === "staff"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-muted-foreground hover:bg-muted/40"
              }`}
            >
              事務・スタッフ
            </button>
            <button
              type="button"
              onClick={() => { setTab("admin"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                tab === "admin"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              管理者
            </button>
          </div>

          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* スタッフログイン */}
          {tab === "staff" && (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staffId" className="text-sm font-medium">
                  社員ID
                </Label>
                <Input
                  id="staffId"
                  type="text"
                  placeholder="社員IDを入力してください"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staffPassword" className="text-sm font-medium">
                  パスワード
                </Label>
                <Input
                  id="staffPassword"
                  type="password"
                  placeholder="パスワードを入力してください"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !staffId || !staffPassword}
              >
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </form>
          )}

          {/* 管理者ログイン */}
          {tab === "admin" && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <p className="text-xs text-muted-foreground text-center">
                管理者パスワードのみでログインします
              </p>
              <div className="space-y-2">
                <Label htmlFor="adminPassword" className="text-sm font-medium">
                  管理者パスワード
                </Label>
                <Input
                  id="adminPassword"
                  type="password"
                  placeholder="管理者パスワードを入力してください"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !adminPassword}
              >
                {loading ? "ログイン中..." : "管理者としてログイン"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
