import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/features/auth/auth-provider";
import { LoginPage } from "@/features/auth/login-page";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { ThemeProvider } from "@/features/theme/theme-provider";
import { AuthenticatedLayout } from "@/app/layout/authenticated-layout";
import { Skeleton } from "@/shared/ui/skeleton";

const ExecutionDetailPage = lazy(() =>
  import("@/features/executions/execution-detail-page").then((module) => ({
    default: module.ExecutionDetailPage
  }))
);
const EngagementDashboardPage = lazy(() =>
  import("@/features/engagement/engagement-dashboard-page").then((module) => ({ default: module.EngagementDashboardPage }))
);
const PublicEngagementActionPage = lazy(() =>
  import("@/features/engagement/public-engagement-action-page").then((module) => ({ default: module.PublicEngagementActionPage }))
);
const PublicRegistrationPage = lazy(() =>
  import("@/features/events/public-registration-page").then((module) => ({
    default: module.PublicRegistrationPage
  }))
);
const PrivacyNoticePage = lazy(() =>
  import("@/features/privacy/privacy-notice-page").then((module) => ({ default: module.PrivacyNoticePage }))
);
const EventsPage = lazy(() =>
  import("@/features/events/events-page").then((module) => ({ default: module.EventsPage }))
);
const CredentialsPage = lazy(() =>
  import("@/features/credentials/credentials-page").then((module) => ({
    default: module.CredentialsPage
  }))
);
const ExecutionsPage = lazy(() =>
  import("@/features/executions/executions-page").then((module) => ({ default: module.ExecutionsPage }))
);
const MembersPage = lazy(() =>
  import("@/features/workspaces/members-page").then((module) => ({ default: module.MembersPage }))
);
const LeadsPage = lazy(() =>
  import("@/features/leads/leads-page").then((module) => ({ default: module.LeadsPage }))
);
const LeadDetailPage = lazy(() =>
  import("@/features/leads/lead-detail-page").then((module) => ({ default: module.LeadDetailPage }))
);
const WorkspaceSettingsPage = lazy(() =>
  import("@/features/workspaces/workspace-settings-page").then((module) => ({
    default: module.WorkspaceSettingsPage
  }))
);
const WorkspacesPage = lazy(() =>
  import("@/features/workspaces/workspaces-page").then((module) => ({ default: module.WorkspacesPage }))
);
const WorkflowDetailPage = lazy(() =>
  import("@/features/workflows/workflow-detail-page").then((module) => ({ default: module.WorkflowDetailPage }))
);
const WorkflowsPage = lazy(() =>
  import("@/features/workflows/workflows-page").then((module) => ({ default: module.WorkflowsPage }))
);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: false
      }
    }
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/app/workspaces" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/privacy" element={<LazyRoute page={<PrivacyNoticePage />} />} />
              <Route path="/engagement/action/:token" element={<LazyRoute page={<PublicEngagementActionPage />} />} />
              <Route
                path="/events/:eventId/register"
                element={<LazyRoute page={<PublicRegistrationPage />} />}
              />
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AuthenticatedLayout />}>
                  <Route index element={<Navigate to="/app/workspaces" replace />} />
                  <Route path="workspaces" element={<LazyRoute page={<WorkspacesPage />} />} />
                  <Route path="workspaces/:workspaceId" element={<Navigate to="engagement" replace />} />
                  <Route path="workspaces/:workspaceId/engagement" element={<LazyRoute page={<EngagementDashboardPage />} />} />
                  <Route path="workspaces/:workspaceId/events" element={<LazyRoute page={<EventsPage />} />} />
                  <Route path="workspaces/:workspaceId/workflows" element={<LazyRoute page={<WorkflowsPage />} />} />
                  <Route path="workspaces/:workspaceId/leads" element={<LazyRoute page={<LeadsPage />} />} />
                  <Route path="workspaces/:workspaceId/leads/:leadId" element={<LazyRoute page={<LeadDetailPage />} />} />
                  <Route
                    path="workspaces/:workspaceId/workflows/:workflowId"
                    element={<LazyRoute page={<WorkflowDetailPage />} />}
                  />
                  <Route
                    path="workspaces/:workspaceId/workflows/:workflowId/executions/:executionId"
                    element={<LazyRoute page={<ExecutionDetailPage />} />}
                  />
                  <Route
                    path="workspaces/:workspaceId/executions"
                    element={<LazyRoute page={<ExecutionsPage />} />}
                  />
                  <Route
                    path="workspaces/:workspaceId/credentials"
                    element={<LazyRoute page={<CredentialsPage />} />}
                  />
                  <Route path="workspaces/:workspaceId/members" element={<LazyRoute page={<MembersPage />} />} />
                  <Route
                    path="workspaces/:workspaceId/settings"
                    element={<LazyRoute page={<WorkspaceSettingsPage />} />}
                  />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/app/workspaces" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function LazyRoute({ page }: { page: ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{page}</Suspense>;
}

function RouteSkeleton() {
  return (
    <section className="grid gap-6 p-4 lg:p-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-72 w-full" />
    </section>
  );
}
