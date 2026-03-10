import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trophy, Medal, Phone, Mail, Calendar, Users, TrendingUp, Crown } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Select from '../../components/ui/Select';
import Skeleton from '../../components/ui/Skeleton';

interface LeaderboardEntry {
  userId: string;
  nom: string;
  prenom: string | null;
  stats: {
    placements: number;
    revenue: number;
    calls: number;
    emails: number;
    meetings: number;
    activeCandidatures: number;
  };
  rank: number;
}

const periodOptions = [
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year', label: 'Cette ann\u00e9e' },
];

const rankColors = ['text-amber-500', 'text-neutral-400', 'text-amber-700'];
const rankIcons = [Crown, Medal, Medal];

export default function LeaderboardPage() {
  const [period, setPeriod] = useState('month');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => api.get<{ leaderboard: LeaderboardEntry[] }>(`/stats/leaderboard?period=${period}`),
  });

  const entries = data?.leaderboard || [];

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      <PageHeader
        title="Leaderboard"
        breadcrumbs={[{ label: 'Stats', href: '/stats' }, { label: 'Leaderboard' }]}
      />

      <div className="mb-6 flex justify-end">
        <div className="w-48">
          <Select options={periodOptions} value={period} onChange={setPeriod} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" count={5} />
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => {
            const isTop3 = idx < 3;
            const RankIcon = rankIcons[idx] || Trophy;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors ${
                  isTop3 ? 'border-amber-100 bg-gradient-to-r from-amber-50/50 to-white' : 'border-neutral-100'
                }`}
              >
                <div className="flex items-center gap-5">
                  {/* Rank */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isTop3 ? 'bg-amber-100' : 'bg-neutral-100'
                  }`}>
                    {isTop3 ? (
                      <RankIcon size={20} className={rankColors[idx]} />
                    ) : (
                      <span className="text-sm font-bold text-neutral-400">#{entry.rank}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-neutral-900">
                      {entry.prenom} {entry.nom}
                    </p>
                    <div className="mt-1 flex gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1"><Trophy size={12} /> {entry.stats.placements} placement{entry.stats.placements > 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1"><TrendingUp size={12} /> {(entry.stats.revenue / 1000).toFixed(0)}k&euro;</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-neutral-400">
                        <Phone size={14} />
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-neutral-700">{entry.stats.calls}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-neutral-400">
                        <Mail size={14} />
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-neutral-700">{entry.stats.emails}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-neutral-400">
                        <Calendar size={14} />
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-neutral-700">{entry.stats.meetings}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-neutral-400">
                        <Users size={14} />
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-neutral-700">{entry.stats.activeCandidatures}</p>
                    </div>
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
