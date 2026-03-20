import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileSpreadsheet, Users, Phone, CheckCircle2, XCircle,
  ChevronRight, ChevronLeft, Play, ArrowRight, Crosshair,
  PhoneOff, Voicemail, PhoneForwarded, UserX, RotateCcw,
  Trash2, BarChart3, Clock, Target, TrendingUp, AlertCircle,
  Building2, Mail, Briefcase, MessageSquare, Loader2, Pencil, Check, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';

// ─── TYPES ──────────────────────────────────────────

interface SdrList {
  id: string;
  name: string;
  fileName: string;
  totalContacts: number;
  processedContacts: number;
  status: string;
  assignedToId: string | null;
  sequenceId: string | null;
  metadata: any;
  createdAt: string;
  _count?: { contacts: number };
}

interface SdrContact {
  id: string;
  sdrListId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  callResult: string;
  notes: string | null;
  candidatId: string | null;
  companyId: string | null;
  orderInList: number;
  processedAt: string | null;
}

interface UploadResult {
  listId: string;
  listName: string;
  fileName: string;
  totalContacts: number;
  stats: {
    withEmail: number;
    withPhone: number;
    withCompany: number;
    existingCandidats: number;
    existingCompanies: number;
    newContacts: number;
  };
}

interface SessionStats {
  total: number;
  processed: number;
  remaining: number;
  progressPercent: number;
  results: {
    answered: number;
    noAnswer: number;
    voicemail: number;
    wrongNumber: number;
    notInterested: number;
    callback: number;
  };
}

interface DashboardData {
  lists: SdrList[];
  kpis: {
    totalLists: number;
    activeLists: number;
    totalContacts: number;
    totalProcessed: number;
    totalRemaining: number;
    contactRate: number;
    results: SessionStats['results'];
  };
}

// ─── VIEW MODES ─────────────────────────────────────

type View = 'dashboard' | 'upload' | 'parse-result' | 'attribution' | 'dialer';

const CALL_RESULTS = [
  { value: 'answered', label: 'Répondu', icon: CheckCircle2, color: 'bg-emerald-500 hover:bg-emerald-600', textColor: 'text-emerald-600' },
  { value: 'no_answer', label: 'Pas de réponse', icon: PhoneOff, color: 'bg-amber-500 hover:bg-amber-600', textColor: 'text-amber-600' },
  { value: 'voicemail', label: 'Messagerie', icon: Voicemail, color: 'bg-blue-500 hover:bg-blue-600', textColor: 'text-blue-600' },
  { value: 'wrong_number', label: 'Mauvais n°', icon: XCircle, color: 'bg-red-500 hover:bg-red-600', textColor: 'text-red-600' },
  { value: 'not_interested', label: 'Pas intéressé', icon: UserX, color: 'bg-neutral-500 hover:bg-neutral-600', textColor: 'text-neutral-500' },
  { value: 'callback', label: 'Rappeler', icon: PhoneForwarded, color: 'bg-violet-500 hover:bg-violet-600', textColor: 'text-violet-600' },
] as const;

// ─── COMPONENT ──────────────────────────────────────

