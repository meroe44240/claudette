import { useEffect } from 'react';
import { NavLink } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Building2, Briefcase, FileText, Upload, Settings, User, Mail, ChevronDown, ChevronsLeft, BarChart3, Terminal, Target, Radar } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'DASHBOARD',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Vue d’ensemble' },
      { to: '/mon-espace', icon: User, label: 'Mon Espace' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { to: '/candidats', icon: Users, label: 'Candidats' },
      { to: '/clients', icon: Briefcase, label: 'Clients' },
      { to: '/entreprises', icon: Building2, label: 'Entreprises' },
    ],
  },
  {
    label: 'RECRUTEMENT',
    items: [
      { to: '/mes-mandats', icon: Target, label: 'Mes Mandats' },
      { to: '/mandats', icon: FileText, label: 'Tous les mandats' },
      { to: '/list-push', icon: Radar, label: 'List Push' },
    ],
  },
  {
    label: 'SUIVI',
    items: [
      { to: '/emails', icon: Mail, label: 'Emails' },
      { to: '/import', icon: Upload, label: 'Import' },
    ],
  },
];

const adminItems: NavItem[] = [
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
  { to: '/mcp-logs', icon: Terminal, label: 'Logs MCP' },
];

const SHORTCUT_HINTS: Record<string, string> = {
  '/': 'd',
  '/candidats': 'c',
  '/mandats': 'm',
  '/entreprises': 'e',
  '/clients': 'k',
};

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <AnimatePresence>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="mx-5 mt-6 mb-2"
        >
          <span
            className="text-[10.5px] font-bold uppercase whitespace-nowrap"
            style={{ letterSpacing: '0.16em', color: 'rgba(230,233,175,0.42)' }}
          >
            {label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NavItemLink({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: number; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative mx-3 my-0.5 flex items-center gap-3 rounded-[12px] px-[14px] py-[11px] text-[14.5px] transition-all duration-200 ${
          isActive
            ? 'font-bold text-white'
            : 'font-medium text-[rgba(230,233,175,0.72)] hover:text-white hover:bg-[rgba(230,233,175,0.09)]'
        }`
      }
      style={({ isActive }) => (isActive ? { background: 'rgba(230,233,175,0.15)' } : undefined)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="sidebar-active-bar"
              className="absolute left-0 top-1/2 -translate-y-1/2"
              style={{
                width: '3px',
                height: '20px',
                borderRadius: '0 3px 3px 0',
                background: '#E6E9AF',
              }}
              transition={{ type: 'spring' as const, stiffness: 320, damping: 32 }}
            />
          )}
          <div className="relative shrink-0">
            <item.icon
              size={19}
              strokeWidth={1.9}
              className={isActive ? 'text-white' : ''}
              style={isActive ? undefined : { color: 'rgba(230,233,175,0.85)' }}
            />
            {badge != null && badge > 0 && collapsed && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-1 items-center justify-between whitespace-nowrap"
              >
                {item.label}
                <span className="ml-auto flex items-center gap-1.5">
                  {badge != null && badge > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500/90 px-1.5 text-[10px] font-bold text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {SHORTCUT_HINTS[item.to] && (
                    <kbd
                      className="hidden text-[10px] font-mono opacity-0 transition-opacity group-hover/sidebar:opacity-60 lg:inline"
                      style={{ color: 'rgba(230,233,175,0.6)' }}
                    >
                      {SHORTCUT_HINTS[item.to]}
                    </kbd>
                  )}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ isAdmin = false, collapsed = false, onToggleCollapse, isOpen = false, onClose }: SidebarProps) {
  const { user } = useAuthStore();
  const initials = `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        onToggleCollapse?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onToggleCollapse]);

  const sidebarContent = (mobile: boolean) => (
    <>
      {/* Overlay grille lime 3.5% */}
      <div aria-hidden className="absolute inset-0 pointer-events-none sidebar-grid-texture" />
      {/* Glow lime bas-gauche */}
      <div
        aria-hidden
        className="absolute pointer-events-none sidebar-glow"
        style={{ bottom: '-120px', left: '-60px', width: '280px', height: '280px', borderRadius: '50%' }}
      />

      {/* Logo */}
      <div className="relative flex h-16 items-center gap-3 px-5">
        <img
          src="/brand/logo-mark-cream.png"
          alt="HumanUp"
          className="h-9 w-auto shrink-0"
        />
        <AnimatePresence>
          {(mobile || !collapsed) && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="whitespace-nowrap text-lg text-white"
              style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }}
            >
              HUMANUP
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 overflow-y-auto thin-scroll pb-4">
        {navSections.map((section, sectionIdx) => (
          <div key={section.label ?? `top-${sectionIdx}`}>
            {section.label && (
              <SectionLabel label={section.label} collapsed={mobile ? false : collapsed} />
            )}
            {section.items.map((item) => (
              <NavItemLink
                key={item.to}
                item={item}
                collapsed={mobile ? false : collapsed}
                onNavigate={mobile ? onClose : undefined}
              />
            ))}
          </div>
        ))}

        {isAdmin && (
          <>
            <SectionLabel label="ADMIN" collapsed={mobile ? false : collapsed} />
            {adminItems.map((item) => (
              <NavItemLink key={item.to} item={item} collapsed={mobile ? false : collapsed} onNavigate={mobile ? onClose : undefined} />
            ))}
          </>
        )}
      </nav>

      {!mobile && (
        <button
          onClick={onToggleCollapse}
          className="relative mx-3 mb-2 flex items-center justify-center rounded-lg py-2 transition-all duration-200 hover:bg-[rgba(230,233,175,0.09)]"
          style={{ color: 'rgba(230,233,175,0.6)' }}
          title={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ type: 'spring' as const, stiffness: 200, damping: 20 }}
          >
            <ChevronsLeft size={18} />
          </motion.div>
        </button>
      )}

      {/* Footer user */}
      <div
        className="relative flex items-center gap-3 px-5 py-4"
        style={{ borderTop: '1px solid rgba(230,233,175,0.15)' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'rgba(230,233,175,0.15)',
            border: '2px solid rgba(230,233,175,0.4)',
          }}
        >
          <span className="text-[12px] font-bold text-white">{initials}</span>
        </div>
        <AnimatePresence>
          {(mobile || !collapsed) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 items-center gap-1 overflow-hidden"
            >
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold text-white truncate leading-tight">
                  {user?.prenom || ''} {user?.nom || ''}
                </div>
                <div className="text-[11px] truncate leading-tight" style={{ color: 'rgba(230,233,175,0.6)' }}>
                  {user?.role === 'ADMIN' ? 'Administrateur' : 'Recruteur'}
                </div>
              </div>
              <ChevronDown size={16} className="shrink-0" style={{ color: 'rgba(230,233,175,0.6)' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 238 }}
        transition={{ type: 'spring' as const, stiffness: 200, damping: 30 }}
        className="group/sidebar sticky top-0 hidden h-screen flex-col overflow-hidden md:flex relative"
        style={{ background: '#22177A', color: '#E6E9AF' }}
      >
        {sidebarContent(false)}
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] md:hidden"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col shadow-2xl md:hidden relative"
              style={{ background: '#22177A', color: '#E6E9AF' }}
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
