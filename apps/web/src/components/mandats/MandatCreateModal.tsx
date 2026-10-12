import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import Modal from '../ui/Modal';
import Input, { Textarea } from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

interface Entreprise { id: string; nom: string }
interface Client { id: string; nom: string; prenom: string | null }
interface Paginated<T> { data: T[] }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pré-sélection éventuelle (depuis une fiche entreprise) */
  entrepriseId?: string;
  /** Callback après création (sinon navigate vers la fiche) */
  onCreated?: (id: string) => void;
}

const PRIORITES = [
  { value: 'BASSE', label: t('Basse') },
  { value: 'NORMALE', label: t('Normale') },
  { value: 'HAUTE', label: t('Haute') },
  { value: 'URGENTE', label: t('Urgente') },
];

const NATURES = [
  { value: 'CDI', label: 'CDI' },
  { value: 'CDD', label: 'CDD' },
  { value: 'INTERIM', label: t('Intérim') },
  { value: 'FREELANCE', label: 'Freelance' },
];

const empty = {
  titrePoste: '', type: 'CLIENT', entrepriseId: '', clientId: '',
  localisation: '', salaireMin: '', salaireMax: '', feePourcentage: '20',
  priorite: 'NORMALE', natureContrat: '', description: '',
};

/**
 * Création de mandat EN MODAL (remplace la navigation vers /mandats/new).
 * Salaire (fourchette) + fee sont OBLIGATOIRES pour un mandat CLIENT.
 */
