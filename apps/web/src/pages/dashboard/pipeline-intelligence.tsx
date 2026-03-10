import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Users, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Skeleton from '../../components/ui/Skeleton';
import Badge from '../../components/ui/Badge';

interface MandatHealth {
  mandatId: string;
  titrePoste: string;
  entreprise: string | null;
  status: 'GREEN' | 'AMBER' | 'RED';
  score: number;
  reasons: string[];
  recommendation: string;
  stats: {
    totalCandidats: number;
    activeCandidats: number;
    daysSinceLastActivity: number;
    daysSinceCreation: number;
    conversionRate: number;
  };
}

const statusConfig = {
  GREEN: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2, label: 'Sain' },
  AMBER: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle, label: 'Attention' },
  RED: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: TrendingDown, label: 'Critique' },
};

export default function PipelineIntelligencePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-intelligence'],
    queryFn: () => api.get<{ mandats: MandatHealth[] }>('/dashboard/pipeline-intelligence'),
  });

  const mandats = data?.mandats || [];
  const redCount = mandats.filter(m => m.status === 'RED').length;
  const amberCount = mandats.filter(m => m.status === 'AMBER').length;
  const greenCount = mandats.filter(m => m.status === 'GREEN').length;

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      <PageHeader
        title="Pipeline Intelligence"
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Pipeline Intelligence' }]}
      />

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-red-50 border border-red-100 p-5">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <TrendingDown size={18} />
            <span className="text-sm font-semibold">Critiques</span>
          </div>
          <p className="text-3xl font-bold text-red-700">{redCount}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">Attention</span>
          </div>
          <p className="text-3xl font-bold text-amber-700">{amberCount}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 size={18} />
            <span className="text-sm font-semibold">Sains</span>
          </div>
          <p className="text-3xl font-bold text-emerald-700">{greenCount}</p>
        </div>
      </div>

      {/* Mandat list */}
      {isLoading ? (
        <Skeleton className="h-24 w-full" count={5} />
      ) : (
        <div className="space-y-3">
          {mandats.map((m, idx) => {
            const cfg = statusConfig[m.status];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={m.mandatId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${cfg.bg}`}>
                      <Icon size={18} className={cfg.text} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-neutral-900">{m.titrePoste}</h3>
                        {m.entreprise && <span className="text-sm text-neutral-500">&mdash; {m.entreprise}</span>}
                      </div>
                      <p className={`mt-1 text-sm ${cfg.text}`}>{m.recommendation}</p>
                      {m.reasons.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {m.reasons.map((r, i) => (
                            <li key={i} className="text-xs text-neutral-500">&bull; {r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-neutral-500 space-y-1">
                      <div className="flex items-center gap-1"><Users size={12} /> {m.stats.activeCandidats}/{m.stats.totalCandidats} actifs</div>
                      <div className="flex items-center gap-1"><Clock size={12} /> {m.stats.daysSinceLastActivity}j sans activit&eacute;</div>
                      <div className="flex items-center gap-1"><Activity size={12} /> {m.stats.conversionRate}% conversion</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${cfg.text}`}>{m.score}</div>
                      <Badge variant={m.status === 'GREEN' ? 'success' : m.status === 'AMBER' ? 'warning' : 'error'} size="sm">
                        {cfg.label}
                      </Badge>
                    </div>
                    <Link to={`/mandats/${m.mandatId}/kanban`} className="rounded-lg p-2 hover:bg-white/50 transition-colors">
                      <ArrowRight size={18} className="text-neutral-400" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
