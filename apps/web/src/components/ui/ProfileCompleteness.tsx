import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface FieldDef {
  key: string;
  label: string;
  filled: boolean;
  weight?: number;
}

interface ProfileCompletenessProps {
  fields: FieldDef[];
  className?: string;
}

export default function ProfileCompleteness({ fields, className = '' }: ProfileCompletenessProps) {
  const { percentage, filledCount, totalCount, missingFields } = useMemo(() => {
    const totalWeight = fields.reduce((sum, f) => sum + (f.weight ?? 1), 0);
    const filledWeight = fields.reduce((sum, f) => (f.filled ? sum + (f.weight ?? 1) : sum), 0);
    const pct = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;
    return {
      percentage: pct,
      filledCount: fields.filter((f) => f.filled).length,
      totalCount: fields.length,
      missingFields: fields.filter((f) => !f.filled),
    };
  }, [fields]);

  const color =
    percentage >= 80
      ? { ring: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700', label: 'Excellent' }
      : percentage >= 50
        ? { ring: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'À compléter' }
        : { ring: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700', label: 'Incomplet' };

  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`rounded-2xl border border-neutral-100 bg-white p-4 ${className}`}>
      <div className="flex items-center gap-4">
        {/* Circular progress */}
        <div className="relative h-20 w-20 shrink-0">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className="text-neutral-100"
            />
            <motion.circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              className={color.ring}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ strokeDasharray: circumference }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${color.text}`}>{percentage}%</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${color.bg} ${color.text}`}>
              {color.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {filledCount}/{totalCount} champs remplis
          </p>
        </div>
      </div>

      {/* Missing fields */}
      {missingFields.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-neutral-50 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Champs manquants
          </p>
          {missingFields.map((field) => (
            <div
              key={field.key}
              className="flex items-center gap-1.5 text-xs text-neutral-500"
            >
              <AlertCircle size={12} className="shrink-0 text-neutral-300" />
              <span>{field.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
