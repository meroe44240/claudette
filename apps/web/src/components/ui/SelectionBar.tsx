import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────
export interface SelectionAction {
  key: string;
  label: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface SelectionBarProps {
  count: number;
  entityLabel: string; // "clients" | "candidats" | "entreprises"
  actions: SelectionAction[];
  onAction: (key: string) => void;
  onCancel: () => void;
}

// ── Variant styles ───────────────────────────────────────────────
const actionVariant: Record<string, string> = {
  primary:
    'bg-[#7C5CFC] text-white hover:bg-[#6B4FE0] shadow-sm',
  secondary:
    'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50',
  ghost:
    'text-neutral-600 hover:bg-neutral-100',
};

// ── Component ────────────────────────────────────────────────────
export default function SelectionBar({
  count,
  entityLabel,
  actions,
  onAction,
  onCancel,
}: SelectionBarProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between rounded-t-xl border-t border-neutral-100 bg-white px-6 py-3 shadow-[0_-4px_24px_rgba(26,26,46,0.1)]"
        >
          {/* Left: count */}
          <div className="flex items-center gap-3">
            <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-[#7C5CFC] px-2 text-xs font-bold text-white">
              {count}
            </span>
            <span className="text-sm font-medium text-neutral-700">
              {entityLabel} selectionne{count > 1 ? 's' : ''}
            </span>
          </div>

          {/* Right: actions + cancel */}
          <div className="flex items-center gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => onAction(action.key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${
                    actionVariant[action.variant || 'secondary']
                  }`}
                >
                  <Icon size={14} />
                  {action.label}
                </button>
              );
            })}
            <button
              onClick={onCancel}
              className="ml-2 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X size={14} />
              Annuler
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
