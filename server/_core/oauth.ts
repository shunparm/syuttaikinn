import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT } from "jose";
import { ENV } from "./env";

async function createSessionToken(openId: string, name: string): Promise<string> {
  const secretKey = new TextEncoder().encode(ENV.cookieSecret);
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(secretKey);
}

export function registerAuthRoutes(app: Express) {
  // ログイン: POST /api/login { password }
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { password } = req.body ?? {};

    if (!password || password !== ENV.adminPassword) {
      res.status(401).json({ error: "パスワードが正しくありません" });
      return;
    }

    const openId = "local-admin";
    const name = "管理者";

    // 初回ログイン時にDBへユーザー登録
    await db.upsertUser({
      openId,
      name,
      email: null,
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date().toISOString(),
    });

    const sessionToken = await createSessionToken(openId, name);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.json({ success: true });
  });

  // ログアウト
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ success: true });
  });
}
