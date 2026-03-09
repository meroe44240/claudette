import { Routes, Route, Navigate } from 'react-router';
import { useAuthStore } from './stores/auth-store';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/login';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import ChangePasswordPage from './pages/change-password';
import DashboardPage from './pages/dashboard/index';
import MonEspacePage from './pages/mon-espace/index';
import NotificationsPage from './pages/notifications/index';
import SettingsPage from './pages/settings/index';
import CandidatsPage from './pages/candidats/index';
import CandidatDetailPage from './pages/candidats/[id]';
import EntreprisesPage from './pages/entreprises/index';
import EntrepriseDetailPage from './pages/entreprises/[id]';
import ClientsPage from './pages/clients/index';
import ClientDetailPage from './pages/clients/[id]';
import MandatsPage from './pages/mandats/index';
import MandatDetailPage from './pages/mandats/[id]';
import MandatKanbanPage from './pages/mandats/[id]-kanban';
import ClientPipelinePage from './pages/clients/pipeline';
import ActivitesPage from './pages/activites/index';
import TachesPage from './pages/taches/index';
import TemplatesPage from './pages/templates/index';
import TemplateDetailPage from './pages/templates/[id]';
import IntegrationsSettingsPage from './pages/settings/integrations';
import ImportPage from './pages/import/index';
import SequencesPage from './pages/sequences/index';
import SdrPage from './pages/sdr/index';
import AdchasePage from './pages/adchase/index';
import CandidatNewPage from './pages/candidats/new';
import ClientNewPage from './pages/clients/new';
import EntrepriseNewPage from './pages/entreprises/new';
import MandatNewPage from './pages/mandats/new';
import ReportsPage from './pages/reports/index';
import StatsPage from './pages/stats/index';
import PublicBookingPage from './pages/public-booking/index';
import BookingCancelPage from './pages/public-booking/cancel';
import PublicJobListPage from './pages/jobs/public-list';
import PublicJobDetailPage from './pages/jobs/public-detail';
import SpontaneousPage from './pages/jobs/spontaneous';
import JobConfirmationPage from './pages/jobs/confirmation';
import JobBoardPage from './pages/jobs/index';
import JobBoardNewPage from './pages/jobs/new';
import JobBoardEditPage from './pages/jobs/edit';
import EmailsPage from './pages/emails/index';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/book/cancel/:bookingId" element={<BookingCancelPage />} />
      <Route path="/book/:slug/:mandatSlug" element={<PublicBookingPage />} />
      <Route path="/book/:slug" element={<PublicBookingPage />} />
      <Route path="/jobs" element={<PublicJobListPage />} />
      <Route path="/jobs/candidature-spontanee" element={<SpontaneousPage />} />
      <Route path="/jobs/confirmation" element={<JobConfirmationPage />} />
      <Route path="/jobs/:slug" element={<PublicJobDetailPage />} />
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="mon-espace" element={<MonEspacePage />} />
        <Route path="candidats" element={<CandidatsPage />} />
        <Route path="candidats/new" element={<CandidatNewPage />} />
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
        <Route path="mandats/:id" element={<MandatDetailPage />} />
        <Route path="activites" element={<ActivitesPage />} />
        <Route path="taches" element={<TachesPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:id" element={<TemplateDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="sequences" element={<SequencesPage />} />
        <Route path="sdr" element={<SdrPage />} />
        <Route path="adchase" element={<AdchasePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="emails" element={<EmailsPage />} />
        <Route path="job-board" element={<JobBoardPage />} />
        <Route path="job-board/new" element={<JobBoardNewPage />} />
        <Route path="job-board/:id" element={<JobBoardEditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
