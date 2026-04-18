import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initDb } from "../db";
import { startNotificationScheduler } from "../notificationScheduler";

async function startServer() {
  // DB初期化（テーブル作成）
  await initDb();

  // VAPIDキー確認ログ
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPrv = process.env.VAPID_PRIVATE_KEY;
  if (vapidPub && vapidPrv) {
    console.log(`[Push] VAPID keys found. Public key length: ${vapidPub.length}`);
  } else {
    console.warn(`[Push] VAPID keys NOT set. VAPID_PUBLIC_KEY=${!!vapidPub} VAPID_PRIVATE_KEY=${!!vapidPrv}`);
  }

  try {
    startNotificationScheduler();
  } catch (e) {
    console.error("[Push] Failed to start notification scheduler:", e);
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // 社内パスワード認証ルート
  registerAuthRoutes(app);

  // VAPID設定確認エンドポイント（診断用）
  app.get("/api/push-status", (_req, res) => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const prv = process.env.VAPID_PRIVATE_KEY;
    res.json({
      vapidPublicKeySet: !!pub,
      vapidPrivateKeySet: !!prv,
      publicKeyLength: pub?.length ?? 0,
      publicKeyPrefix: pub ? pub.substring(0, 10) + "..." : null,
    });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = parseInt(process.env.PORT ?? "3000", 10) || 3000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
