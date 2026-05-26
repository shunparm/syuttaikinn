import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// ページコンポーネント
import Home from "./pages/Home";
import ClockIn from "./pages/ClockIn";
import ClockOut from "./pages/ClockOut";
import ActiveWorkers from "./pages/ActiveWorkers";
import Records from "./pages/Records";
import Correction from "./pages/Correction";
import LeaveRequest from "./pages/LeaveRequest";
import Export from "./pages/Export";
import AdminEmployees from "./pages/admin/Employees";
import AdminSites from "./pages/admin/Sites";
import AdminCorrections from "./pages/admin/Corrections";
import AdminLeaveRequests from "./pages/admin/LeaveRequests";
import AdminUsers from "./pages/admin/Users";
import Login from "./pages/Login";
import NotificationSettings from "./pages/NotificationSettings";

// 作業員向けページ: ログイン不要でアクセス可能
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout requireAuth={false}>
      {children}
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">{() => <Login />}</Route>
      {/* 作業員向けページ: ログイン不要 */}
      <Route path="/clock-in">{() => <PublicLayout><ClockIn /></PublicLayout>}</Route>
      <Route path="/clock-out">{() => <PublicLayout><ClockOut /></PublicLayout>}</Route>
      <Route path="/correction">{() => <PublicLayout><Correction /></PublicLayout>}</Route>
      <Route path="/leave-request">{() => <PublicLayout><LeaveRequest /></PublicLayout>}</Route>
      {/* 認証不要ページ */}
      <Route path="/">{() => <PublicLayout><Home /></PublicLayout>}</Route>
      <Route path="/records">{() => <PublicLayout><Records /></PublicLayout>}</Route>
      <Route path="/notification-settings">{() => <PublicLayout><NotificationSettings /></PublicLayout>}</Route>
      {/* その他のページ: ログイン必須 */}
      <Route>
        {() => (
          <DashboardLayout>
            <Switch>
              <Route path="/active-workers" component={ActiveWorkers} />
              <Route path="/export" component={Export} />
              <Route path="/admin/employees" component={AdminEmployees} />
              <Route path="/admin/sites" component={AdminSites} />
              <Route path="/admin/corrections" component={AdminCorrections} />
              <Route path="/admin/leave-requests" component={AdminLeaveRequests} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Router />
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
