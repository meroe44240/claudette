import { useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
  gradient?: 'blue' | 'violet' | 'emerald' | 'amber';
}

const gradientClasses = {
  blue: 'from-blue-50 to-blue-100/50',
  violet: 'from-violet-50 to-violet-100/50',
  emerald: 'from-emerald-50 to-emerald-100/50',
  amber: 'from-amber-50 to-amber-100/50',
};

const iconBgClasses = {
  blue: 'bg-blue-100 text-blue-600',
  violet: 'bg-violet-100 text-violet-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
};

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 100, damping: 30 });
  const display = useTransform(springValue, (v) => Math.round(v).toLocaleString('fr-FR'));

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span>{display}</motion.span>;
}

export default function StatsCard({ label, value, icon, trend, className = '', gradient }: StatsCardProps) {
  const bg = gradient ? `bg-gradient-to-br ${gradientClasses[gradient]}` : 'bg-white';
  const iconBg = gradient ? iconBgClasses[gradient] : 'bg-bg-secondary text-text-secondary';

  return (
    <div className={`gradient-border rounded-2xl border border-border/50 p-5 shadow-card card-hover hover:shadow-card-hover ${bg} ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">
            {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
          </p>
          {trend && (
            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${trend.value >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {trend.value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </div>
          )}
        </div>
        {icon && <div className={`rounded-xl p-3 ${iconBg}`}>{icon}</div>}
      </div>
    </div>
  );
}
