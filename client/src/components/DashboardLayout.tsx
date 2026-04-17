import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMobile";
import { usePushNotification } from "@/hooks/usePushNotification";
import {
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Building2,
  Download,
  FilePen,
  HardHat,
  LogIn,
  LogOut,
  PanelLeft,
  Shield,
  Users,
  UserCog,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

// ナビゲーション定義
const workerMenuItems = [
  { icon: BarChart3, label: "ダッシュボード", path: "/", iconColor: "text-violet-500" },
  { icon: LogIn, label: "出勤/Pergi kerja", path: "/clock-in", iconColor: "text-sky-500" },
  { icon: LogOut, label: "退勤/Pulang kerja", path: "/clock-out", iconColor: "text-red-500" },
  { icon: HardHat, label: "作業中/Sedang bekerja", path: "/active-workers", iconColor: "text-amber-500" },
  { icon: BookOpen, label: "出勤簿/Buku daftar hadir", path: "/records", iconColor: "text-emerald-500" },
  { icon: FilePen, label: "修正/Permohonan koreksi", path: "/correction", iconColor: "text-orange-500" },
];

const adminMenuItems = [
  { icon: Users, label: "作業員管理", path: "/admin/employees" },
  { icon: Building2, label: "現場管理", path: "/admin/sites" },
  { icon: Shield, label: "訂正申請管理", path: "/admin/corrections" },
  { icon: Download, label: "CSV出力", path: "/export" },
  { icon: UserCog, label: "ユーザー管理", path: "/admin/users" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

function useLoginUrl() {
  return "/login";
}

export default function DashboardLayout({ children, requireAuth = true }: { children: React.ReactNode; requireAuth?: boolean }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const loginUrl = useLoginUrl();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user && requireAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
              <HardHat className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center text-foreground">
              出退勤管理システム
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              このシステムを利用するにはログインが必要です。
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = loginUrl; }}
            size="lg"
            className="w-full"
          >
            ログイン
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const loginUrl = useLoginUrl();
  const { permission, isSubscribed, isLoading: notifLoading, subscribe, unsubscribe } = usePushNotification();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/clock-in";
  };
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin" || user?.role === "staff";

  const activeItem =
    [...workerMenuItems, ...adminMenuItems].find((item) => item.path === location);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          {/* ヘッダー */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-10 w-10 flex items-center justify-center bg-sidebar-accent/40 hover:bg-sidebar-accent border border-sidebar-border rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="サイドバー切替"
              >
                <PanelLeft className="h-5 w-5 text-sidebar-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-sidebar-primary/20 shrink-0">
                    <HardHat className="h-4 w-4 text-sidebar-primary" />
                  </div>
                  <span className="font-bold text-sm tracking-tight text-sidebar-foreground truncate">
                    東輝☀出退勤管理
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* メインメニュー */}
          <SidebarContent className="gap-0 py-2">
            <SidebarGroup>
              {!isCollapsed && (
                <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 mb-1">
                  メニュー
                </SidebarGroupLabel>
              )}
              <SidebarMenu className="px-2">
                {workerMenuItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className={`h-10 transition-all font-normal rounded-lg ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : item.iconColor || ""}`} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>

            {/* 管理者メニュー */}
            {isAdmin && (
              <SidebarGroup className="mt-2">
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    管理者
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {adminMenuItems.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-10 transition-all font-normal rounded-lg ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : item.iconColor || ""}`} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>

          {/* フッター（ユーザー情報） */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/60 transition-colors w-full text-left focus:outline-none">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-sidebar-primary/20 text-sidebar-primary">
                        {user.name?.charAt(0).toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    {!isCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-sidebar-foreground leading-none">
                          {user.name || "ユーザー"}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge
                            variant={isAdmin ? "default" : "secondary"}
                            className={`text-[10px] px-1.5 py-0 h-4 ${
                              user?.role === "admin"
                                ? "bg-sidebar-primary/20 text-sidebar-primary border-0"
                                : user?.role === "staff"
                                ? "bg-blue-100 text-blue-700 border-0"
                                : "bg-sidebar-accent/50 text-sidebar-foreground/60 border-0"
                            }`}
                          >
                            {user?.role === "admin" ? "管理者" : user?.role === "staff" ? "事務" : "作業員"}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={isSubscribed ? unsubscribe : subscribe}
                    disabled={notifLoading || permission === "denied" || permission === "unsupported"}
                    className="cursor-pointer"
                  >
                    {isSubscribed ? (
                      <>
                        <BellOff className="mr-2 h-4 w-4" />
                        <span>通知をオフにする</span>
                      </>
                    ) : (
                      <>
                        <Bell className="mr-2 h-4 w-4" />
                        <span>
                          {permission === "denied"
                            ? "通知がブロックされています"
                            : permission === "unsupported"
                            ? "この端末では通知を利用できません"
                            : "出退勤リマインダーを受け取る"}
                        </span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>ログアウト</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // 未ログイン時（PIN認証ページ用）: 管理者ログインボタンを表示
              !isCollapsed && (
                <button
                  onClick={() => { window.location.href = loginUrl; }}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent/60 transition-colors w-full text-left focus:outline-none text-xs text-sidebar-foreground/60 disabled:opacity-50"
                >
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>管理者ログイン</span>
                </button>
              )
            )}
          </SidebarFooter>
        </Sidebar>

        {/* リサイズハンドル */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors"
            onMouseDown={() => setIsResizing(true)}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      <SidebarInset>
        {/* モバイルヘッダー */}
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <div className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">
                  {activeItem?.label ?? "出退勤管理"}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
