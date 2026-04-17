import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { masterRouter } from "./routers/master";
import { attendanceRouter } from "./routers/attendance";
import { correctionRouter } from "./routers/correction";
import { exportRouter } from "./routers/export";
import { usersRouter } from "./routers/users";
import { pushNotificationRouter } from "./routers/pushNotification";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // 作業員・工事現場管理
  master: masterRouter,

  // 出退勤記録
  attendance: attendanceRouter,

  // 訂正申請
  correction: correctionRouter,

  // CSV出力
  export: exportRouter,

  // ユーザー管理
  users: usersRouter,

  // プッシュ通知
  push: pushNotificationRouter,
});

export type AppRouter = typeof appRouter;
