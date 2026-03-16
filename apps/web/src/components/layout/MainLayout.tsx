import { useState, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, LogOut, CalendarPlus, Check, Copy, Mail, X, Users, Building2, Menu } from 'lucide-react';
import Sidebar from '../ui/Sidebar';
import SearchBar from '../ui/SearchBar';
import EntityPreview from '../ui/EntityPreview';
import Avatar from '../ui/Avatar';
import Dropdown from '../ui/Dropdown';
import OfflineBanner from '../ui/OfflineBanner';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import { toast, ToastContainer } from '../ui/Toast';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../lib/api-client';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

interface BookingType {
  id: string;
  slug: string;
  label: string;
  durationMinutes: number;
  targetType: string;
  sortOrder: number;
}

interface MandatLink {
  mandatId: string;
  titrePoste: string;
  entreprise: string;
  slug: string;
}

export default function MainLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookingPanelOpen, setBookingPanelOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !(user as any)?.onboardingCompleted);
  const { showHelp, setShowHelp, shortcuts } = useKeyboardShortcuts();

  // Entity preview state (SlideOver)
  const [previewEntity, setPreviewEntity] = useState<{ type: string; id: string } | null>(null);

  // Fetch booking types
  const { data: bookingData } = useQuery({
    queryKey: ['booking', 'types'],
    queryFn: () => api.get<{ slug: string; types: BookingType[] }>('/booking/types'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch mandat links
  const { data: mandatData } = useQuery({
    queryKey: ['booking', 'mandat-links'],
    queryFn: () => api.get<{ recruiterSlug: string; links: MandatLink[] }>('/booking/mandat-links'),
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !!bookingData?.slug,
  });

  const bookingSlug = bookingData?.slug;
  const bookingTypes = bookingData?.types || [];
  const candidateTypes = bookingTypes.filter((t) => t.targetType === 'candidate');
  const clientTypes = bookingTypes.filter((t) => t.targetType === 'client');
  const mandatLinks = mandatData?.links || [];

  const BASE_URL = 'https://ats.propium.co/book';

  const handleCopy = useCallback((link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast('success', 'Lien copié !');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

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
    // Open entity preview SlideOver instead of navigating
    setPreviewEntity({ type: result.type, id: result.id });
  };

  const handleSearchCreate = useCallback((type: string, prefill: string) => {
    const routes: Record<string, string> = {
      candidat: '/candidats/new',
      entreprise: '/entreprises/new',
      client: '/clients/new',
    };
    const url = routes[type];
    if (url) navigate(`${url}?prefill=${encodeURIComponent(prefill)}`);
  }, [navigate]);

  return (
    <div className="flex h-screen app-bg">
      <Sidebar isAdmin={user?.role === 'ADMIN'} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.05)] bg-white/70 backdrop-blur-xl backdrop-saturate-[1.8] px-4 md:px-6">
          {/* Mobile hamburger menu */}
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
            {/* Booking panel toggle */}
            {bookingSlug && (
              <button
                onClick={() => setBookingPanelOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-violet-50 hover:text-violet-600 transition-all duration-200"
                title="Mes liens de booking"
              >
                <CalendarPlus size={18} />
              </button>
            )}

            <button
              onClick={() => navigate('/notifications')}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-50 transition-all duration-200"
            >
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-error animate-glow-pulse" />
            </button>

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

      {/* Booking Links Panel */}
      <AnimatePresence>
        {bookingPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
              onClick={() => setBookingPanelOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-[380px] bg-white shadow-2xl border-l border-neutral-100 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                <div className="flex items-center gap-2.5">
                  <CalendarPlus size={20} className="text-violet-600" />
                  <h2 className="text-base font-semibold text-neutral-900">Mes liens de booking</h2>
                </div>
                <button onClick={() => setBookingPanelOpen(false)} className="rounded-lg p-1.5 hover:bg-neutral-50 text-neutral-400 hover:text-neutral-600 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Candidate booking types */}
                {candidateTypes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Users size={15} className="text-violet-500" />
                      <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Candidats</span>
                    </div>
                    <div className="space-y-2.5">
                      {candidateTypes.map((bt) => {
                        const link = `${BASE_URL}/${bookingSlug}/${bt.slug}`;
                        return (
                          <div key={bt.id} className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-violet-800">{bt.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-violet-500 truncate flex-1 font-mono">.../book/{bookingSlug}/{bt.slug}</span>
                              <button
                                onClick={() => handleCopy(link, bt.id)}
                                className="shrink-0 rounded-md p-1 hover:bg-violet-100 transition-colors"
                                title="Copier le lien"
                              >
                                {copiedId === bt.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-violet-400" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Client booking types */}
                {clientTypes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 size={15} className="text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Sociétés</span>
                    </div>
                    <div className="space-y-2.5">
                      {clientTypes.map((bt) => {
                        const link = `${BASE_URL}/${bookingSlug}/${bt.slug}`;
                        return (
                          <div key={bt.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-amber-800">{bt.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-amber-500 truncate flex-1 font-mono">.../book/{bookingSlug}/{bt.slug}</span>
                              <button
                                onClick={() => handleCopy(link, bt.id)}
                                className="shrink-0 rounded-md p-1 hover:bg-amber-100 transition-colors"
                                title="Copier le lien"
                              >
                                {copiedId === bt.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-amber-400" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mandat-specific links */}
                {mandatLinks.length > 0 && (
                  <div>
                    <div className="border-t border-neutral-100 pt-4 mb-3">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Liens par mandat</span>
                    </div>
                    <div className="space-y-2">
                      {mandatLinks.map((m: any) => {
                        const link = `${BASE_URL}/${bookingSlug}/${m.slug}`;
                        return (
                          <div key={m.mandatId} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px] font-medium text-neutral-700 truncate block">{m.titrePoste}</span>
                              <span className="text-[11px] text-neutral-400">{m.entreprise}</span>
                            </div>
                            <button
                              onClick={() => handleCopy(link, m.mandatId)}
                              className="shrink-0 rounded-md p-1 hover:bg-neutral-100 transition-colors ml-2"
                              title="Copier le lien"
                            >
                              {copiedId === m.mandatId ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-neutral-400" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-neutral-100 px-6 py-4">
                <button
                  onClick={() => { setBookingPanelOpen(false); navigate('/settings'); }}
                  className="w-full text-center text-sm text-neutral-500 hover:text-violet-600 transition-colors font-medium"
                >
                  Gérer les paramètres
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      {/* Entity Preview SlideOver (from search results) */}
      <EntityPreview
        isOpen={!!previewEntity}
        onClose={() => setPreviewEntity(null)}
        entityType={previewEntity?.type || null}
        entityId={previewEntity?.id || null}
      />

      {/* Onboarding Wizard for first-time users */}
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}

      <ToastContainer />
    </div>
  );
}
