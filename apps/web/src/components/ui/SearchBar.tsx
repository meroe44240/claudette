import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

interface SearchBarProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, onSelect, placeholder = 'Rechercher...' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const debouncedSearch = useCallback(
    (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return (q: string) => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
          if (q.length < 2) { setResults([]); return; }
          setIsLoading(true);
          try {
            const res = await onSearch(q);
            setResults(res);
          } finally {
            setIsLoading(false);
          }
        }, 300);
      };
    })(),
    [onSearch],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    debouncedSearch(val);
  };

  const typeLabels: Record<string, string> = {
    candidat: 'Candidat',
    client: 'Client',
    entreprise: 'Entreprise',
    mandat: 'Mandat',
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative w-full max-w-[400px]">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border-[1.5px] border-transparent bg-neutral-50 py-2 pl-10 pr-10 text-[13px] outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-300 hover:text-neutral-700">
            <X size={14} />
          </button>
        )}
        <kbd className="absolute right-8 top-1/2 -translate-y-1/2 hidden rounded border border-neutral-100 bg-white px-1.5 py-0.5 text-[10px] text-neutral-300 sm:inline">⌘K</kbd>
      </div>

      <AnimatePresence>
        {isOpen && (query.length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="absolute z-50 mt-1 w-full rounded-xl border border-neutral-100 bg-white py-2 shadow-[0_12px_36px_rgba(26,26,46,0.12)]"
          >
            {isLoading && <p className="px-4 py-2 text-[13px] text-neutral-300">Recherche...</p>}
            {!isLoading && results.length === 0 && <p className="px-4 py-2 text-[13px] text-neutral-300">Aucun résultat</p>}
            {!isLoading && Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <p className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">{typeLabels[type] || type}</p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onSelect(item); setIsOpen(false); setQuery(''); }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm text-neutral-900 rounded-lg hover:bg-neutral-50"
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-neutral-500">{item.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
