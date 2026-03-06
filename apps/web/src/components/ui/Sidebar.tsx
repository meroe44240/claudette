import { useEffect } from 'react';
import { NavLink } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Building2, Briefcase, FileText, ClipboardList, Bell, Upload, Settings, User, ListChecks, BookOpen, Zap, Crosshair, Send, ChevronDown, ChevronsLeft, BarChart3 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

// ── Sidebar nav structure with grouped sections ─────────────────
interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
}

interface NavSection {
  label?: string; // undefined = no section header (top items)
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    // Top items — no section label
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
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
    label: 'Recrutement',
    items: [
      { to: '/mandats', icon: FileText, label: 'Mandats' },
      { to: '/sequences', icon: Zap, label: 'Séquences' },
    ],
  },
  {
    label: 'Outils',
    items: [
      { to: '/sdr', icon: Crosshair, label: 'SDR Manager' },
      { to: '/adchase', icon: Send, label: 'Adchase' },
    ],
  },
  {
    label: 'Suivi',
    items: [
      { to: '/activites', icon: ClipboardList, label: 'Activités' },
      { to: '/taches', icon: ListChecks, label: 'Tâches' },
      { to: '/stats', icon: BarChart3, label: 'Stats' },
      { to: '/templates', icon: BookOpen, label: 'Templates' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ],
  },
];

const adminItems: NavItem[] = [
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SectionDivider({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <>
      <div className="mx-6 my-3 border-t border-white/10" />
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mx-6 mb-2"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {collapsed && <div className="mb-2" />}
    </>
  );
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `relative mx-3 my-0.5 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all duration-200 ${
          isActive
            ? 'bg-white/10 font-semibold text-white'
            : 'font-medium text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary-300"
              transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
            />
          )}
          <item.icon size={20} strokeWidth={1.75} className={`shrink-0 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="whitespace-nowrap"
              >
                {item.label}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ isAdmin = false, collapsed = false, onToggleCollapse }: SidebarProps) {
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

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ type: 'spring' as const, stiffness: 200, damping: 30 }}
      className="sticky top-0 flex h-screen flex-col bg-[#1A1625] overflow-hidden"
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-500">
          <span className="text-lg font-bold text-white">H</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-lg font-bold text-white whitespace-nowrap"
            >
              HumanUp
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section, sectionIdx) => (
          <div key={section.label ?? `top-${sectionIdx}`}>
            {section.label && (
              <SectionDivider label={section.label} collapsed={collapsed} />
            )}
            {section.items.map((item) => (
              <NavItemLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}

        {isAdmin && (
          <>
            {/* Admin separator */}
            <div className="mx-6 my-3 border-t border-white/10" />
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="mx-6 mb-2"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    Admin
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && <div className="mb-2" />}
            {adminItems.map((item) => (
              <NavItemLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="mx-3 mb-2 flex items-center justify-center rounded-lg py-2 text-neutral-400 hover:bg-white/5 hover:text-neutral-200 transition-all duration-200"
        title={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
      >
        <motion.div
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ type: 'spring' as const, stiffness: 200, damping: 20 }}
        >
          <ChevronsLeft size={18} />
        </motion.div>
      </button>

      {/* User footer */}
      <div className="flex items-center gap-3 border-t border-white/10 px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500">
          <span className="text-[13px] font-bold text-white">{initials}</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 items-center gap-1 overflow-hidden"
            >
              <span className="flex-1 truncate text-sm font-semibold text-white whitespace-nowrap">
                {user?.prenom || user?.nom || ''}
              </span>
              <ChevronDown size={16} className="shrink-0 text-neutral-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
