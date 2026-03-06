import { ChevronUp, ChevronDown } from 'lucide-react';

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
}

export default function SortableHeader({ label, sortKey, sortConfig, onSort }: SortableHeaderProps) {
  const isActive = sortConfig?.key === sortKey;
  const isAsc = isActive && sortConfig?.direction === 'asc';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSort(sortKey); }}
      className="inline-flex items-center gap-1 group cursor-pointer select-none"
    >
      <span>{label}</span>
      <span className={`inline-flex flex-col transition-colors ${isActive ? 'text-[#7C5CFC]' : 'text-neutral-300 group-hover:text-neutral-400'}`}>
        {isActive ? (
          isAsc ? <ChevronUp size={12} strokeWidth={2.5} /> : <ChevronDown size={12} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={12} strokeWidth={2} />
        )}
      </span>
    </button>
  );
}

export function toggleSort(sortConfig: SortConfig | null, key: string): SortConfig {
  if (sortConfig?.key === key) {
    return { key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

export function applySortToData<T>(data: T[], sortConfig: SortConfig | null, accessor: (row: T, key: string) => string | number | null): T[] {
  if (!sortConfig) return data;
  const { key, direction } = sortConfig;
  return [...data].sort((a, b) => {
    const aVal = accessor(a, key);
    const bVal = accessor(b, key);
    // Nulls last
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    let cmp: number;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
    }
    return direction === 'asc' ? cmp : -cmp;
  });
}
