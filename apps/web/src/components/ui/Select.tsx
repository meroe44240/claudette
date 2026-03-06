import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  searchable?: boolean;
}

export default function Select({ options, value, onChange, placeholder = 'Sélectionner...', label, error, searchable = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div ref={ref} className="relative space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-10 w-full items-center justify-between rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-sm outline-none transition-all ${error ? 'border-error' : 'border-neutral-100'} ${open ? 'border-primary-500 shadow-[0_0_0_3px_rgba(124,92,252,0.1)]' : ''}`}
      >
        <span className={selected ? 'text-neutral-900' : 'text-neutral-300'}>{selected?.label || placeholder}</span>
        <ChevronDown size={16} className="text-neutral-300" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-40 mt-1 w-full rounded-xl border border-neutral-100 bg-white p-1.5 shadow-[0_12px_36px_rgba(26,26,46,0.12)]"
          >
            {searchable && (
              <div className="border-b border-neutral-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-neutral-300" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-300"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((option) => (
                <button
                  key={option.value}
                  onClick={() => { onChange(option.value); setOpen(false); setSearch(''); }}
                  className={`flex w-full items-center px-3.5 py-2.5 text-sm rounded-lg transition-colors ${option.value === value ? 'bg-primary-50 font-medium text-primary-500' : 'text-neutral-900 hover:bg-neutral-50'}`}
                >
                  {option.label}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3.5 py-2.5 text-sm text-neutral-300">Aucun résultat</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
