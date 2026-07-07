import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { requireAdminExpress } from "./_core/expressAuth";

function createMockRes() {
  const state = { statusCode: 0, body: null as unknown };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

describe("requireAdminExpress（Excelダウンロードルートの認証）", () => {
  it("Cookieなし（未ログイン）は401で拒否され、nextは呼ばれない", async () => {
    const req = { headers: {} } as Request;
    const { res, state } = createMockRes();
    let nextCalled = false;

    await requireAdminExpress(req, res, () => { nextCalled = true; });

    expect(state.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it("不正なセッショントークンは401で拒否される", async () => {
    const req = {
      headers: { cookie: "app_session_id=invalid-token" },
    } as Request;
    const { res, state } = createMockRes();
    let nextCalled = false;

    await requireAdminExpress(req, res, () => { nextCalled = true; });

    expect(state.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });
});
