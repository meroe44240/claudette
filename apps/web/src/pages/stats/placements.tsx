import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Calendar, User, Building } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Skeleton from '../../components/ui/Skeleton';
import Badge from '../../components/ui/Badge';

interface Placement {
  candidatureId: string;
  candidatNom: string;
  mandatTitre: string;
  entrepriseNom: string | null;
  placedAt: string;
  daysSincePlacement: number;
  nextFollowUp: string;
  followUpDue: boolean;
  checks: { oneWeek: boolean; oneMonth: boolean; threeMonths: boolean; sixMonths: boolean };
}

export default function PlacementsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['placements-followup'],
    queryFn: () => api.get<{ placements: Placement[] }>('/stats/placements'),
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Suivi des placements"
        subtitle="Follow-up post-embauche de vos candidats plac&eacute;s"
        breadcrumbs={[{ label: 'Stats', href: '/stats' }, { label: 'Placements' }]}
      />

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !data?.placements.length ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-neutral-500">Aucun placement a suivre</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.placements.map((p, i) => (
            <motion.div
              key={p.candidatureId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-xl border bg-white p-5 ${p.followUpDue ? 'border-amber-200 bg-amber-50/30' : 'border-neutral-200'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-neutral-400" />
                    <span className="font-semibold text-neutral-900">{p.candidatNom}</span>
                    {p.followUpDue && <Badge variant="warning">Follow-up requis</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-neutral-500">
                    <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />{p.mandatTitre}{p.entrepriseNom ? ` · ${p.entrepriseNom}` : ''}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Place il y a {p.daysSincePlacement}j</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-violet-600">{p.nextFollowUp}</p>
                </div>
                <div className="flex gap-2">
                  {(['1S', '1M', '3M', '6M'] as const).map((label, idx) => {
                    const checked = [p.checks.oneWeek, p.checks.oneMonth, p.checks.threeMonths, p.checks.sixMonths][idx];
                    return (
                      <div key={label} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${checked ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-400'}`}>
                        {checked ? <CheckCircle2 className="h-4 w-4" /> : label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
