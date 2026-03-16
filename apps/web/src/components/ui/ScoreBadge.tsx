import { motion } from 'framer-motion';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}

export default function ScoreBadge({ score, size = 'sm', className = '' }: ScoreBadgeProps) {
  const color =
    score >= 80
      ? 'bg-green-100 text-green-700 border-green-200'
      : score >= 50
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';

  const sizeClasses = size === 'sm'
    ? 'h-5 min-w-[28px] text-[10px] px-1'
    : 'h-6 min-w-[36px] text-xs px-1.5';

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`inline-flex items-center justify-center rounded-full border font-bold ${color} ${sizeClasses} ${className}`}
      title={`Score de compatibilité : ${score}%`}
    >
      {score}
    </motion.span>
  );
}
