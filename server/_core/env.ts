export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "change-this-secret-in-production",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  // 社長のブックマーク一発ログイン用キー（未設定なら機能自体が無効）
  ownerQuickLoginKey: process.env.OWNER_QUICK_LOGIN_KEY ?? null,
  isProduction: process.env.NODE_ENV === "production",
};
