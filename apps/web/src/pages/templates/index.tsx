import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Globe, User, Mail, FileText, File, MoreVertical, BookOpen } from 'lucide-react';
import { api } from '../../lib/api-client';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { toast } from '../../components/ui/Toast';

interface Template {
  id: string;
  nom: string;
  type: string;
  sujet: string | null;
  contenu: string;
  variables: string[];
  isGlobal: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: Template[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const typeLabels: Record<string, string> = {
  EMAIL_PRISE_CONTACT: 'Prise de contact',
  EMAIL_RELANCE: 'Relance',
  EMAIL_PRESENTATION_CLIENT: 'Présentation client',
  NOTE_BRIEF_POSTE: 'Brief de poste',
  NOTE_COMPTE_RENDU: 'Compte rendu',
  AUTRE: 'Autre',
};

const typeOptions = [
  { value: 'EMAIL_PRISE_CONTACT', label: 'Email — Prise de contact' },
  { value: 'EMAIL_RELANCE', label: 'Email — Relance' },
  { value: 'EMAIL_PRESENTATION_CLIENT', label: 'Email — Présentation client' },
  { value: 'NOTE_BRIEF_POSTE', label: 'Note — Brief de poste' },
  { value: 'NOTE_COMPTE_RENDU', label: 'Note — Compte rendu' },
  { value: 'AUTRE', label: 'Autre' },
];

function getTypeIcon(type: string) {
  if (type.startsWith('EMAIL_')) return <Mail size={24} className="text-[#7C5CFC]" />;
  if (type.startsWith('NOTE_')) return <FileText size={24} className="text-[#3B82F6]" />;
  return <File size={24} className="text-[#6B7194]" />;
}

function getTypeCategory(type: string): string {
  if (type.startsWith('EMAIL_')) return 'emails';
  if (type.startsWith('NOTE_')) return 'notes';
  return 'autres';
}

const TABS = [
  { id: 'all', label: 'Tous' },
  { id: 'emails', label: 'Emails' },
  { id: 'notes', label: 'Notes' },
  { id: 'autres', label: 'Autres' },
];

const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ nom: '', type: 'EMAIL_PRISE_CONTACT', sujet: '' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['templates', page],
    queryFn: () => api.get<PaginatedResponse>(`/templates?page=${page}&perPage=20`),
  });

  const createMutation = useMutation({
    mutationFn: (body: { nom: string; type: string; sujet: string; contenu: string }) =>
      api.post<Template>('/templates', body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreateModal(false);
      setNewTemplate({ nom: '', type: 'EMAIL_PRISE_CONTACT', sujet: '' });
      toast('success', 'Template créé');
      navigate(`/templates/${created.id}`);
    },
    onError: () => {
      toast('error', 'Erreur lors de la création');
    },
  });

  const handleCreate = () => {
    if (!newTemplate.nom.trim()) {
      toast('warning', 'Le nom est requis');
      return;
    }
    createMutation.mutate({
      nom: newTemplate.nom,
      type: newTemplate.type,
      sujet: newTemplate.sujet,
      contenu: '',
    });
  };

  // Filter by tab category
  const filteredTemplates = data?.data.filter((t) => {
    if (activeTab === 'all') return true;
    return getTypeCategory(t.type) === activeTab;
  }) ?? [];

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-neutral-900">Templates</h1>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Nouveau template
        </Button>
      </div>

      {/* Pill-style tabs */}
      <div className="mb-6 flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-[#7C5CFC] text-white shadow-sm'
                : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : !filteredTemplates.length ? (
        <EmptyState
          title="Aucun template"
          description="Les templates vous permettent de gagner du temps en réutilisant vos emails, notes et messages fréquents."
          actionLabel="Nouveau template"
          onAction={() => setShowCreateModal(true)}
          icon={<BookOpen size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" variants={listStagger} initial="hidden" animate="show">
            {filteredTemplates.map((template) => (
              <motion.div variants={listItem}><div
                key={template.id}
                className="group cursor-pointer rounded-2xl bg-white p-6 shadow-card transition-all duration-200 hover:shadow-card-hover hover:scale-[1.01]"
                onClick={() => navigate(`/templates/${template.id}`)}
              >
                {/* Icon circle */}
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-50">
                  {getTypeIcon(template.type)}
                </div>

                {/* Template name */}
                <h3 className="text-[18px] font-semibold text-neutral-900 truncate">
                  {template.nom}
                </h3>

                {/* Sujet */}
                <p className="mt-1 text-[13px] text-neutral-500 line-clamp-2 min-h-[2.5em]">
                  {template.sujet || 'Pas de sujet'}
                </p>

                {/* Footer: badges + action */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {template.isGlobal ? (
                      <Badge variant="success" size="sm">
                        <span className="flex items-center gap-1">
                          <Globe size={11} />
                          Global
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          Personnel
                        </span>
                      </Badge>
                    )}
                    <Badge variant="info" size="sm">
                      {typeLabels[template.type] || template.type}
                    </Badge>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/templates/${template.id}`);
                    }}
                  >
                    Modifier
                  </Button>
                </div>
              </div></motion.div>
            ))}
          </motion.div>

          {data?.meta && (
            <div className="mt-6 flex justify-center">
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nouveau template"
      >
        <div className="space-y-4">
          <Input
            label="Nom"
            value={newTemplate.nom}
            onChange={(e) => setNewTemplate({ ...newTemplate, nom: e.target.value })}
            placeholder="Nom du template..."
          />
          <Select
            label="Type"
            options={typeOptions}
            value={newTemplate.type}
            onChange={(value) => setNewTemplate({ ...newTemplate, type: value })}
          />
          <Input
            label="Sujet"
            value={newTemplate.sujet}
            onChange={(e) => setNewTemplate({ ...newTemplate, sujet: e.target.value })}
            placeholder="Sujet (optionnel)..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
