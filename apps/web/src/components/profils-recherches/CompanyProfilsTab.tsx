import { useQuery } from '@tanstack/react-query';
import { Code2, Handshake } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import { ProfilCard, fmtDate, type Profil } from './shared';

export interface CompanyProfils {
  company: { id: string; name: string };
  resume_profils: string | null;
  resume_profils_date: string | null;
  engineering: Profil[];
  sales: Profil[];
}

export function useCompanyProfils(entrepriseId: string | undefined) {
  return useQuery({
    queryKey: ['profils-recherches', 'entreprise', entrepriseId],
    queryFn: () => api.get<CompanyProfils>(`/profils-recherches/entreprise/${entrepriseId}`),
    enabled: !!entrepriseId,
  });
}

function Bloc({ titre, Icon, profils }: { titre: string; Icon: typeof Code2; profils: Profil[] }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon size={17} color="#22177A" />
        <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>{titre}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{profils.length}</span>
      </div>
      {profils.length === 0
        ? <div style={{ border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 14, padding: 18, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>{t('Aucun profil {fonction} analysé.', { fonction: titre })}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{profils.map(p => <ProfilCard key={p.id} p={p} />)}</div>}
    </div>
  );
}

export default function CompanyProfilsTab({ entrepriseId }: { entrepriseId: string }) {
  const { data, isLoading } = useCompanyProfils(entrepriseId);
  if (isLoading || !data) return <div style={{ padding: 24, color: '#8A8699' }}>{t('Chargement…')}</div>;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ background: '#FBFBF3', border: '1px solid rgba(34,23,122,.1)', borderRadius: 15, padding: '15px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14.5, color: '#1A1533' }}>{t('Ce que la société recrute')}</span>
          {data.resume_profils_date && <span style={{ fontSize: 12, color: '#9A96AE' }}>{t('Mis à jour le {date}', { date: fmtDate(data.resume_profils_date) })}</span>}
        </div>
        <div style={{ marginTop: 8, fontSize: 13.5, color: data.resume_profils ? '#1A1533' : '#8A8699', whiteSpace: 'pre-line', lineHeight: 1.55 }}>
          {data.resume_profils || t('Pas encore de résumé pour cette société.')}
        </div>
      </div>
      <Bloc titre="Engineering" Icon={Code2} profils={data.engineering} />
      <Bloc titre="Sales" Icon={Handshake} profils={data.sales} />
    </div>
  );
}
