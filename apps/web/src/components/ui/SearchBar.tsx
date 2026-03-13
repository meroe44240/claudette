import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plus, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  extra?: string;
}

interface SearchBarProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
  onCreate?: (type: string, prefill: string) => void;
  placeholder?: string;
}

const RECENT_KEY = 'humanup_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  const recent = getRecentSearches().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export default function SearchBar({ onSearch, onSelect, onCreate, placeholder = 'Rechercher...' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showRecent, setShowRecent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const noResultsCreate = query.length >= 2 && results.length === 0 && !isLoading && !!onCreate;
  const createOptions = noResultsCreate
    ? [
        { type: 'candidat', label: `Cr\u00e9er un candidat "${query}"` },
        { type: 'entreprise', label: `Cr\u00e9er une entreprise "${query}"` },
      ]
    : [];
  const totalNavigable = results.length + createOptions.length;

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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowRecent(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

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
    setShowRecent(false);
    debouncedSearch(val);
  };

  const handleFocus = () => {
    if (query.length >= 2) {
      setIsOpen(true);
    } else {
      const recent = getRecentSearches();
      if (recent.length > 0) setShowRecent(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setShowRecent(false);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || totalNavigable === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % totalNavigable);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? totalNavigable - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        const selected = results[activeIndex];
        addRecentSearch(query);
        onSelect(selected);
        setIsOpen(false);
        setQuery('');
      } else if (activeIndex >= results.length && activeIndex < totalNavigable && onCreate) {
        const opt = createOptions[activeIndex - results.length];
        onCreate(opt.type, query);
        setIsOpen(false);
        setQuery('');
      }
    }
  };

  const handleSelectRecent = (q: string) => {
    setQuery(q);
    setShowRecent(false);
    setIsOpen(true);
    debouncedSearch(q);
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

  let flatIndex = 0;
  const recentSearches = getRecentSearches();

  return (
    <div ref={ref} className="relative w-full max-w-[400px]">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border-[1.5px] border-transparent bg-neutral-50 py-2 pl-10 pr-10 text-[13px] outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-300 hover:text-neutral-700">
            <X size={14} />
          </button>
        )}
        <kbd className="absolute right-8 top-1/2 -translate-y-1/2 hidden rounded border border-neutral-100 bg-white px-1.5 py-0.5 text-[10px] text-neutral-300 sm:inline">&#x2318;K</kbd>
      </div>

      {/* Recent searches dropdown */}
      <AnimatePresence>
        {showRecent && !isOpen && recentSearches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="absolute z-50 mt-1 w-full rounded-xl border border-neutral-100 bg-white py-2 shadow-[0_12px_36px_rgba(26,26,46,0.12)]"
          >
            <p className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 flex items-center gap-1.5">
              <Clock size={10} />
              Recherches r&#233;centes
            </p>
            {recentSearches.map((q) => (
              <button
                key={q}
                onClick={() => handleSelectRecent(q)}
                className="flex w-full items-center gap-3 px-3.5 py-2 text-sm text-neutral-700 rounded-lg hover:bg-neutral-50"
              >
                <Clock size={12} className="text-neutral-300" />
                {q}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search results dropdown */}
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
            {!isLoading && results.length === 0 && (
              <div>
                <p className="px-4 py-2 text-[13px] text-neutral-400">Aucun r&#233;sultat pour &#171;{query}&#187;</p>
                {onCreate && createOptions.length > 0 && (
                  <div className="border-t border-neutral-50 mt-1 pt-1">
                    {createOptions.map((opt, idx) => {
                      const navIdx = results.length + idx;
                      return (
                        <button
                          key={opt.type}
                          onClick={() => { onCreate(opt.type, query); setIsOpen(false); setQuery(''); }}
                          className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm rounded-lg transition-colors ${
                            activeIndex === navIdx ? 'bg-violet-50 text-violet-700' : 'text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <Plus size={14} className="text-violet-500" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {!isLoading && Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <p className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">{typeLabels[type] || type}</p>
                {items.map((item) => {
                  const currentIdx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { addRecentSearch(query); onSelect(item); setIsOpen(false); setQuery(''); }}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-sm rounded-lg transition-colors ${
                        activeIndex === currentIdx ? 'bg-violet-50 text-violet-700' : 'text-neutral-900 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.subtitle && <p className="text-xs text-neutral-500 truncate">{item.subtitle}</p>}
                        {item.extra && <p className="text-[10px] text-neutral-400 truncate">{item.extra}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            {!isLoading && (results.length > 0 || createOptions.length > 0) && (
              <div className="border-t border-neutral-50 mt-1 px-3.5 py-1.5 flex items-center gap-3 text-[10px] text-neutral-300">
                <span><kbd className="rounded bg-neutral-100 px-1 py-0.5">&#x2191;&#x2193;</kbd> naviguer</span>
                <span><kbd className="rounded bg-neutral-100 px-1 py-0.5">&#x21B5;</kbd> ouvrir</span>
                <span><kbd className="rounded bg-neutral-100 px-1 py-0.5">esc</kbd> fermer</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