export default function SdrPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('dashboard');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [dialerContact, setDialerContact] = useState<SdrContact | null>(null);
  const [dialerStats, setDialerStats] = useState<SessionStats | null>(null);
  const [dialerNotes, setDialerNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── QUERIES ────────────────────────────────────

  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['sdr', 'dashboard'],
    queryFn: () => api.get<DashboardData>('/sdr/dashboard'),
    enabled: view === 'dashboard',
  });

  const { data: listDetail } = useQuery({
    queryKey: ['sdr', 'list', activeListId],
    queryFn: () => api.get<SdrList & { contacts: SdrContact[] }>(`/sdr/lists/${activeListId}`),
    enabled: !!activeListId && (view === 'attribution' || view === 'dialer'),
  });

  const { data: sequences } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => api.get<{ data: any[] }>('/sequences'),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: any[] }>('/admin/users'),
  });

  // ─── MUTATIONS ──────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.(csv|xlsx?)$/i, ''));

      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/sdr/upload', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      if (!res.ok) throw new Error('Erreur upload');
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      setActiveListId(data.listId);
      setView('parse-result');
      queryClient.invalidateQueries({ queryKey: ['sdr'] });
    },
  });

  const attributeMutation = useMutation({
    mutationFn: (input: { contactIds: string[]; assignedToId: string; sequenceId?: string }) =>
      api.post(`/sdr/lists/${activeListId}/attribute`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr'] });
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: () => api.post<{ nextContact: SdrContact | null; stats: SessionStats }>(`/sdr/lists/${activeListId}/start-session`),
    onSuccess: (data) => {
      setDialerContact(data.nextContact);
      setDialerStats(data.stats);
      setDialerNotes('');
      setView('dialer');
    },
  });

  const callResultMutation = useMutation({
    mutationFn: (input: { contactId: string; callResult: string; notes?: string }) =>
      api.put<{ nextContact: SdrContact | null; stats: SessionStats }>(`/sdr/contacts/${input.contactId}/result`, {
        callResult: input.callResult,
        notes: input.notes,
      }),
    onSuccess: (data) => {
      setDialerContact(data.nextContact);
      setDialerStats(data.stats);
      setDialerNotes('');
      if (!data.nextContact) {
        // Session complete
        queryClient.invalidateQueries({ queryKey: ['sdr'] });
      }
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sdr/lists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sdr'] }),
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ contactId, notes }: { contactId: string; notes: string }) =>
      api.put(`/sdr/contacts/${contactId}/notes`, { notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sdr-list'] }),
  });

  // Inline notes editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');

  const startEditNote = (contact: SdrContact) => {
    setEditingNoteId(contact.id);
    setEditingNoteValue(contact.notes || '');
  };

  const saveNote = (contactId: string) => {
    updateNotesMutation.mutate({ contactId, notes: editingNoteValue });
    setEditingNoteId(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteValue('');
  };

  // ─── FILE HANDLING ──────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(csv|xlsx?)$/i)) {
      alert('Format non supporté. Utilisez un fichier CSV ou Excel.');
      return;
    }
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  // ─── ATTRIBUTION HELPERS ────────────────────────

  const contacts = listDetail?.contacts || [];
  const toggleContact = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    }
  };

  const [assignToUser, setAssignToUser] = useState('');
  const [assignSequence, setAssignSequence] = useState('');

  const handleAttribute = () => {
    if (selectedContacts.size === 0 || !assignToUser) return;
    attributeMutation.mutate(
      {
        contactIds: [...selectedContacts],
        assignedToId: assignToUser,
        ...(assignSequence ? { sequenceId: assignSequence } : {}),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['sdr', 'list', activeListId] });
        },
      },
    );
  };

  // ─── RENDER: DASHBOARD ─────────────────────────

  const renderDashboard = () => {
    const kpis = dashboardData?.kpis;
    const lists = dashboardData?.lists || [];

    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard icon={FileSpreadsheet} label="Listes" value={kpis?.totalLists || 0} color="bg-blue-50 text-blue-600" />
          <KpiCard icon={Users} label="Contacts total" value={kpis?.totalContacts || 0} color="bg-violet-50 text-violet-600" />
          <KpiCard icon={Phone} label="Traités" value={kpis?.totalProcessed || 0} sub={kpis ? `${kpis.totalRemaining} restants` : ''} color="bg-emerald-50 text-emerald-600" />
          <KpiCard icon={Target} label="Taux de contact" value={`${kpis?.contactRate || 0}%`} color="bg-amber-50 text-amber-600" />
        </div>

        {/* Results breakdown */}
        {kpis && kpis.totalProcessed > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Résultats globaux</h3>
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
              {CALL_RESULTS.map((r) => {
                const count = kpis.results[r.value === 'no_answer' ? 'noAnswer' : r.value === 'wrong_number' ? 'wrongNumber' : r.value === 'not_interested' ? 'notInterested' : r.value as keyof SessionStats['results']] || 0;
                return (
                  <div key={r.value} className="text-center">
                    <div className={`text-2xl font-bold ${r.textColor}`}>{count}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{r.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lists table */}
        <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-700">Listes importées</h3>
            <button
              onClick={() => setView('upload')}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <Upload size={16} />
              Importer une liste
            </button>
          </div>

          {dashLoading ? (
            <div className="p-8 text-center text-sm text-neutral-400">Chargement...</div>
          ) : lists.length === 0 ? (
            <div className="p-12 text-center">
              <Crosshair size={40} className="mx-auto mb-3 text-neutral-300" />
              <p className="text-sm text-neutral-500 mb-4">Aucune liste SDR importée</p>
              <button
                onClick={() => setView('upload')}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
              >
                <Upload size={16} />
                Importer votre premier fichier
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {lists.map((list) => {
                const progress = list.totalContacts > 0
                  ? Math.round((list.processedContacts / list.totalContacts) * 100)
                  : 0;
                return (
                  <div key={list.id} className="flex items-center gap-4 px-5 py-3 hover:bg-neutral-25 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-800 truncate">{list.name}</span>
                        <StatusBadge status={list.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[12px] text-neutral-400">
                        <span>{list.totalContacts} contacts</span>
                        <span>·</span>
                        <span>{list.fileName}</span>
                        <span>·</span>
                        <span>{format(new Date(list.createdAt), 'd MMM yyyy', { locale: fr })}</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              progress === 100 ? 'bg-emerald-500' : 'bg-brand-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-neutral-500 w-8 text-right">{progress}%</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {list.status === 'imported' && (
                        <button
                          onClick={() => { setActiveListId(list.id); setView('attribution'); }}
                          className="rounded-md bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-600 hover:bg-brand-100 transition-colors"
                        >
                          Attribuer
                        </button>
                      )}
                      {(list.status === 'imported' || list.status === 'in_progress') && (
                        <button
                          onClick={() => { setActiveListId(list.id); startSessionMutation.mutate(); }}
                          className="rounded-md bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-600 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                        >
                          <Play size={12} />
                          {list.status === 'in_progress' ? 'Reprendre' : 'Démarrer'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Supprimer cette liste ?')) deleteListMutation.mutate(list.id); }}
                        className="rounded-md p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── RENDER: UPLOAD ─────────────────────────────

  const renderUpload = () => (
    <div className="max-w-xl mx-auto">
      <div
        className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          isDragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-neutral-200 bg-white hover:border-brand-300'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="text-brand-500 animate-spin" />
            <p className="text-sm text-neutral-500">Analyse du fichier en cours...</p>
          </div>
        ) : (
          <>
            <Upload size={40} className={`mx-auto mb-4 ${isDragging ? 'text-brand-500' : 'text-neutral-300'}`} />
            <h3 className="text-lg font-semibold text-neutral-800 mb-1">
              Glissez votre fichier ici
            </h3>
            <p className="text-sm text-neutral-400 mb-4">
              CSV ou Excel (.csv, .xlsx) — LinkedIn exports, bases de prospection
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <FileSpreadsheet size={16} />
              Parcourir
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </>
        )}
      </div>

      {uploadMutation.isError && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          Erreur lors de l'import. Vérifiez le format du fichier.
        </div>
      )}
    </div>
  );

  // ─── RENDER: PARSE RESULT ──────────────────────

  const renderParseResult = () => {
    if (!uploadResult) return null;
    const { stats, totalContacts, fileName } = uploadResult;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 size={20} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Import réussi</h3>
              <p className="text-sm text-neutral-400">{fileName} — {totalContacts} contacts détectés</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatBox icon={Mail} label="Avec email" value={stats.withEmail} total={totalContacts} color="text-blue-500" />
            <StatBox icon={Phone} label="Avec téléphone" value={stats.withPhone} total={totalContacts} color="text-emerald-500" />
            <StatBox icon={Building2} label="Avec entreprise" value={stats.withCompany} total={totalContacts} color="text-violet-500" />
            <StatBox icon={Users} label="Déjà en base" value={stats.existingCandidats} total={totalContacts} color="text-amber-500" />
            <StatBox icon={Building2} label="Entreprises connues" value={stats.existingCompanies} total={totalContacts} color="text-indigo-500" />
            <StatBox icon={Target} label="Nouveaux contacts" value={stats.newContacts} total={totalContacts} color="text-brand-500" />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => { setView('dashboard'); setUploadResult(null); }}
            className="rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Retour
          </button>
          <button
            onClick={() => {
              setSelectedContacts(new Set(contacts.map((c) => c.id)));
              setView('attribution');
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            Attribuer les contacts
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ─── RENDER: ATTRIBUTION ──────────────────────

  const renderAttribution = () => {
    const userList = (users as any)?.data || [];
    const seqList = (sequences as any)?.data || [];

    return (
      <div className="space-y-4">
        {/* Controls */}
        <div className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600">Attribuer à :</label>
              <select
                value={assignToUser}
                onChange={(e) => setAssignToUser(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
              >
                <option value="">Choisir un recruteur</option>
                {userList.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600">Séquence :</label>
              <select
                value={assignSequence}
                onChange={(e) => setAssignSequence(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
              >
                <option value="">Aucune (appels uniquement)</option>
                {seqList.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-neutral-400">{selectedContacts.size} sélectionné(s)</span>
              <button
                onClick={handleAttribute}
                disabled={selectedContacts.size === 0 || !assignToUser || attributeMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {attributeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                Attribuer
              </button>
            </div>
          </div>

          {attributeMutation.isSuccess && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5">
              <span className="text-sm text-emerald-700">
                {(attributeMutation.data as any)?.attributed} contacts attribués, {(attributeMutation.data as any)?.newCandidatsCreated} candidats créés
              </span>
              <button
                onClick={() => { startSessionMutation.mutate(); }}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
              >
                <Play size={14} />
                Démarrer la session d'appels
              </button>
            </div>
          )}
        </div>

        {/* Contacts table */}
        <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-[12px] font-semibold text-neutral-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedContacts.size === contacts.length && contacts.length > 0}
                    onChange={selectAll}
                    className="rounded border-neutral-300"
                  />
                </th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Entreprise</th>
                <th className="px-4 py-3">Poste</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {contacts.map((c) => (
                <tr key={c.id} className={`hover:bg-neutral-25 transition-colors ${selectedContacts.has(c.id) ? 'bg-brand-50/50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">{c.orderInList}</td>
                  <td className="px-4 py-2.5 font-medium text-neutral-800">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                    {c.candidatId && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                        En base
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.email || '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.company || '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{c.jobTitle || '—'}</td>
                  <td className="px-4 py-2.5 max-w-[250px]">
                    {editingNoteId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNote(c.id);
                            if (e.key === 'Escape') cancelEditNote();
                          }}
                          autoFocus
                          className="w-full rounded border border-primary-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary-100"
                        />
                        <button onClick={() => saveNote(c.id)} className="text-emerald-500 hover:text-emerald-600"><Check size={14} /></button>
                        <button onClick={cancelEditNote} className="text-neutral-400 hover:text-neutral-600"><X size={14} /></button>
                      </div>
                    ) : (
                      <div
                        className="group flex items-center gap-1 cursor-pointer"
                        onClick={() => startEditNote(c)}
                        title={c.notes || 'Cliquez pour ajouter une note'}
                      >
                        <span className="text-neutral-400 text-xs truncate">{c.notes || '—'}</span>
                        <Pencil size={12} className="text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <CallResultBadge result={c.callResult} />
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                    Chargement des contacts...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ─── RENDER: POWER DIALER ─────────────────────

  const renderDialer = () => {
    if (!dialerContact && dialerStats) {
      // Session completed
      return (
        <div className="max-w-lg mx-auto text-center space-y-6">
          <div className="rounded-xl bg-white p-8 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500" />
            <h2 className="text-xl font-bold text-neutral-800 mb-2">Session terminée !</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Tous les contacts de cette liste ont été traités.
            </p>

            {/* Final stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {CALL_RESULTS.slice(0, 6).map((r) => {
                const key = r.value === 'no_answer' ? 'noAnswer' : r.value === 'wrong_number' ? 'wrongNumber' : r.value === 'not_interested' ? 'notInterested' : r.value;
                const count = (dialerStats.results as any)[key] || 0;
                return (
                  <div key={r.value} className="rounded-lg bg-neutral-50 p-3">
                    <div className={`text-xl font-bold ${r.textColor}`}>{count}</div>
                    <div className="text-[11px] text-neutral-400">{r.label}</div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => { setView('dashboard'); setDialerContact(null); setDialerStats(null); }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <BarChart3 size={16} />
              Retour au dashboard
            </button>
          </div>
        </div>
      );
    }

    if (!dialerContact) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-brand-500 animate-spin" />
        </div>
      );
    }

    const contactName = [dialerContact.firstName, dialerContact.lastName].filter(Boolean).join(' ') || 'Contact sans nom';

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Progress bar */}
        {dialerStats && (
          <div className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-700">
                Contact {dialerStats.processed + 1} / {dialerStats.total}
              </span>
              <span className="text-sm text-neutral-400">
                {dialerStats.remaining} restant{dialerStats.remaining > 1 ? 's' : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${dialerStats.progressPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            {/* Mini stats */}
            <div className="flex items-center gap-4 mt-2 text-[11px] text-neutral-400">
              <span className="text-emerald-500 font-medium">{dialerStats.results.answered} répondus</span>
              <span>{dialerStats.results.noAnswer} abs.</span>
              <span>{dialerStats.results.voicemail} msg.</span>
              <span className="text-red-400">{dialerStats.results.wrongNumber} err.</span>
            </div>
          </div>
        )}

        {/* Contact card */}
        <motion.div
          key={dialerContact.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl bg-white p-6 shadow-[0_1px_4px_rgba(26,26,46,0.04)]"
        >
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 text-xl font-bold">
              {(dialerContact.firstName?.[0] || dialerContact.lastName?.[0] || '?').toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-neutral-800 mb-1">{contactName}</h2>
              {dialerContact.jobTitle && (
                <p className="text-sm text-neutral-500 flex items-center gap-1.5">
                  <Briefcase size={13} />
                  {dialerContact.jobTitle}
                </p>
              )}
              {dialerContact.company && (
                <p className="text-sm text-neutral-500 flex items-center gap-1.5 mt-0.5">
                  <Building2 size={13} />
                  {dialerContact.company}
                </p>
              )}

              <div className="flex items-center gap-4 mt-3">
                {dialerContact.phone && (
                  <a
                    href={`tel:${dialerContact.phone}`}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <Phone size={14} />
                    {dialerContact.phone}
                  </a>
                )}
                {dialerContact.email && (
                  <span className="flex items-center gap-1.5 text-sm text-neutral-500">
                    <Mail size={14} />
                    {dialerContact.email}
                  </span>
                )}
              </div>
            </div>

            {/* Order */}
            <span className="text-sm text-neutral-300 font-mono">#{dialerContact.orderInList}</span>
          </div>

          {/* Notes */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-neutral-600 mb-1.5">Notes</label>
            <textarea
              value={dialerNotes}
              onChange={(e) => setDialerNotes(e.target.value)}
              placeholder="Notes sur l'appel..."
              rows={3}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-300 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-200 transition-colors resize-none"
            />
          </div>

          {/* Call result buttons */}
          <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-6">
            {CALL_RESULTS.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  onClick={() => {
                    callResultMutation.mutate({
                      contactId: dialerContact.id,
                      callResult: r.value,
                      notes: dialerNotes || undefined,
                    });
                  }}
                  disabled={callResultMutation.isPending}
                  className={`flex flex-col items-center gap-1.5 rounded-xl ${r.color} px-3 py-3 text-white transition-all disabled:opacity-50 active:scale-95`}
                >
                  <Icon size={20} />
                  <span className="text-[11px] font-medium">{r.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  };

  // ─── MAIN RENDER ──────────────────────────────

  const viewTitle: Record<View, string> = {
    dashboard: 'SDR Manager',
    upload: 'Importer une liste',
    'parse-result': 'Résultat de l\'import',
    attribution: 'Attribution des contacts',
    dialer: 'Power Dialer',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8F8FA]">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Crosshair size={20} className="text-brand-500" />
              {viewTitle[view]}
            </span>
          }
          breadcrumbs={[{ label: 'SDR' }]}
          actions={
            view !== 'dashboard' ? (
              <button
                onClick={() => {
                  if (view === 'dialer' && dialerContact) {
                    if (!confirm('Quitter la session d\'appels ? Vous pourrez la reprendre plus tard.')) return;
                  }
                  setView('dashboard');
                  setUploadResult(null);
                  setDialerContact(null);
                  setDialerStats(null);
                }}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 transition-colors"
              >
                <ChevronLeft size={16} />
                Retour
              </button>
            ) : undefined
          }
        />

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'dashboard' && renderDashboard()}
            {view === 'upload' && renderUpload()}
            {view === 'parse-result' && renderParseResult()}
            {view === 'attribution' && renderAttribution()}
            {view === 'dialer' && renderDialer()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ─────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(26,26,46,0.04)]">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xl font-bold text-neutral-800">{value}</div>
          <div className="text-[12px] text-neutral-400">{label}</div>
          {sub && <div className="text-[11px] text-neutral-300">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, total, color }: {
  icon: any; label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg bg-neutral-50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-[12px] text-neutral-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-neutral-800">{value}</span>
        <span className="text-[12px] text-neutral-400">/ {total} ({pct}%)</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    imported: { label: 'Importée', cls: 'bg-blue-50 text-blue-600' },
    in_progress: { label: 'En cours', cls: 'bg-amber-50 text-amber-600' },
    completed: { label: 'Terminée', cls: 'bg-emerald-50 text-emerald-600' },
  };
  const c = cfg[status] || cfg.imported!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function CallResultBadge({ result }: { result: string }) {
  if (result === 'pending') {
    return <span className="text-[11px] text-neutral-300">En attente</span>;
  }
  const cfg = CALL_RESULTS.find((r) => r.value === result);
  if (!cfg) return <span className="text-[11px] text-neutral-400">{result}</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.textColor} bg-opacity-10`}
      style={{ backgroundColor: `color-mix(in srgb, currentColor 10%, transparent)` }}
    >
      <cfg.icon size={10} />
      {cfg.label}
    </span>
  );
}
