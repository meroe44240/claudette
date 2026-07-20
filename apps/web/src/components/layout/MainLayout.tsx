import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu } from 'lucide-react';
import Sidebar from '../ui/Sidebar';
import SearchBar from '../ui/SearchBar';
import EntityPreview from '../ui/EntityPreview';
import Avatar from '../ui/Avatar';
import Dropdown from '../ui/Dropdown';
import OfflineBanner from '../ui/OfflineBanner';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import { ToastContainer } from '../ui/Toast';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../lib/api-client';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export default function MainLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !(user as any)?.onboardingCompleted);
  const { showHelp, setShowHelp, shortcuts } = useKeyboardShortcuts();

  // Entity preview state (SlideOver)
  const [previewEntity, setPreviewEntity] = useState<{ type: string; id: string } | null>(null);

  const handleSearch = async (query: string) => {
    try {
      const res = await api.get<{ data: any[] }>(`/search?q=${encodeURIComponent(query)}`);
      return res.data.map((item: any) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        extra: item.extra,
      }));
    } catch {
      return [];
    }
  };

  const handleSearchSelect = (result: { id: string; type: string }) => {
    setPreviewEntity({ type: result.type, id: result.id });
  };

  const handleSearchCreate = (type: string, prefill: string) => {
    const routes: Record<string, string> = {
      candidat: '/candidats/new',
      entreprise: '/entreprises/new',
      client: '/clients/new',
    };
    const url = routes[type];
    if (url) navigate(`${url}?prefill=${encodeURIComponent(prefill)}`);
  };

  return (
    <div className="flex h-screen app-bg">
      <Sidebar isAdmin={user?.role === 'ADMIN'} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.05)] bg-white/70 backdrop-blur-xl backdrop-saturate-[1.8] px-4 md:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors md:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} />
          </button>

          <div className="max-w-[400px] flex-1">
            <SearchBar
              onSearch={handleSearch}
              onSelect={handleSearchSelect}
              onCreate={handleSearchCreate}
              placeholder="Rechercher candidats, clients, mandats... (Ctrl+K)"
            />
          </div>

          <div className="flex items-center gap-3">
            <Dropdown
              trigger={
                <button className="flex items-center gap-2 rounded-xl p-1 hover:bg-neutral-50 transition-all duration-200">
                  <Avatar nom={user?.nom || ''} prenom={user?.prenom} size="sm" />
                  <span className="text-sm font-medium text-text-primary">{user?.prenom || user?.nom}</span>
                </button>
              }
              items={[
                { label: 'Mon Espace', onClick: () => navigate('/mon-espace') },
                { label: 'Paramètres', onClick: () => navigate('/settings') },
                { label: 'Déconnexion', onClick: logout, icon: <LogOut size={14} />, danger: true },
              ]}
            />
          </div>
        </header>

        <OfflineBanner />
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-[1280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Keyboard Shortcuts Help */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-neutral-900">Raccourcis clavier</h3>
            <div className="space-y-2">
              {shortcuts.map(s => (
                <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-neutral-50">
                  <span className="text-sm text-neutral-600">{s.description}</span>
                  <kbd className="rounded bg-neutral-100 px-2 py-1 text-xs font-mono text-neutral-700">
                    {s.ctrl ? 'Ctrl + ' : ''}{s.key}
                  </kbd>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-neutral-400 text-center">Appuyez sur / pour afficher/masquer</p>
          </div>
        </div>
      )}

      <EntityPreview
        isOpen={!!previewEntity}
        onClose={() => setPreviewEntity(null)}
        entityType={previewEntity?.type || null}
        entityId={previewEntity?.id || null}
      />

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}

      <ToastContainer />
    </div>
  );
}
