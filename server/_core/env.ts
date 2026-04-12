export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "change-this-secret-in-production",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  isProduction: process.env.NODE_ENV === "production",
};
