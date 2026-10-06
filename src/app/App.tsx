import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { AuthPage } from "../auth/AuthPage";
import type { ApiService } from "../lib/api";
import type { AuthService, AuthSession, SupabaseSubmissionService } from "../lib/supabase";
import { NewReportPage } from "../new-report/NewReportPage";
import { WorkbenchPage } from "../workbench/WorkbenchPage";
import type { WorkbenchPageServices } from "../workbench/services";

export interface WebServices {
  auth: AuthService;
  api: ApiService;
  supabase: SupabaseSubmissionService;
  hashFile: (file: File) => Promise<string>;
  createTaskId: () => string;
  createIdempotencyKey: () => string;
  createFeeQuoteRequestId: () => string;
  workbench: WorkbenchPageServices;
}

function ProtectedWorkbenchRoute({
  session,
  services,
  resource,
}: {
  session: AuthSession | null;
  services: WebServices;
  resource: "report" | "task";
}) {
  const location = useLocation();
  const params = useParams();
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return <WorkbenchPage viewerUserId={session.user.id} services={services.workbench}
    {...(resource === "report" ? { reportId: params.reportId } : { taskId: params.taskId })} />;
}

function ProtectedReportRoute({ session, services }: { session: AuthSession | null; services: WebServices }) {
  const location = useLocation();
  return session
    ? <NewReportPage key={session.user.id} viewerUserId={session.user.id} services={services} />
    : <Navigate to="/auth" replace state={{ from: location.pathname }} />;
}

export function AppRoutes({ services }: { services: WebServices }) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    void services.auth.getSession().then(
      (current) => { if (mounted) setSession(current); },
      () => { if (mounted) setSession(null); },
    );
    const unsubscribe = services.auth.onAuthStateChange((current) => {
      if (mounted) setSession(current);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [services.auth]);

  if (session === undefined) {
    return <main className="loading-shell" role="status">正在检查登录状态…</main>;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={session ? "/new-report" : "/auth"} replace />} />
      <Route path="/auth" element={session ? <Navigate to="/new-report" replace /> : <AuthPage auth={services.auth} />} />
      <Route path="/new-report" element={<ProtectedReportRoute session={session} services={services} />} />
      <Route path="/reports/:reportId" element={<ProtectedWorkbenchRoute session={session} services={services} resource="report" />} />
      <Route path="/tasks/:taskId/workbench" element={<ProtectedWorkbenchRoute session={session} services={services} resource="task" />} />
      <Route path="*" element={<Navigate to={session ? "/new-report" : "/auth"} replace />} />
    </Routes>
  );
}

export function App({ services }: { services: WebServices }) {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes services={services} />
    </HashRouter>
  );
}
