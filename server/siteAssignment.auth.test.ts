import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(role: string | null): TrpcContext {
  return {
    user: role === null ? null : {
      id: 1,
      openId: `test-${role}`,
      email: null,
      name: `テスト${role}`,
      loginMethod: "employee",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const upsertInput = { date: "2026-07-06", siteId: 1, assignments: [] };

describe("siteAssignment 認可", () => {
  it("未認証は閲覧(getByDate)できない", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.siteAssignment.getByDate({ date: "2026-07-06" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("一般ユーザー(user)は閲覧できない", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.siteAssignment.getByDate({ date: "2026-07-06" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("管理者(admin)は入力(upsertReport)できない（閲覧のみ）", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.siteAssignment.upsertReport(upsertInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("管理者(admin)は削除(deleteReport)できない", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.siteAssignment.deleteReport({ id: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("未認証は入力(upsertReport)できない", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.siteAssignment.upsertReport(upsertInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("owner ロールの権限体系", () => {
  it("owner は adminProcedure（既存の管理機能）も通過できる", async () => {
    // adminProcedureを使うAPIに owner でアクセスし、権限エラーに「ならない」ことを確認
    // （DB未接続環境のためDBエラーは許容し、FORBIDDENでないことだけ検証）
    const caller = appRouter.createCaller(createContext("owner"));
    try {
      await caller.siteAssignment.getByDate({ date: "2026-07-06" });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      expect(code).not.toBe("FORBIDDEN");
    }
  });
});