export default function MandatCreateModal({ isOpen, onClose, entrepriseId, onCreated }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...empty, entrepriseId: entrepriseId || '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewEnt, setShowNewEnt] = useState(false);
  const [newEntNom, setNewEntNom] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ nom: '', prenom: '', email: '' });

  const isClient = form.type === 'CLIENT';

  const { data: entData } = useQuery({
    queryKey: ['entreprises', 'all'],
    queryFn: () => api.get<Paginated<Entreprise>>('/entreprises?perPage=100'),
    enabled: isOpen,
  });
  const { data: cliData } = useQuery({
    queryKey: ['clients', 'byEntreprise', form.entrepriseId],
    queryFn: () => api.get<Paginated<Client>>(`/clients?entrepriseId=${form.entrepriseId}&perPage=100`),
    enabled: isOpen && !!form.entrepriseId,
  });

  const entOptions = useMemo(() => (entData?.data || []).map((e) => ({ value: e.id, label: e.nom })), [entData]);
  const cliOptions = useMemo(() => (cliData?.data || []).map((c) => ({ value: c.id, label: `${c.prenom || ''} ${c.nom}`.trim() })), [cliData]);

  const setField = (k: string, v: string) => { setForm((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: '' })); };

  const createEnt = useMutation({
    mutationFn: (nom: string) => api.post<{ id: string }>('/entreprises', { nom }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['entreprises', 'all'] }); setField('entrepriseId', c.id); setForm((p) => ({ ...p, clientId: '' })); setShowNewEnt(false); setNewEntNom(''); toast('success', t('Entreprise créée')); },
    onError: (e: any) => toast('error', e.message || t('Erreur')),
  });
  const createClient = useMutation({
    mutationFn: (payload: any) => api.post<{ id: string }>('/clients', payload),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['clients', 'byEntreprise', form.entrepriseId] }); setField('clientId', c.id); setShowNewClient(false); setNewClient({ nom: '', prenom: '', email: '' }); toast('success', t('Client créé')); },
    onError: (e: any) => toast('error', e.message || t('Erreur')),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ id: string }>('/mandats', payload),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['mandats'] });
      toast('success', t('Mandat créé'));
      onClose();
      setForm({ ...empty });
      if (onCreated) onCreated(created.id); else navigate(`/mandats/${created.id}`);
    },
    onError: (e: any) => toast('error', e.message || t('Erreur lors de la création')),
  });

  const submit = () => {
    const err: Record<string, string> = {};
    if (!form.titrePoste.trim()) err.titrePoste = t('Titre requis');
    if (!form.entrepriseId) err.entrepriseId = t('Entreprise requise');
    if (isClient && !form.clientId) err.clientId = t('Client requis');
    // #9 : fourchette de salaire + fee OBLIGATOIRES (mandat client)
    if (isClient) {
      if (!form.salaireMin) err.salaireMin = t('Requis');
      if (!form.salaireMax) err.salaireMax = t('Requis');
      if (form.salaireMin && form.salaireMax && Number(form.salaireMax) < Number(form.salaireMin)) err.salaireMax = 'Max < min';
      if (!form.feePourcentage) err.feePourcentage = t('Requis');
    }
    if (Object.keys(err).length) { setErrors(err); return; }

    const payload: Record<string, unknown> = { titrePoste: form.titrePoste.trim(), type: form.type, entrepriseId: form.entrepriseId, priorite: form.priorite };
    if (isClient && form.clientId) payload.clientId = form.clientId;
    if (form.localisation.trim()) payload.localisation = form.localisation.trim();
    if (form.salaireMin) payload.salaireMin = parseInt(form.salaireMin, 10);
    if (form.salaireMax) payload.salaireMax = parseInt(form.salaireMax, 10);
    if (form.feePourcentage) payload.feePourcentage = parseFloat(form.feePourcentage);
    if (form.natureContrat) payload.natureContrat = form.natureContrat;
    if (form.description.trim()) payload.description = form.description.trim();
    create.mutate(payload);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('Nouveau mandat')} size="lg">
        <div className="space-y-5">
          {/* Type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[{ v: 'CLIENT', t: t('Mandat client'), d: t('Poste facturable, rattaché à un client et un contrat.') }, { v: 'VIVIER', t: t('Annonce vivier'), d: t('Offre de sourcing sans client. Hors statistiques.') }].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm((p) => ({ ...p, type: o.v, ...(o.v === 'VIVIER' ? { clientId: '' } : {}) }))}
                className={`rounded-xl border p-3 text-left transition-all ${form.type === o.v ? 'border-[#22177A] bg-[#F3F0FA]' : 'border-border bg-white hover:border-accent'}`}>
                <div className="text-sm font-bold text-[#1A1533]">{o.t}</div>
                <div className="mt-0.5 text-xs text-text-secondary">{o.d}</div>
              </button>
            ))}
          </div>

          <Input label={t('Intitulé du poste *')} value={form.titrePoste} onChange={(e) => setField('titrePoste', e.target.value)} placeholder={t('Ex : Technicien automatisme')} error={errors.titrePoste} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <div className="flex-1"><Select label={t('Entreprise *')} options={entOptions} value={form.entrepriseId} onChange={(v) => { setField('entrepriseId', v); setForm((p) => ({ ...p, clientId: '' })); }} placeholder={t('Rechercher ou créer…')} searchable error={errors.entrepriseId} /></div>
              <button type="button" onClick={() => setShowNewEnt(true)} className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:border-accent hover:text-accent" title={t('Créer une entreprise')}><Plus size={16} /></button>
            </div>
            {isClient && (
              <div className="flex items-end gap-2">
                <div className="flex-1"><Select label={t('Contact client *')} options={cliOptions} value={form.clientId} onChange={(v) => setField('clientId', v)} placeholder={form.entrepriseId ? t('Rechercher ou créer…') : t("Choisir l'entreprise d'abord")} searchable error={errors.clientId} /></div>
                <button type="button" onClick={() => { if (!form.entrepriseId) { toast('error', t("Sélectionne d'abord une entreprise")); return; } setShowNewClient(true); }} className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:border-accent hover:text-accent" title={t('Créer un client')}><Plus size={16} /></button>
              </div>
            )}
          </div>

          {/* Salaire + fee — obligatoires (client) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label={isClient ? t('Salaire min (€) *') : t('Salaire min (€)')} type="number" value={form.salaireMin} onChange={(e) => setField('salaireMin', e.target.value)} placeholder="45000" error={errors.salaireMin} />
            <Input label={isClient ? t('Salaire max (€) *') : t('Salaire max (€)')} type="number" value={form.salaireMax} onChange={(e) => setField('salaireMax', e.target.value)} placeholder="60000" error={errors.salaireMax} />
            <Input label={isClient ? 'Fee (%) *' : 'Fee (%)'} type="number" value={form.feePourcentage} onChange={(e) => setField('feePourcentage', e.target.value)} placeholder="20" error={errors.feePourcentage} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label={t('Localisation')} value={form.localisation} onChange={(e) => setField('localisation', e.target.value)} placeholder="Lyon (69)" />
            <Select label={t('Nature du contrat')} options={NATURES} value={form.natureContrat} onChange={(v) => setField('natureContrat', v)} placeholder="—" />
            <Select label={t('Priorité')} options={PRIORITES} value={form.priorite} onChange={(v) => setField('priorite', v)} />
          </div>

          <Textarea label={t('Description')} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder={t('Contexte du recrutement…')} />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={create.isPending}>{t('Annuler')}</Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>{create.isPending ? t('Création…') : t('Créer le mandat')}</Button>
          </div>
        </div>
      </Modal>

      {/* Quick create entreprise */}
      <Modal isOpen={showNewEnt} onClose={() => setShowNewEnt(false)} title={t('Nouvelle entreprise')} size="sm">
        <div className="space-y-4">
          <Input label={t("Nom de l'entreprise *")} value={newEntNom} onChange={(e) => setNewEntNom(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewEnt(false)}>{t('Annuler')}</Button>
            <Button disabled={!newEntNom.trim() || createEnt.isPending} onClick={() => createEnt.mutate(newEntNom.trim())}>{t('Créer')}</Button>
          </div>
        </div>
      </Modal>

      {/* Quick create client */}
      <Modal isOpen={showNewClient} onClose={() => setShowNewClient(false)} title={t('Nouveau client')} size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('Prénom')} value={newClient.prenom} onChange={(e) => setNewClient((p) => ({ ...p, prenom: e.target.value }))} autoFocus />
            <Input label={t('Nom *')} value={newClient.nom} onChange={(e) => setNewClient((p) => ({ ...p, nom: e.target.value }))} />
          </div>
          <Input label="Email" type="email" value={newClient.email} onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewClient(false)}>{t('Annuler')}</Button>
            <Button disabled={!newClient.nom.trim() || createClient.isPending} onClick={() => { const p: any = { nom: newClient.nom.trim(), entrepriseId: form.entrepriseId }; if (newClient.prenom.trim()) p.prenom = newClient.prenom.trim(); if (newClient.email.trim()) p.email = newClient.email.trim(); createClient.mutate(p); }}>{t('Créer')}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
