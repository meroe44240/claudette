import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, Target, BarChart3 } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Skeleton from '../../components/ui/Skeleton';

interface Forecast {
  month: string;
  confirmed: number;
  projected: number;
  pipeline: number;
}

interface ForecastResponse {
  forecast: Forecast[];
  summary: { totalConfirmed: number; totalProjected: number; totalPipeline: number };
}

function formatEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function RevenueForecastPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['revenue-forecast'],
    queryFn: () => api.get<ForecastResponse>('/stats/revenue-forecast'),
  });

  const maxValue = data ? Math.max(...data.forecast.map(f => f.confirmed + f.projected + f.pipeline), 1) : 1;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Prévisions de revenus"
        subtitle="Projection des revenus basée sur votre pipeline actuel"
        breadcrumbs={[{ label: 'Stats', href: '/stats' }, { label: 'Prévisions' }]}
      />

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Confirmé', value: data.summary.totalConfirmed, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Projeté', value: data.summary.totalProjected, icon: Target, color: 'text-violet-600 bg-violet-50' },
              { label: 'Pipeline', value: data.summary.totalPipeline, icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-neutral-200 bg-white p-5"
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${card.color}`}><card.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm text-neutral-500">{card.label}</p>
                    <p className="text-xl font-bold text-neutral-900">{formatEur(card.value)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-neutral-900">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              Prévisions mensuelles
            </h3>
            <div className="space-y-3">
              {data.forecast.map((f, i) => (
                <motion.div
                  key={f.month}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4"
                >
                  <span className="w-20 text-sm font-medium text-neutral-600">{f.month}</span>
                  <div className="flex-1">
                    <div className="flex h-6 overflow-hidden rounded-full bg-neutral-100">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${(f.confirmed / maxValue) * 100}%` }} />
                      <div className="bg-violet-400 transition-all" style={{ width: `${(f.projected / maxValue) * 100}%` }} />
                      <div className="bg-amber-300 transition-all" style={{ width: `${(f.pipeline / maxValue) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-24 text-right text-sm font-semibold text-neutral-900">{formatEur(f.confirmed + f.projected + f.pipeline)}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 flex gap-6 text-xs text-neutral-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Confirmé</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" />Projeté</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-300" />Pipeline</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
