import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex items-center gap-3">
      {total !== undefined && (
        <span className="text-[13px] text-neutral-500">
          Page {page} sur {totalPages} ({total} résultats)
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-100 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-[13px] text-neutral-300">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === page ? 'text-white' : 'border border-neutral-100 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {p === page && (
                <motion.div
                  layoutId="active-page"
                  className="absolute inset-0 rounded-lg bg-primary-500"
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              )}
              <span className="relative z-10">{p}</span>
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-100 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
