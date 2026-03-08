import { useState, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, LogOut, Link2, Check } from 'lucide-react';
import Sidebar from '../ui/Sidebar';
import SearchBar from '../ui/SearchBar';
import Avatar from '../ui/Avatar';
import Dropdown from '../ui/Dropdown';
import { toast, ToastContainer } from '../ui/Toast';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../lib/api-client';

export default function MainLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bookingCopied, setBookingCopied] = useState(false);

  // Fetch booking settings to get the slug
  const { data: bookingSettings } = useQuery({
    queryKey: ['booking', 'settings'],
    queryFn: () => api.get<{ slug: string; isActive: boolean }>('/booking/settings'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const bookingSlug = bookingSettings?.slug;
  const bookingActive = bookingSettings?.isActive;

  const handleCopyBookingLink = useCallback(() => {
    if (!bookingSlug) return;
    const link = `https://ats.propium.co/book/${bookingSlug}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('success', 'Lien de booking copie !');
      setBookingCopied(true);
      setTimeout(() => setBookingCopied(false), 2000);
    });
  }, [bookingSlug]);

  const handleSearch = async (query: string) => {
    try {
      const res = await api.get<{ data: any[] }>(`/search?q=${encodeURIComponent(query)}`);
      return res.data.map((item: any) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
      }));
    } catch {
      return [];
    }
  };

  const handleSearchSelect = (result: { id: string; type: string }) => {
    const routes: Record<string, string> = {
      candidat: '/candidats',
      client: '/clients',
      entreprise: '/entreprises',
      mandat: '/mandats',
    };
    navigate(`${routes[result.type] || '/'}/${result.id}`);
  };

  return (
    <div className="flex h-screen app-bg">
      <Sidebar isAdmin={user?.role === 'ADMIN'} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.05)] bg-white/70 backdrop-blur-xl backdrop-saturate-[1.8] px-6">
          <div className="max-w-[400px] flex-1">
            <SearchBar
              onSearch={handleSearch}
              onSelect={handleSearchSelect}
              placeholder="Rechercher candidats, clients, mandats... (Ctrl+K)"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Booking link quick copy */}
            {bookingActive && bookingSlug && (
              <button
                onClick={handleCopyBookingLink}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-violet-50 hover:text-violet-600 transition-all duration-200"
                title="Copier mon lien de booking"
              >
                {bookingCopied ? (
                  <Check size={18} className="text-green-500" />
                ) : (
                  <Link2 size={18} />
                )}
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

        <main className="flex-1 overflow-auto p-8">
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

      <ToastContainer />
    </div>
  );
}
