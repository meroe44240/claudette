import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Eye, EyeOff, Globe, User, Code } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
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
  updatedAt: string;
}

const typeOptions = [
  { value: 'EMAIL_PRISE_CONTACT', label: 'Email — Prise de contact' },
  { value: 'EMAIL_RELANCE', label: 'Email — Relance' },
  { value: 'EMAIL_PRESENTATION_CLIENT', label: 'Email — Présentation client' },
  { value: 'NOTE_BRIEF_POSTE', label: 'Note — Brief de poste' },
  { value: 'NOTE_COMPTE_RENDU', label: 'Note — Compte rendu' },
  { value: 'AUTRE', label: 'Autre' },
];

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nom, setNom] = useState('');
  const [type, setType] = useState('EMAIL_PRISE_CONTACT');
  const [sujet, setSujet] = useState('');
  const [contenu, setContenu] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const { data: template, isLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: () => api.get<Template>(`/templates/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (template) {
      setNom(template.nom);
      setType(template.type);
      setSujet(template.sujet || '');
      setContenu(template.contenu);
      setIsGlobal(template.isGlobal);
    }
  }, [template]);

  const detectedVariables = useMemo(() => {
    const regex = /\{\{(\w+)\}\}/g;
    const vars = new Set<string>();
    let match;
    const combinedText = `${sujet} ${contenu}`;
    while ((match = regex.exec(combinedText)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }, [sujet, contenu]);

  const renderedPreview = useMemo(() => {
    let preview = contenu;
    for (const [key, value] of Object.entries(variableValues)) {
      preview = preview.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value || `{{${key}}}`,
      );
    }
    return preview;
  }, [contenu, variableValues]);

  const renderedSujet = useMemo(() => {
    let preview = sujet;
    for (const [key, value] of Object.entries(variableValues)) {
      preview = preview.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value || `{{${key}}}`,
      );
    }
    return preview;
  }, [sujet, variableValues]);

  const saveMutation = useMutation({
    mutationFn: (body: { nom: string; type: string; sujet: string; contenu: string; isGlobal: boolean }) =>
      api.put<Template>(`/templates/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', id] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast('success', 'Template sauvegardé');
    },
    onError: () => {
      toast('error', 'Erreur lors de la sauvegarde');
    },
  });

  const handleSave = () => {
    if (!nom.trim()) {
      toast('warning', 'Le nom est requis');
      return;
    }
    saveMutation.mutate({ nom, type, sujet, contenu, isGlobal });
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div>
        <PageHeader
          title="Template introuvable"
          breadcrumbs={[
            { label: 'Templates', href: '/templates' },
            { label: 'Introuvable' },
          ]}
        />
        <p className="text-text-secondary">Ce template n'existe pas ou a été supprimé.</p>
        <Button variant="secondary" onClick={() => navigate('/templates')} className="mt-4">
          <ArrowLeft size={16} /> Retour aux templates
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={template.nom}
        breadcrumbs={[
          { label: 'Templates', href: '/templates' },
          { label: template.nom },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
              {showPreview ? 'Masquer' : 'Aperçu'}
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={16} />
              {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        }
      />

      <div className={`grid gap-6 ${showPreview ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Edit form */}
        <div className="space-y-6">
          <Card>
            <div className="space-y-4">
              <Input
                label="Nom du template"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom du template..."
              />

              <Select
                label="Type"
                options={typeOptions}
                value={type}
                onChange={setType}
              />

              <Input
                label="Sujet"
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder="Sujet du message..."
              />

              <Textarea
                label="Contenu"
                value={contenu}
                onChange={(e) => setContenu(e.target.value)}
                placeholder="Contenu du template... Utilisez {{variable}} pour insérer des variables."
                rows={12}
              />

              {/* Global toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  {isGlobal ? (
                    <Globe size={20} className="text-success" />
                  ) : (
                    <User size={20} className="text-text-tertiary" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {isGlobal ? 'Template global' : 'Template personnel'}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {isGlobal
                        ? 'Visible par tous les utilisateurs'
                        : 'Visible uniquement par vous'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGlobal(!isGlobal)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isGlobal ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isGlobal ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>

          {/* Variables section */}
          {detectedVariables.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Code size={16} className="text-text-secondary" />
                <h3 className="text-sm font-medium text-text-primary">
                  Variables détectées
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {detectedVariables.map((v) => (
                  <Badge key={v} variant="info">
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="space-y-6">
            {/* Variable values for preview */}
            {detectedVariables.length > 0 && (
              <Card>
                <h3 className="mb-3 text-sm font-medium text-text-primary">
                  Valeurs de prévisualisation
                </h3>
                <div className="space-y-3">
                  {detectedVariables.map((v) => (
                    <Input
                      key={v}
                      label={v}
                      value={variableValues[v] || ''}
                      onChange={(e) =>
                        setVariableValues({ ...variableValues, [v]: e.target.value })
                      }
                      placeholder={`Valeur pour {{${v}}}...`}
                    />
                  ))}
                </div>
              </Card>
            )}

            {/* Rendered preview */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                Aperçu du rendu
              </h3>
              {renderedSujet && (
                <div className="mb-4 rounded-md bg-bg-secondary p-3">
                  <p className="text-xs font-medium text-text-tertiary mb-1">Sujet</p>
                  <p className="text-sm text-text-primary">{renderedSujet}</p>
                </div>
              )}
              <div className="rounded-md border border-border bg-bg p-4">
                <pre className="whitespace-pre-wrap text-sm text-text-primary font-sans leading-relaxed">
                  {renderedPreview || (
                    <span className="text-text-tertiary italic">
                      Le contenu apparaîtra ici...
                    </span>
                  )}
                </pre>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
