import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';

interface Status {
  google?: { broken: boolean; meetAccess: boolean };
  gmail?: { connected: boolean };
  calendar?: { connected: boolean };
}

/**
 * Bandeau sous l'en-tête quand la connexion Google est cassée (emails et RDV ne
 * remontent plus) ou quand l'accès Google Meet manque (présence aux RDV illisible).
 */
export default function GoogleConnectionBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useQuery({
    queryKey: ['integrations-status-banner'],
    queryFn: () => api.get<Status>('/integrations/status'),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (!data || location.pathname.startsWith('/settings/integrations')) return null;
  const connected = !!data.gmail?.connected || !!data.calendar?.connected;
  if (!connected) return null;

  const broken = !!data.google?.broken;
  const noMeet = !broken && data.google?.meetAccess === false;
  if (!broken && !noMeet) return null;

  return (
    <div
      role="status"
      className="relative z-[2] flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-[34px]"
      style={{ background: broken ? '#F7DEDB' : '#F2F3D8', borderBottom: '1px solid rgba(34,23,122,0.08)' }}
    >
      <span className="text-sm font-medium" style={{ color: broken ? '#B3261E' : '#5C4A12' }}>
        {broken
          ? t('Votre connexion Google ne fonctionne plus : vos emails et vos RDV ne remontent plus dans l’ATS.')
          : t('Reconnectez Google pour que l’ATS sache si vos RDV Meet ont eu lieu.')}
      </span>
      <button
        type="button"
        onClick={() => navigate('/settings/integrations')}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
        style={{ background: '#22177A' }}
      >
        {t('Reconnecter Google')}
      </button>
    </div>
  );
}
