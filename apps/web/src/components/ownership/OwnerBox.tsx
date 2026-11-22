import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, UserRound } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/auth-store';

// Propriétaire d'une société, d'un lead ou d'un contact (humain ou agent), avec prise et libération.

interface Owner { id: string; name: string; is_agent: boolean }
interface OwnerState {
  owned: boolean;
  current: { owner: Owner; since: string | null; expires_at: string | null; reason: string | null } | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const btn: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, borderRadius: 9, padding: '7px 12px', cursor: 'pointer' };

export default function OwnerBox({ type, id }: { type: 'company' | 'lead' | 'client'; id: string }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const me = (user as any)?.id as string | undefined;
  const isAdmin = (user as any)?.role === 'ADMIN';
  const key = ['ownership', type, id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<OwnerState>(`/ownership/${type}/${id}`) });
  const done = (r: any) => {
    if (r?.conflict) toast('error', t('Déjà pris par {nom}.', { nom: r.current?.owner?.name ?? '?' }));
    qc.invalidateQueries({ queryKey: key });
  };
  const claim = useMutation({ mutationFn: () => api.post<any>(`/ownership/${type}/${id}/claim`, {}), onSuccess: done, onError: (e: any) => toast('error', e?.message || t('Échec')) });
  const release = useMutation({ mutationFn: () => api.post<any>(`/ownership/${type}/${id}/release`, {}), onSuccess: done, onError: (e: any) => toast('error', e?.message || t('Échec')) });
  if (!data) return null;
  const cur = data.current;
  const mine = !!cur && cur.owner.id === me;
  return (
    <div style={{ padding: '12px 13px', background: '#FBFBF3', border: '1px solid rgba(34,23,122,.08)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {cur?.owner.is_agent ? <Bot size={15} color="#22177A" /> : <UserRound size={15} color="#22177A" />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#6E6A85' }}>{t('Propriétaire')}</div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{cur ? cur.owner.name : t('Personne')}</div>
        {cur?.since && <div style={{ fontSize: 11.5, color: '#9A96AE', marginTop: 2 }}>{t('depuis le {date}', { date: fmt(cur.since) })}{cur.expires_at ? ` · ${t("jusqu'au {date}", { date: fmt(cur.expires_at) })}` : ''}</div>}
        {cur?.reason && <div style={{ fontSize: 12, color: '#4A4568', marginTop: 3 }}>{cur.reason}</div>}
      </div>
      {!cur && <button onClick={() => claim.mutate()} disabled={claim.isPending} style={{ ...btn, background: '#22177A', color: '#E6E9AF', border: 'none' }}>{t('Prendre la main')}</button>}
      {mine && <button onClick={() => claim.mutate()} disabled={claim.isPending} style={{ ...btn, background: '#fff', color: '#22177A', border: '1px solid rgba(34,23,122,.16)' }}>{t('Prolonger')}</button>}
      {cur && (mine || isAdmin) && <button onClick={() => release.mutate()} disabled={release.isPending} style={{ ...btn, background: '#fff', color: '#B3261E', border: '1px solid rgba(176,54,31,.2)' }}>{t('Libérer')}</button>}
    </div>
  );
}
