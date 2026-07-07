import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT } from "jose";
import { ENV } from "./env";
import { getDb } from "../db";
import { employeeMaster } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword } from "../utils/password";

async function createSessionToken(openId: string, name: string): Promise<string> {
  const secretKey = new TextEncoder().encode(ENV.cookieSecret);
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(secretKey);
}

export function registerAuthRoutes(app: Express) {
  // 管理者ログイン: POST /api/auth/login { employeeId, password }
  // employeeId が空の場合は環境変数パスワードによる緊急スーパー管理者ログイン
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { employeeId, password } = req.body ?? {};

    if (!password) {
      res.status(400).json({ error: "パスワードを入力してください" });
      return;
    }

    // 社員IDが指定された場合: employee_master の管理者アカウントで認証
    if (employeeId) {
      const dbInstance = getDb();
      const rows = await dbInstance
        .select()
        .from(employeeMaster)
        .where(and(eq(employeeMaster.employeeId, employeeId), eq(employeeMaster.status, "active")))
        .limit(1);

      const employee = rows[0];

      if (!employee || !["admin", "owner"].includes(employee.role)) {
        res.status(401).json({ error: "社員IDまたはパスワードが正しくありません" });
        return;
      }

      if (!employee.passwordHash || !verifyPassword(password, employee.passwordHash)) {
        res.status(401).json({ error: "社員IDまたはパスワードが正しくありません" });
        return;
      }

      const openId = `admin-${employee.employeeId}`;
      await db.upsertUser({
        openId,
        name: employee.name,
        email: null,
        loginMethod: "employee",
        // employee_master のロールを引き継ぐ（owner=社長 / admin=管理者）
        role: employee.role === "owner" ? "owner" : "admin",
        lastSignedIn: new Date().toISOString(),
      });

      const sessionToken = await createSessionToken(openId, employee.name);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
      return;
    }

    // 社員IDなし: 環境変数パスワードによる緊急スーパー管理者ログイン
    if (!ENV.adminPassword || password !== ENV.adminPassword) {
      res.status(401).json({ error: "社員IDまたはパスワードが正しくありません" });
      return;
    }

    const openId = "local-admin";
    await db.upsertUser({
      openId,
      name: "管理者",
      email: null,
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date().toISOString(),
    });

    const sessionToken = await createSessionToken(openId, "管理者");
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
