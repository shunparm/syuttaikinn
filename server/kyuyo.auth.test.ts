import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createGuestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "test-worker",
      email: "worker@example.com",
      name: "一般ユーザー",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("kyuyo 認可（給与情報の保護）", () => {
  it("未認証では getMonthly が拒否される", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    await expect(
      caller.kyuyo.getMonthly({ year: 2026, month: 6 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("未認証では exportExcel が拒否される", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    await expect(
      caller.kyuyo.exportExcel({ year: 2026, month: 6 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("一般ユーザー(role=user)でも getMonthly が拒否される", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.kyuyo.getMonthly({ year: 2026, month: 6 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
