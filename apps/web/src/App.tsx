import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { useAuthStore } from './stores/auth-store';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/ui/PageLoader';

// Auth pages
const LoginPage = lazy(() => import('./pages/login'));
const ForgotPasswordPage = lazy(() => import('./pages/forgot-password'));
const ResetPasswordPage = lazy(() => import('./pages/reset-password'));
const ChangePasswordPage = lazy(() => import('./pages/change-password'));

// Public pages
const DocsMcpPage = lazy(() => import('./pages/docs/mcp'));

// Portail client (public, hors MainLayout)
const PortalLoginPage = lazy(() => import('./pages/portail/login'));
const PortalMandatPage = lazy(() => import('./pages/portail/mandat'));

// Protected pages
const DashboardPage = lazy(() => import('./pages/dashboard/index'));
const MonEspacePage = lazy(() => import('./pages/mon-espace/index'));
const MesMandatsPage = lazy(() => import('./pages/mes-mandats/index'));
const SettingsPage = lazy(() => import('./pages/settings/index'));
const CandidatsPage = lazy(() => import('./pages/candidats/index'));
const CandidatDetailPage = lazy(() => import('./pages/candidats/[id]'));
const CandidatNewPage = lazy(() => import('./pages/candidats/new'));
const CandidatDuplicatesPage = lazy(() => import('./pages/candidats/duplicates'));
const EntreprisesPage = lazy(() => import('./pages/entreprises/index'));
const EntrepriseDetailPage = lazy(() => import('./pages/entreprises/[id]'));
const EntrepriseNewPage = lazy(() => import('./pages/entreprises/new'));
const ClientsPage = lazy(() => import('./pages/clients/index'));
const ClientDetailPage = lazy(() => import('./pages/clients/[id]'));
const ClientNewPage = lazy(() => import('./pages/clients/new'));
const ClientPipelinePage = lazy(() => import('./pages/clients/pipeline'));
const MandatsPage = lazy(() => import('./pages/mandats/index'));
const MandatDetailPage = lazy(() => import('./pages/mandats/[id]'));
const MandatNewPage = lazy(() => import('./pages/mandats/new'));
const MandatKanbanPage = lazy(() => import('./pages/mandats/[id]-kanban'));
const FastReviewPage = lazy(() => import('./pages/mandats/[id]-review'));
const ActivitesPage = lazy(() => import('./pages/activites/index'));
const TachesPage = lazy(() => import('./pages/taches/index'));
const IntegrationsSettingsPage = lazy(() => import('./pages/settings/integrations'));
const ImportPage = lazy(() => import('./pages/import/index'));
const ReportsPage = lazy(() => import('./pages/reports/index'));
const StatsPage = lazy(() => import('./pages/stats/index'));
const LeaderboardPage = lazy(() => import('./pages/stats/leaderboard'));
const PlacementsPage = lazy(() => import('./pages/stats/placements'));
const RevenueForecastPage = lazy(() => import('./pages/stats/revenue-forecast'));
const PipelineIntelligencePage = lazy(() => import('./pages/dashboard/pipeline-intelligence'));
const AlertsPage = lazy(() => import('./pages/dashboard/alerts'));
const EmailsPage = lazy(() => import('./pages/emails/index'));
const McpLogsPage = lazy(() => import('./pages/mcp-logs/index'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/analytics'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/docs/mcp" element={<DocsMcpPage />} />
        {/* Portail client — public, hors MainLayout */}
        <Route path="/portail/login" element={<PortalLoginPage />} />
        <Route path="/portail/mandat/:mandatId" element={<PortalMandatPage />} />
        <Route
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <MainLayout />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="mon-espace" element={<MonEspacePage />} />
          <Route path="mes-mandats" element={<MesMandatsPage />} />
          <Route path="candidats" element={<CandidatsPage />} />
          <Route path="candidats/new" element={<CandidatNewPage />} />
          <Route path="candidats/duplicates" element={<CandidatDuplicatesPage />} />
          <Route path="candidats/:id" element={<CandidatDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/new" element={<ClientNewPage />} />
          <Route path="clients/pipeline" element={<ClientPipelinePage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="entreprises" element={<EntreprisesPage />} />
          <Route path="entreprises/new" element={<EntrepriseNewPage />} />
          <Route path="entreprises/:id" element={<EntrepriseDetailPage />} />
          <Route path="mandats" element={<MandatsPage />} />
          <Route path="mandats/new" element={<MandatNewPage />} />
          <Route path="mandats/:id/kanban" element={<MandatKanbanPage />} />
          <Route path="mandats/:id/review" element={<FastReviewPage />} />
          <Route path="mandats/:id" element={<MandatDetailPage />} />
          <Route path="activites" element={<ActivitesPage />} />
          <Route path="taches" element={<TachesPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="pipeline-intelligence" element={<PipelineIntelligencePage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="placements" element={<PlacementsPage />} />
          <Route path="revenue-forecast" element={<RevenueForecastPage />} />
          <Route path="emails" element={<EmailsPage />} />
          <Route path="mcp-logs" element={<McpLogsPage />} />
          <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
