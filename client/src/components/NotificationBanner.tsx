import { Bell, BellOff, X } from "lucide-react";
import { useState } from "react";
import { usePushNotification } from "@/hooks/usePushNotification";

export function NotificationBanner() {
  const { permission, isSubscribed, isLoading, vapidReady, error, subscribe } = usePushNotification();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (permission === "unsupported") return null;
  if (isSubscribed) return null;
  if (permission === "granted") return null;

  const buttonDisabled = isLoading || !vapidReady;
  const buttonLabel = isLoading ? "設定中..." : !vapidReady ? "準備中..." : "受け取る";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
        <Bell className="h-4 w-4 text-sky-500 shrink-0" />
        <span className="flex-1 text-sky-800">
          {permission === "denied"
            ? "ブラウザの設定で通知を許可してください"
            : "打刻のリマインダー通知を受け取りますか？（8:00 / 17:00）"}
        </span>
        {permission !== "denied" && (
          <button
            onClick={subscribe}
            disabled={buttonDisabled}
            className="shrink-0 rounded-md bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        )}
        <button onClick={() => setDismissed(true)} className="shrink-0 text-sky-400 hover:text-sky-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 px-1">{error}</p>
      )}
    </div>
  );
}
