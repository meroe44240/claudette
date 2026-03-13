import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { User, Building2, FileText, Briefcase, Phone, Mail, MapPin, ExternalLink, Globe } from 'lucide-react';
import { api } from '../../lib/api-client';
import SlideOver from './SlideOver';
import Badge from './Badge';
import Skeleton from './Skeleton';

interface EntityPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string | null;
  entityId: string | null;
}

const ENTITY_CONFIG: Record<string, { route: string; label: string; icon: typeof User; color: string }> = {
  candidat: { route: '/candidats', label: 'Candidat', icon: User, color: 'text-violet-500' },
  client: { route: '/clients', label: 'Client', icon: Building2, color: 'text-blue-500' },
  entreprise: { route: '/entreprises', label: 'Entreprise', icon: Briefcase, color: 'text-emerald-500' },
  mandat: { route: '/mandats', label: 'Mandat', icon: FileText, color: 'text-amber-500' },
};

function CandidatPreview({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-600">
          {(data.prenom?.[0] || '').toUpperCase()}{(data.nom?.[0] || '').toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">{data.prenom} {data.nom}</p>
          {data.posteActuel && <p className="text-sm text-neutral-500">{data.posteActuel}</p>}
        </div>
      </div>

      <div className="space-y-2">
        {data.email && (
          <a href={`mailto:${data.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <Mail size={14} /> {data.email}
          </a>
        )}
        {data.telephone && (
          <a href={`tel:${data.telephone}`} className="flex items-center gap-2 text-sm text-emerald-600 hover:underline">
            <Phone size={14} /> {data.telephone}
          </a>
        )}
        {data.localisation && (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <MapPin size={14} /> {data.localisation}
          </p>
        )}
        {data.entrepriseActuelle && (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Building2 size={14} /> {data.entrepriseActuelle}
          </p>
        )}
      </div>

      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.tags.slice(0, 8).map((tag: string) => (
            <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{tag}</span>
          ))}
        </div>
      )}

      {data.notes && (
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-400 mb-1">Notes</p>
          <p className="text-sm text-neutral-700 line-clamp-4 whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}
    </div>
  );
}

function ClientPreview({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
          {(data.prenom?.[0] || '').toUpperCase()}{(data.nom?.[0] || '').toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">{data.prenom} {data.nom}</p>
          {data.poste && <p className="text-sm text-neutral-500">{data.poste}</p>}
        </div>
      </div>

      <div className="space-y-2">
        {data.email && (
          <a href={`mailto:${data.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <Mail size={14} /> {data.email}
          </a>
        )}
        {data.telephone && (
          <a href={`tel:${data.telephone}`} className="flex items-center gap-2 text-sm text-emerald-600 hover:underline">
            <Phone size={14} /> {data.telephone}
          </a>
        )}
        {data.entreprise?.nom && (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Building2 size={14} /> {data.entreprise.nom}
          </p>
        )}
      </div>
    </div>
  );
}

function EntreprisePreview({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-600">
          {(data.nom?.[0] || '').toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">{data.nom}</p>
          {data.secteur && <p className="text-sm text-neutral-500">{data.secteur}</p>}
        </div>
      </div>

      <div className="space-y-2">
        {data.localisation && (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <MapPin size={14} /> {data.localisation}
          </p>
        )}
        {data.siteWeb && (
          <a href={data.siteWeb} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <Globe size={14} /> {data.siteWeb}
          </a>
        )}
      </div>

      {data._count && (
        <div className="flex gap-3">
          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-center flex-1">
            <p className="text-lg font-bold text-neutral-900">{data._count.clients || 0}</p>
            <p className="text-[11px] text-neutral-400">Contacts</p>
          </div>
          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-center flex-1">
            <p className="text-lg font-bold text-neutral-900">{data._count.mandats || 0}</p>
            <p className="text-[11px] text-neutral-400">Mandats</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MandatPreview({ data }: { data: any }) {
  const STATUT_LABELS: Record<string, string> = {
    OUVERT: 'Ouvert', EN_COURS: 'En cours', GAGNE: 'Gagné',
    PERDU: 'Perdu', ANNULE: 'Annulé', CLOTURE: 'Clôturé',
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold text-neutral-900">{data.titrePoste}</p>
        {data.entreprise?.nom && (
          <p className="text-sm text-neutral-500">{data.entreprise.nom}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {data.statut && (
          <Badge>{STATUT_LABELS[data.statut] || data.statut}</Badge>
        )}
        {data._count?.candidatures !== undefined && (
          <Badge variant="info">{data._count.candidatures} candidat{data._count.candidatures > 1 ? 's' : ''}</Badge>
        )}
      </div>

      {data.description && (
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-400 mb-1">Description</p>
          <p className="text-sm text-neutral-700 line-clamp-6 whitespace-pre-wrap">{data.description}</p>
        </div>
      )}
    </div>
  );
}

export default function EntityPreview({ isOpen, onClose, entityType, entityId }: EntityPreviewProps) {
  const navigate = useNavigate();

  const normalizedType = entityType?.toLowerCase() || '';
  const config = ENTITY_CONFIG[normalizedType];

  const { data, isLoading } = useQuery({
    queryKey: ['entity-preview', entityType, entityId],
    queryFn: () => {
      if (!config || !entityId) return null;
      return api.get(`${config.route}/${entityId}`);
    },
    enabled: isOpen && !!entityId && !!config,
    staleTime: 30_000,
  });

  const handleOpenFull = () => {
    if (config && entityId) {
      navigate(`${config.route}/${entityId}`);
      onClose();
    }
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={config?.label || 'Apercu'}
      width="md"
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : !data ? (
        <p className="text-sm text-neutral-500">Impossible de charger les donnees.</p>
      ) : (
        <div>
          {normalizedType === 'candidat' && <CandidatPreview data={data} />}
          {normalizedType === 'client' && <ClientPreview data={data} />}
          {normalizedType === 'entreprise' && <EntreprisePreview data={data} />}
          {normalizedType === 'mandat' && <MandatPreview data={data} />}

          <button
            onClick={handleOpenFull}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-50 py-2.5 text-sm font-medium text-violet-600 hover:bg-violet-100 transition-colors"
          >
            <ExternalLink size={14} />
            Voir la fiche complete
          </button>
        </div>
      )}
    </SlideOver>
  );
}
