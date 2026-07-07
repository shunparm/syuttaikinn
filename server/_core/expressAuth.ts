import type { NextFunction, Request, Response } from "express";
import { COOKIE_NAME, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import * as db from "../db";
import { ENV } from "./env";

/**
 * tRPC外のExpressルート用 管理者認証ミドルウェア。
 * createContext と同じセッションCookie(JWT)検証を行い、
 * 未ログインは401、管理者以外は403を返す。
 */
export async function requireAdminExpress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      res.status(401).json({ error: UNAUTHED_ERR_MSG });
      return;
    }

    const secretKey = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(sessionToken, secretKey, { algorithms: ["HS256"] });
    const openId = payload.openId as string | undefined;
    const user = openId ? await db.getUserByOpenId(openId) : null;

    if (!user) {
      res.status(401).json({ error: UNAUTHED_ERR_MSG });
      return;
    }
    if (!["admin", "owner"].includes(user.role)) {
      res.status(403).json({ error: NOT_ADMIN_ERR_MSG });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: UNAUTHED_ERR_MSG });
  }
}
