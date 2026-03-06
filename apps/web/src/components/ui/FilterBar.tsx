import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, X, RotateCcw, Check } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────
export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: 'multi-select' | 'single-select' | 'toggle' | 'text';
  options?: FilterOption[];
  placeholder?: string;
}

export interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  resultCount?: number;
  totalCount?: number;
}

// ── Helpers ──────────────────────────────────────────────────────
function countActiveFilters(filters: FilterConfig[], values: Record<string, any>): number {
  let count = 0;
  for (const f of filters) {
    const v = values[f.key];
    if (f.type === 'multi-select' && Array.isArray(v) && v.length > 0) count++;
    else if (f.type === 'single-select' && v) count++;
    else if (f.type === 'toggle' && v === true) count++;
    else if (f.type === 'text' && typeof v === 'string' && v.trim().length > 0) count++;
  }
  return count;
}

function isFilterActive(config: FilterConfig, values: Record<string, any>): boolean {
  const v = values[config.key];
  if (config.type === 'multi-select') return Array.isArray(v) && v.length > 0;
  if (config.type === 'single-select') return !!v;
  if (config.type === 'toggle') return v === true;
  if (config.type === 'text') return typeof v === 'string' && v.trim().length > 0;
  return false;
}

// ── Dropdown wrapper ─────────────────────────────────────────────
function FilterDropdown({
  config,
  values,
  onChange,
}: {
  config: FilterConfig;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = isFilterActive(config, values);
  const currentValue = values[config.key];

  // Build display label
  let displayLabel = config.label;
  if (config.type === 'multi-select' && Array.isArray(currentValue) && currentValue.length > 0) {
    displayLabel = `${config.label} (${currentValue.length})`;
  } else if (config.type === 'single-select' && currentValue) {
    const opt = config.options?.find((o) => o.value === currentValue);
    if (opt) displayLabel = opt.label;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all whitespace-nowrap ${
          active
            ? 'border-[#C4B5FD] bg-[#F5F3FF] text-[#6D28D9]'
            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
        }`}
      >
        {displayLabel}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 z-50 mt-1 min-w-[200px] max-h-[280px] overflow-y-auto rounded-xl border border-neutral-100 bg-white p-1 shadow-[0_12px_36px_rgba(26,26,46,0.12)]"
          >
            {config.type === 'multi-select' && (
              <MultiSelectMenu
                options={config.options || []}
                selected={Array.isArray(currentValue) ? currentValue : []}
                onToggle={(val) => {
                  const arr: string[] = Array.isArray(currentValue) ? [...currentValue] : [];
                  const idx = arr.indexOf(val);
                  if (idx >= 0) arr.splice(idx, 1);
                  else arr.push(val);
                  onChange(config.key, arr);
                }}
              />
            )}
            {config.type === 'single-select' && (
              <SingleSelectMenu
                options={config.options || []}
                selected={currentValue || ''}
                onSelect={(val) => {
                  onChange(config.key, val === currentValue ? '' : val);
                  setOpen(false);
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Multi-select menu ────────────────────────────────────────────
function MultiSelectMenu({
  options,
  selected,
  onToggle,
}: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="py-0.5">
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <span
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                checked
                  ? 'border-[#7C5CFC] bg-[#7C5CFC] text-white'
                  : 'border-neutral-300 bg-white'
              }`}
            >
              {checked && <Check size={10} strokeWidth={3} />}
            </span>
            <span className="flex-1 text-left truncate">{opt.label}</span>
            {opt.count !== undefined && (
              <span className="text-[10px] text-neutral-400">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Single-select menu ───────────────────────────────────────────
function SingleSelectMenu({
  options,
  selected,
  onSelect,
}: {
  options: FilterOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="py-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-neutral-50 ${
            opt.value === selected ? 'font-semibold text-[#6D28D9] bg-[#F5F3FF]' : 'text-neutral-700'
          }`}
        >
          <span className="flex-1 text-left truncate">{opt.label}</span>
          {opt.count !== undefined && (
            <span className="text-[10px] text-neutral-400">{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Toggle filter ────────────────────────────────────────────────
function ToggleFilter({
  config,
  value,
  onChange,
}: {
  config: FilterConfig;
  value: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(config.key, !value)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all whitespace-nowrap ${
        value
          ? 'border-[#C4B5FD] bg-[#F5F3FF] text-[#6D28D9]'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full transition-colors ${
          value ? 'bg-[#7C5CFC]' : 'bg-neutral-300'
        }`}
      />
      {config.label}
    </button>
  );
}

// ── Text filter ──────────────────────────────────────────────────
function TextFilter({
  config,
  value,
  onChange,
}: {
  config: FilterConfig;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="relative">
      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={value || ''}
        onChange={(e) => onChange(config.key, e.target.value)}
        placeholder={config.placeholder || config.label}
        className={`h-8 w-[160px] rounded-md border pl-7 pr-2 text-xs font-medium outline-none transition-all ${
          value
            ? 'border-[#C4B5FD] bg-[#F5F3FF] text-[#6D28D9] placeholder:text-[#A78BFA]'
            : 'border-neutral-200 bg-white text-neutral-600 placeholder:text-neutral-400 hover:border-neutral-300 focus:border-[#7C5CFC] focus:ring-1 focus:ring-[#7C5CFC]/20'
        }`}
      />
      {value && (
        <button
          onClick={() => onChange(config.key, '')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ── Main FilterBar ───────────────────────────────────────────────
export default function FilterBar({
  filters,
  values,
  onChange,
  onReset,
  resultCount,
  totalCount,
}: FilterBarProps) {
  const activeCount = countActiveFilters(filters, values);

  return (
    <>
      <style>{`.filter-bar-scroll::-webkit-scrollbar { display: none; }`}</style>
      <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto filter-bar-scroll" style={{ scrollbarWidth: 'none' }}>
        {filters.map((config) => {
          if (config.type === 'toggle') {
            return (
              <div key={config.key} className="shrink-0">
                <ToggleFilter
                  config={config}
                  value={!!values[config.key]}
                  onChange={onChange}
                />
              </div>
            );
          }
          if (config.type === 'text') {
            return (
              <div key={config.key} className="shrink-0">
                <TextFilter
                  config={config}
                  value={values[config.key] || ''}
                  onChange={onChange}
                />
              </div>
            );
          }
          return (
            <div key={config.key} className="shrink-0">
              <FilterDropdown
                config={config}
                values={values}
                onChange={onChange}
              />
            </div>
          );
        })}

        {/* Active filters count badge */}
        {activeCount > 0 && (
          <span className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md bg-[#F5F3FF] px-2.5 text-xs font-semibold text-[#6D28D9] border border-[#C4B5FD]">
            {activeCount} filtre{activeCount > 1 ? 's' : ''}
          </span>
        )}

        {/* Reset button */}
        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <RotateCcw size={12} />
            Reinitialiser
          </button>
        )}

        {/* Result counter */}
        {resultCount !== undefined && totalCount !== undefined && (
          <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-neutral-500">
            {resultCount} {resultCount <= 1 ? 'resultat' : 'resultats'} sur {totalCount}
          </span>
        )}
      </div>
    </>
  );
}
