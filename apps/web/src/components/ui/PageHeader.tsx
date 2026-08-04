import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-[13px]">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-neutral-300" />}
              {crumb.href ? (
                <a href={crumb.href} className="text-neutral-500 hover:text-primary-500 transition-colors">{crumb.label}</a>
              ) : (
                <span className="text-neutral-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 32, letterSpacing: '-0.03em', color: '#1A1533', lineHeight: 1.05 }}>{title}</h1>
          {subtitle && <p className="mt-1" style={{ fontSize: 14, color: '#6E6A85' }}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </motion.div>
  );
}
