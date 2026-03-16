import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { GitMerge, ExternalLink, Loader2, AlertTriangle, Users } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

interface DuplicateCandidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  matchReason: string;
}

interface DuplicateGroup {
  primary: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
  };
  duplicates: DuplicateCandidat[];
}

export default function DuplicatesPage() {
  usePageTitle('Doublons candidats');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['candidats', 'duplicates'],
    queryFn: () => api.get<{ groups: DuplicateGroup[] }>('/candidats/duplicates'),
    staleTime: 30_000,
  });

  const mergeMutation = useMutation({
    mutationFn: (params: { primaryId: string; duplicateIds: string[] }) =>
      api.post('/candidats/merge', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidats', 'duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['candidats'] });
      toast('success', 'Candidats fusionnés avec succès');
    },
    onError: () => {
      toast('error', 'Erreur lors de la fusion');
    },
  });

  const groups = data?.groups || [];

  return (
    <div>
      <PageHeader
        title="Doublons candidats"
        subtitle={groups.length > 0 ? `${groups.length} groupes détectés` : undefined}
        breadcrumbs={[
          { label: 'Candidats', href: '/candidats' },
          { label: 'Doublons' },
        ]}
      />

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <EmptyState
          icon={<Users size={48} className="text-green-400" />}
          title="Aucun doublon détecté"
          description="Tous vos candidats sont uniques. Revenez vérifier ultérieurement."
        />
      )}

      <div className="space-y-4">
        {groups.map((group, idx) => {
          const primaryName = `${group.primary.prenom || ''} ${group.primary.nom}`.trim();
          return (
            <motion.div
              key={group.primary.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-500" />
                      <span className="text-sm font-semibold text-neutral-800">
                        {group.duplicates.length + 1} candidats similaires
                      </span>
                    </div>

                    {/* Primary */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                        Principal
                      </span>
                      <Link
                        to={`/candidats/${group.primary.id}`}
                        className="text-sm font-medium text-neutral-900 hover:text-primary-600 hover:underline flex items-center gap-1"
                      >
                        {primaryName}
                        <ExternalLink size={12} />
                      </Link>
                      {group.primary.email && (
                        <span className="text-xs text-neutral-400">{group.primary.email}</span>
                      )}
                    </div>

                    {/* Duplicates */}
                    <div className="space-y-1.5 pl-4 border-l-2 border-amber-200">
                      {group.duplicates.map((dup) => {
                        const dupName = `${dup.prenom || ''} ${dup.nom}`.trim();
                        return (
                          <div key={dup.id} className="flex items-center gap-2">
                            <Link
                              to={`/candidats/${dup.id}`}
                              className="text-sm text-neutral-700 hover:text-primary-600 hover:underline flex items-center gap-1"
                            >
                              {dupName}
                              <ExternalLink size={11} />
                            </Link>
                            {dup.email && (
                              <span className="text-xs text-neutral-400">{dup.email}</span>
                            )}
                            <span className="text-[10px] text-amber-500 bg-amber-50 rounded px-1.5 py-0.5">
                              {dup.matchReason}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      mergeMutation.mutate({
                        primaryId: group.primary.id,
                        duplicateIds: group.duplicates.map((d) => d.id),
                      })
                    }
                    disabled={mergeMutation.isPending}
                  >
                    {mergeMutation.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <GitMerge size={14} />
                    )}
                    Fusionner
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
