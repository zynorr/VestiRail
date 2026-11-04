import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { AppShell } from "./components/AppShell";
import { Button, EmptyState } from "./components/ui";
import { Marketing } from "./pages/Marketing";
import { Overview } from "./pages/Overview";
import { Schedules } from "./pages/Schedules";
import { ScheduleDetail } from "./pages/ScheduleDetail";
import { CreateSchedule } from "./pages/CreateSchedule";
import { Beneficiaries } from "./pages/Beneficiaries";
import { BulkAllocations } from "./pages/BulkAllocations";
import { Activity } from "./pages/Activity";
import { Reports } from "./pages/Reports";
import { Portal } from "./pages/Portal";
import { Tokens } from "./pages/Tokens";
import { Settings } from "./pages/Settings";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function WorkspaceLayout() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}

function PortalRoute() {
  return (
    <WorkspaceProvider>
      <Portal />
    </WorkspaceProvider>
  );
}

function NotFound() {
  return (
    <div className="content">
      <EmptyState
        icon="alert"
        title="Page not found"
        description="This route is not part of the VestiRail workspace. Return to the overview or the public site."
        action={
          <div className="row">
            <a href="/app">
              <Button variant="primary" icon="overview">
                Go to overview
              </Button>
            </a>
            <a href="/">
              <Button variant="secondary">Public site</Button>
            </a>
          </div>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Marketing />} />
          <Route path="/app" element={<WorkspaceLayout />}>
            <Route index element={<Overview />} />
            <Route path="schedules" element={<Schedules />} />
            <Route path="schedules/:id" element={<ScheduleDetail />} />
            <Route path="beneficiaries" element={<Beneficiaries />} />
            <Route path="bulk" element={<BulkAllocations />} />
            <Route path="activity" element={<Activity />} />
            <Route path="reports" element={<Reports />} />
            <Route path="create" element={<CreateSchedule />} />
            <Route path="tokens" element={<Tokens />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/portal" element={<PortalRoute />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
