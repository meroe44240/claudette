import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Building2, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api-client';

export interface PappersSuggestionData {
  nom: string;
  siren: string;
  siret: string;
  formeJuridique: string;
  secteur: string;
  localisation: string;
  siteWeb: string;
  taille: string;
  codeNAF: string;
  libelleNAF: string;
  adresseComplete: string;
  effectif: string;
  capitalSocial: string;
}

// Réponse API Pappers (snake_case)
interface PappersSuggestion {
  siren: string;
  denomination: string;
  nom_entreprise: string;
  siege: {
    siret: string;
    code_postal: string;
    ville: string;
    adresse_ligne_1?: string;
  };
  forme_juridique?: string;
  code_naf?: string;
  libelle_code_naf?: string;
}

interface PappersEntreprise {
  siren: string;
  denomination: string;
  nom_entreprise: string;
  forme_juridique?: string;
  capital?: number;
  effectif?: string;
  effectif_min?: number;
  date_creation?: string;
  code_naf?: string;
  libelle_code_naf?: string;
  siege: {
    siret: string;
    adresse_ligne_1?: string;
    code_postal?: string;
    ville?: string;
  };
  chiffre_affaires?: number;
  site_url?: string;
  fiche_pappers_url?: string;
}

interface PappersAutocompleteProps {
  onSelect: (data: PappersSuggestionData) => void;
}

export default function PappersAutocomplete({ onSelect }: PappersAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PappersSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const searchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const data = await api.get<{ results: PappersSuggestion[] }>(
        `/integrations/pappers/suggestions?q=${encodeURIComponent(q)}`,
      );
      setSuggestions(data?.results || []);
      setIsOpen(true);
    } catch {
      setSuggestions([]);
      setError('Erreur lors de la recherche Pappers');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchSuggestions(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchSuggestions]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const deduireTaille = (effectif?: string, effectifMin?: number): string => {
    if (!effectif && effectifMin === undefined) return '';
    const n = effectifMin || parseInt(effectif || '0', 10);
    if (n <= 50) return 'STARTUP';
    if (n <= 250) return 'PME';
    if (n <= 5000) return 'ETI';
    return 'GRAND_GROUPE';
  };

  const handleSelect = async (suggestion: PappersSuggestion) => {
    setIsOpen(false);
    setIsLoading(true);
    setError(null);

    try {
      const e = await api.get<PappersEntreprise>(
        `/integrations/pappers/entreprise?siren=${encodeURIComponent(suggestion.siren)}`,
      );

      const nom = e.denomination || e.nom_entreprise || suggestion.denomination || suggestion.nom_entreprise;
      const adresseParts = [e.siege?.adresse_ligne_1, e.siege?.code_postal, e.siege?.ville].filter(Boolean);

      onSelect({
        nom,
        siren: e.siren || suggestion.siren,
        siret: e.siege?.siret || suggestion.siege?.siret || '',
        formeJuridique: e.forme_juridique || suggestion.forme_juridique || '',
        secteur: e.libelle_code_naf || suggestion.libelle_code_naf || '',
        localisation: e.siege?.ville || suggestion.siege?.ville || '',
        siteWeb: e.site_url || '',
        taille: deduireTaille(e.effectif, e.effectif_min),
        codeNAF: e.code_naf || suggestion.code_naf || '',
        libelleNAF: e.libelle_code_naf || suggestion.libelle_code_naf || '',
        adresseComplete: adresseParts.join(', '),
        effectif: e.effectif || '',
        capitalSocial: e.capital ? String(e.capital) : '',
      });

      setQuery(nom);
    } catch {
      setError('Erreur lors du chargement des données entreprise');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Input with Pappers badge */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          {isSearching || isLoading ? (
            <Loader2 size={16} className="animate-spin text-neutral-400" />
          ) : (
            <Search size={16} className="text-neutral-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder="Rechercher sur Pappers (nom ou SIREN)..."
          className="w-full rounded-lg border-[1.5px] border-neutral-100 bg-white py-2.5 pl-9 pr-24 text-sm outline-none transition-all placeholder:text-neutral-400 focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
          disabled={isLoading}
        />
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-0.5 text-neutral-400 hover:text-neutral-600"
            >
              <X size={14} />
            </button>
          )}
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            <Building2 size={10} />
            Pappers
          </span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1">
            {suggestions.map((s, idx) => (
              <li key={`${s.siren}-${idx}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-amber-50">
                    <Building2 size={14} className="text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-900">
                      {s.denomination || s.nom_entreprise}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                      <span className="font-mono">{s.siren}</span>
                      {s.siege?.ville && (
                        <>
                          <span className="text-neutral-300">|</span>
                          <span>{s.siege.ville}</span>
                        </>
                      )}
                      {s.forme_juridique && (
                        <>
                          <span className="text-neutral-300">|</span>
                          <span>{s.forme_juridique}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results */}
      {isOpen && !isSearching && suggestions.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 shadow-lg">
          Aucun résultat trouvé pour "{query}"
        </div>
      )}
    </div>
  );
}
