import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Handshake, UserRound, CircleOff, ExternalLink, Search } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

type Kind = 'RDV_CLIENT' | 'PRESENTATION' | 'INTERVIEW' | 'AUTRE';

interface Attendee {
  email: string;
  role: 'candidat' | 'client' | 'external';
  name: string | null;
  entityId: string | null;
}

interface Meeting {
  id: string;
  titre: string;
  kind: Kind | 'A_CLASSER';
  startTime: string | null;
  htmlLink: string | null;
  interlocuteurs: string;
  attendees: Attendee[];
}

interface CandidatureOption {
  id: string;
  stage: string;
  candidat: string;
  mandat: string;
  entreprise: string;
}

interface ClientOption {
  id: string;
  nom: string;
  entreprise: string;
}

interface Detail {
  meeting: Meeting;
  candidatures: CandidatureOption[];
  clients: ClientOption[];
}

const KINDS: { value: Kind; label: string; icon: typeof Calendar }[] = [
  { value: 'RDV_CLIENT', label: 'RDV client', icon: Calendar },
  { value: 'PRESENTATION', label: 'Présentation', icon: Handshake },
  { value: 'INTERVIEW', label: 'Entretien candidat', icon: UserRound },
  { value: 'AUTRE', label: 'Autre', icon: CircleOff },
];

const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Qualification',
  ENTRETIEN_1: 'Entretien interne',
  ENVOYE_CLIENT: 'Envoi client',
  ENTRETIEN_CLIENT: 'Entretien client',
  PROCESS: 'Process',
  OFFRE: 'Offre',
};

function formatDate(iso: string | null) {
  if (!iso) return 'Date inconnue';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

// ISO → valeur d'un champ datetime-local (heure locale du navigateur)
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PendingList() {
  const { data, isLoading } = useQuery({
    queryKey: ['meetings-a-classer'],
    queryFn: () => api.get<{ data: Meeting[] }>('/meetings/a-classer'),
  });
  const meetings = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (meetings.length === 0) {
    return <EmptyState title="Rien à classer" icon={<Calendar size={40} />} />;
  }

  return (
    <div className="space-y-3">
      {meetings.map((m) => (
        <Link key={m.id} to={`/rdv/classer/${m.id}`} className="block">
          <Card hover>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">{m.titre}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatDate(m.startTime)}
                  {m.attendees.length > 0 && ` · ${m.attendees.map((a) => a.name || a.email).join(', ')}`}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-[#22177A]">Classer</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ClassifyForm({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['meeting-a-classer', id],
    queryFn: () => api.get<Detail>(`/meetings/${id}`),
    retry: false,
  });

  const [kind, setKind] = useState<Kind | null>(null);
  const [date, setDate] = useState('');
  const [interlocuteurs, setInterlocuteurs] = useState('');
  const [clientId, setClientId] = useState('');
  const [candidatureId, setCandidatureId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Pré-remplissage depuis l'événement d'agenda
  useEffect(() => {
    if (!data) return;
    const { meeting, clients, candidatures } = data;
    setDate(toLocalInput(meeting.startTime));
    const coteClient = meeting.attendees.filter((a) => a.role !== 'candidat');
    setInterlocuteurs(meeting.interlocuteurs || coteClient.map((a) => a.name || a.email).join(', '));
    if (clients.length > 0) setClientId(clients[0].id);
    if (candidatures.length === 1) setCandidatureId(candidatures[0].id);
  }, [data]);

  const { data: searchData } = useQuery({
    queryKey: ['meeting-candidatures', debouncedSearch],
    queryFn: () => api.get<{ data: CandidatureOption[] }>(`/meetings/candidatures?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: kind === 'PRESENTATION' && debouncedSearch.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ kind: Kind; annonce: boolean }>(`/meetings/${id}/classer`, {
        kind,
        ...(kind === 'RDV_CLIENT' || kind === 'PRESENTATION'
          ? { date: new Date(date).toISOString(), interlocuteurs: interlocuteurs.trim() }
          : {}),
        ...(kind === 'RDV_CLIENT' && clientId ? { clientId } : {}),
        ...(kind === 'PRESENTATION' ? { candidatureId } : {}),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['meetings-a-classer'] });
      toast('success', res.annonce ? 'Validé et annoncé sur Slack' : 'Validé');
      navigate('/rdv/classer');
    },
    onError: (e) => {
      toast('error', e instanceof ApiError ? e.data.message || 'Erreur lors de la validation' : 'Erreur lors de la validation');
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return <EmptyState title="Événement introuvable" actionLabel="Voir les événements à classer" onAction={() => navigate('/rdv/classer')} />;
  }

  const { meeting, clients } = data;
  const options = debouncedSearch.length >= 2 ? searchData?.data ?? [] : data.candidatures;
  const needsDetails = kind === 'RDV_CLIENT' || kind === 'PRESENTATION';
  const missing =
    !kind ||
    (needsDetails && (!date || (!interlocuteurs.trim() && !(kind === 'RDV_CLIENT' && clientId)))) ||
    (kind === 'PRESENTATION' && !candidatureId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-neutral-900">{meeting.titre}</p>
            <p className="mt-1 text-sm text-neutral-500">{formatDate(meeting.startTime)}</p>
            {meeting.attendees.length > 0 && (
              <p className="mt-1 text-sm text-neutral-500">
                Avec {meeting.attendees.map((a) => a.name || a.email).join(', ')}
              </p>
            )}
          </div>
          {meeting.htmlLink && (
            <a
              href={meeting.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#22177A] hover:underline"
            >
              <ExternalLink size={14} />
              Agenda
            </a>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-xs font-medium transition-all ${
                  kind === value
                    ? 'border-[#22177A] bg-[#F2F3D8] text-[#22177A]'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          {kind === 'PRESENTATION' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">Candidat présenté</label>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un candidat"
                  className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:border-[#22177A] focus:outline-none"
                />
              </div>
              {options.length > 0 ? (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {options.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCandidatureId(c.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                        candidatureId === c.id
                          ? 'border-[#22177A] bg-[#F2F3D8]'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-neutral-900">{c.candidat}</span>
                        <span className="block truncate text-xs text-neutral-500">
                          {c.mandat}
                          {c.entreprise && ` · ${c.entreprise}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">{STAGE_LABELS[c.stage] || c.stage}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Aucune candidature trouvée</p>
              )}
            </div>
          )}

          {kind === 'RDV_CLIENT' && clients.length > 1 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">Contact principal</label>
              <div className="space-y-1">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClientId(c.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                      clientId === c.id ? 'border-[#22177A] bg-[#F2F3D8]' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <span className="font-medium text-neutral-900">{c.nom}</span>
                    <span className="text-xs text-neutral-500">{c.entreprise}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsDetails && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Date et heure" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input
                label={kind === 'PRESENTATION' ? 'Interlocuteur côté client' : 'Interlocuteurs'}
                value={interlocuteurs}
                onChange={(e) => setInterlocuteurs(e.target.value)}
                placeholder="Prénom Nom"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => navigate('/rdv/classer')}>
              Plus tard
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={missing || mutation.isPending} loading={mutation.isPending}>
              Valider
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function RdvClasserPage() {
  usePageTitle('RDV à classer');
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <PageHeader title={id ? 'RDV client ou présentation ?' : 'RDV à classer'} />
      {id ? <ClassifyForm key={id} id={id} /> : <div className="mx-auto max-w-2xl"><PendingList /></div>}
    </div>
  );
}
