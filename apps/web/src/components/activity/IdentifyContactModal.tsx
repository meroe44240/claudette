import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, User, Building2, Phone, Loader2, Check, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api-client';
import Modal from '../ui/Modal';
import { toast } from '../ui/Toast';

interface ContactResult {
  id: string;
  type: 'CANDIDAT' | 'CLIENT';
  nom: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  entreprise?: string | null;
  poste?: string | null;
}

interface IdentifyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  activiteId: string;
  phoneNumber: string;
}

export default function IdentifyContactModal({
  isOpen,
  onClose,
  activiteId,
  phoneNumber,
}: IdentifyContactModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ContactResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'CANDIDAT' | 'CLIENT'>('all');

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [candidats, clients] = await Promise.all([
          api.get<any>(`/candidats?search=${encodeURIComponent(searchQuery)}&perPage=10`),
          api.get<any>(`/clients?search=${encodeURIComponent(searchQuery)}&perPage=10`),
        ]);

        const mapped: ContactResult[] = [
          ...(candidats.data || []).map((c: any) => ({
            id: c.id,
            type: 'CANDIDAT' as const,
            nom: c.nom,
            prenom: c.prenom,
            telephone: c.telephone,
            email: c.email,
            entreprise: c.entrepriseActuelle,
            poste: c.posteActuel,
          })),
          ...(clients.data || []).map((c: any) => ({
            id: c.id,
            type: 'CLIENT' as const,
            nom: c.nom,
            prenom: c.prenom,
            telephone: c.telephone,
            email: c.email,
            entreprise: c.entreprise?.nom,
            poste: c.poste,
          })),
        ];

        setResults(mapped);
      } catch {
        toast('error', 'Erreur lors de la recherche');
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setResults([]);
      setActiveTab('all');
    }
  }, [isOpen]);

  // Identify mutation
  const identifyMutation = useMutation({
    mutationFn: (contact: ContactResult) =>
      api.post(`/activites/${activiteId}/identifier-contact`, {
        entiteType: contact.type,
        entiteId: contact.id,
      }),
    onSuccess: (_, contact) => {
      const name = `${contact.prenom ?? ''} ${contact.nom}`.trim();
      toast('success', `Appel rattaché à ${name}`);
      queryClient.invalidateQueries({ queryKey: ['activites'] });
      onClose();
    },
    onError: () => {
      toast('error', 'Erreur lors de l\'identification');
    },
  });

  const filteredResults = activeTab === 'all'
    ? results
    : results.filter(r => r.type === activeTab);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Identifier le contact" size="md">
      <div className="space-y-4">
        {/* Phone number display */}
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3">
          <Phone size={18} className="text-amber-600" />
          <div>
            <p className="text-[13px] font-medium text-amber-800">Numéro à identifier</p>
            <p className="text-[15px] font-semibold text-amber-900">{phoneNumber}</p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, prénom, email, téléphone..."
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-4 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
          />
          {searching && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 animate-spin" />
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {[
            { id: 'all' as const, label: 'Tous' },
            { id: 'CANDIDAT' as const, label: 'Candidats' },
            { id: 'CLIENT' as const, label: 'Clients' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#7C5CFC] text-white'
                  : 'text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {tab.label}
              {tab.id !== 'all' && (
                <span className="ml-1 text-[11px] opacity-70">
                  ({results.filter(r => r.type === tab.id).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredResults.length === 0 && searchQuery.trim().length >= 2 && !searching ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl bg-neutral-50 px-4 py-6 text-center"
              >
                <p className="text-[13px] text-neutral-500">Aucun contact trouvé</p>
                <p className="text-[12px] text-neutral-400 mt-1">
                  Essayez avec un autre nom ou créez d'abord la fiche dans le CRM
                </p>
              </motion.div>
            ) : (
              filteredResults.map((contact) => {
                const fullName = `${contact.prenom ?? ''} ${contact.nom}`.trim();
                const isCandidat = contact.type === 'CANDIDAT';

                return (
                  <motion.button
                    key={`${contact.type}-${contact.id}`}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    onClick={() => identifyMutation.mutate(contact)}
                    disabled={identifyMutation.isPending}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-neutral-50 transition-colors text-left group border border-transparent hover:border-neutral-200"
                  >
                    {/* Avatar */}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                      isCandidat ? 'bg-blue-50' : 'bg-emerald-50'
                    }`}>
                      {isCandidat ? (
                        <User size={18} className="text-blue-500" />
                      ) : (
                        <Building2 size={18} className="text-emerald-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-neutral-900 truncate">
                          {fullName}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isCandidat
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {isCandidat ? 'Candidat' : 'Client'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {contact.entreprise && (
                          <span className="text-[12px] text-neutral-500 truncate">{contact.entreprise}</span>
                        )}
                        {contact.poste && (
                          <span className="text-[12px] text-neutral-400 truncate">{contact.poste}</span>
                        )}
                        {contact.telephone && (
                          <span className="text-[12px] text-neutral-400 flex items-center gap-1">
                            <Phone size={10} /> {contact.telephone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {identifyMutation.isPending ? (
                        <Loader2 size={16} className="text-brand-500 animate-spin" />
                      ) : (
                        <div className="flex items-center gap-1 text-[12px] font-medium text-brand-500">
                          <UserPlus size={14} />
                          Attribuer
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })
            )}
          </AnimatePresence>

          {searchQuery.trim().length < 2 && (
            <div className="rounded-xl bg-neutral-50 px-4 py-6 text-center">
              <Search size={24} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-[13px] text-neutral-500">
                Tapez au moins 2 caractères pour rechercher
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
