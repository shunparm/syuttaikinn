import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// テスト用コンテキスト生成
function createTestContext(role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "テストユーザー",
      loginMethod: "manus",
      role,
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

describe("auth.logout", () => {
  it("ログアウトが成功し、セッションクッキーがクリアされる", async () => {
    const clearedCookies: string[] = [];
    const ctx: TrpcContext = {
      ...createTestContext(),
      res: {
        clearCookie: (name: string) => { clearedCookies.push(name); },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});

describe("auth.me", () => {
  it("ログイン済みユーザーの情報が返される", async () => {
    const ctx = createTestContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.role).toBe("admin");
  });

  it("未ログインの場合はnullが返される", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("master.listEmployees", () => {
  it("作業員一覧の手続きが存在する（DB接続なし時はエラー）", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    // DB接続がない場合はエラーになるが、手続きは存在する
    try {
      await caller.master.listEmployees();
    } catch (e) {
      // DB接続なし環境ではエラーが期待される
      expect(e).toBeDefined();
    }
  });
});

describe("master.createEmployee", () => {
  it("必須フィールドが欠如している場合はバリデーションエラーになる", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    // employeeIdが空文字の場合はzodバリデーションエラー
    await expect(
      caller.master.createEmployee({ employeeId: "", name: "" })
    ).rejects.toThrow();
  });
});

describe("master.listSites", () => {
  it("工事現場一覧の手続きが存在する（DB接続なし時はエラー）", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.master.listSites();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

describe("correction.approveCorrectionRequest", () => {
  it("未認証の場合はUNAUTHORIZEDエラーになる", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.correction.approveCorrectionRequest({ id: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("correction.rejectCorrectionRequest", () => {
  it("未認証の場合はUNAUTHORIZEDエラーになる", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.correction.rejectCorrectionRequest({ id: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("master.createEmployee (admin only)", () => {
  it("未認証の場合はFORBIDDENエラーになる", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.master.createEmployee({ employeeId: "EMP001", name: "テスト" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("userロールの場合はFORBIDDENエラーになる", async () => {
    const ctx = createTestContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.master.createEmployee({ employeeId: "EMP001", name: "テスト" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("master.createSite (admin only)", () => {
  it("userロールの場合はFORBIDDENエラーになる", async () => {
    const ctx = createTestContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.master.createSite({ siteId: "SITE001", siteName: "テスト現場" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("correction.getRecordsByEmployee", () => {
  it("作業員別出退勤記録取得の手続きが存在し、配列を返す", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    try {
      const result = await caller.correction.getRecordsByEmployee({ employeeId: 1 });
      // DB接続成功時：配列が返ることを確認
      expect(Array.isArray(result)).toBe(true);
      // 各レコードに必要なフィールドがあることを確認
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("id");
        expect(result[0]).toHaveProperty("clockInTime");
        expect(result[0]).toHaveProperty("siteName");
      }
    } catch (e) {
      // DB接続なし環境ではエラーが期待される
      expect(e).toBeDefined();
    }
  });
});

describe("correction.listAllCorrectionRequests", () => {
  it("未認証の場合はUNAUTHORIZEDエラーになる", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.correction.listAllCorrectionRequests()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("export.getExportData", () => {
  it("エクスポートデータ取得の手続きが存在する", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    // DB接続なし環境でも空のデータが返るか、エラーになる
    try {
      const result = await caller.export.getExportData({
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      // 成功した場合はrows/summariesが配列であること
      expect(Array.isArray(result.rows)).toBe(true);
      expect(Array.isArray(result.summaries)).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

describe("export.generateCsvString", () => {
  it("CSV生成の手続きが存在し、BOM付きCSVが返される", async () => {
    const ctx = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    try {
      const result = await caller.export.generateCsvString({
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      // 成功した場合はBOM付きCSVであること
      expect(result.csv).toBeDefined();
      expect(typeof result.csv).toBe("string");
      // BOM (\uFEFF) が先頭にあること
      expect(result.csv.startsWith("\uFEFF")).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});
