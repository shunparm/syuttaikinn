import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export type NotificationPermission = "default" | "granted" | "denied" | "unsupported";

export function usePushNotification() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: vapidData, isLoading: vapidLoading } = trpc.push.getVapidPublicKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  const vapidReady = !vapidLoading && !!vapidData?.publicKey;

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as NotificationPermission);

    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(sub !== null);
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!vapidData?.publicKey) {
      setError("サーバーの設定が読み込めません。ページを再読み込みしてください。");
      return;
    }
    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as NotificationPermission);
      if (perm === "denied") {
        setError("通知がブロックされました。ブラウザの設定から許可してください。");
        return;
      }
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setIsSubscribed(true);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setIsSubscribed(true);
    } catch (e) {
      setError(`通知の設定に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(false);
    }
  }, [vapidData, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return;
      }
      await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
      await sub.unsubscribe();
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [unsubscribeMutation]);

  return { permission, isSubscribed, isLoading, vapidReady, error, subscribe, unsubscribe };
}
