import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT } from "jose";
import { ENV } from "./env";
import { getDb } from "../db";
import { employeeMaster } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function createSessionToken(openId: string, name: string): Promise<string> {
  const secretKey = new TextEncoder().encode(ENV.cookieSecret);
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(secretKey);
}

export function registerAuthRoutes(app: Express) {
  // 管理者ログイン: POST /api/auth/login { password }
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { password } = req.body ?? {};

    if (!password || password !== ENV.adminPassword) {
      res.status(401).json({ error: "パスワードが正しくありません" });
      return;
    }

    const openId = "local-admin";
    const name = "管理者";

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

  // 事務・スタッフログイン: POST /api/auth/login-staff { staffId, password }
  app.post("/api/auth/login-staff", async (req: Request, res: Response) => {
    const { staffId, password } = req.body ?? {};

    if (!staffId || !password) {
      res.status(400).json({ error: "社員IDとパスワードを入力してください" });
      return;
    }

    const dbInstance = getDb();
    const rows = await dbInstance
      .select()
      .from(employeeMaster)
      .where(eq(employeeMaster.employeeId, staffId))
      .limit(1);

    const employee = rows[0];

    if (!employee) {
      res.status(401).json({ error: "社員IDまたはパスワードが正しくありません" });
      return;
    }

    if (employee.pin !== password) {
      res.status(401).json({ error: "社員IDまたはパスワードが正しくありません" });
      return;
    }

    const empRole = (employee as any).role ?? "worker";
    if (empRole !== "staff" && empRole !== "admin") {
      res.status(403).json({ error: "このアカウントにはログイン権限がありません" });
      return;
    }

    const openId = `staff-${employee.employeeId}`;

    await db.upsertUser({
      openId,
      name: employee.name,
      email: null,
      loginMethod: "staff",
      role: empRole === "admin" ? "admin" : "staff",
      lastSignedIn: new Date().toISOString(),
    });

    const sessionToken = await createSessionToken(openId, employee.name);
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
