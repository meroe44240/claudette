import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import Skeleton from '../../components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityType = 'candidats' | 'clients' | 'entreprises' | 'mandats';

interface UploadResponse {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  autoMapping: Record<string, string>;
}

interface PreviewResponse {
  preview: Record<string, string>[];
  duplicates: number[];
}

interface ExecuteResponse {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// ---------------------------------------------------------------------------
// Field mapping options per entity type
// ---------------------------------------------------------------------------

const fieldOptions: Record<string, { value: string; label: string }[]> = {
  candidats: [
    { value: '', label: '— Ignorer —' },
    { value: 'nom', label: 'Nom' },
    { value: 'prenom', label: 'Prénom' },
    { value: 'email', label: 'Email' },
    { value: 'telephone', label: 'Téléphone' },
    { value: 'posteActuel', label: 'Poste actuel' },
    { value: 'entrepriseActuelle', label: 'Entreprise actuelle' },
    { value: 'localisation', label: 'Localisation' },
    { value: 'salaireActuel', label: 'Salaire actuel' },
    { value: 'salaireSouhaite', label: 'Salaire souhaité' },
    { value: 'linkedinUrl', label: 'LinkedIn' },
    { value: 'source', label: 'Source' },
    { value: 'notes', label: 'Notes' },
  ],
  clients: [
    { value: '', label: '— Ignorer —' },
    { value: 'nom', label: 'Nom' },
    { value: 'prenom', label: 'Prénom' },
    { value: 'email', label: 'Email' },
    { value: 'telephone', label: 'Téléphone' },
    { value: 'poste', label: 'Poste' },
    { value: 'roleContact', label: 'Rôle contact' },
    { value: 'entrepriseId', label: 'Entreprise (ID)' },
    { value: 'linkedinUrl', label: 'LinkedIn' },
    { value: 'notes', label: 'Notes' },
  ],
  entreprises: [
    { value: '', label: '— Ignorer —' },
    { value: 'nom', label: 'Nom' },
    { value: 'secteur', label: 'Secteur' },
    { value: 'siteWeb', label: 'Site web' },
    { value: 'taille', label: 'Taille' },
    { value: 'localisation', label: 'Localisation' },
    { value: 'linkedinUrl', label: 'LinkedIn' },
    { value: 'notes', label: 'Notes' },
  ],
  mandats: [
    { value: '', label: '— Ignorer —' },
    { value: 'titrePoste', label: 'Titre du poste' },
    { value: 'entrepriseId', label: 'Entreprise (ID)' },
    { value: 'clientId', label: 'Client (ID)' },
    { value: 'description', label: 'Description' },
    { value: 'localisation', label: 'Localisation' },
    { value: 'salaireMin', label: 'Salaire min' },
    { value: 'salaireMax', label: 'Salaire max' },
    { value: 'notes', label: 'Notes' },
  ],
};

const entityOptions: { value: EntityType; label: string }[] = [
  { value: 'candidats', label: 'Candidats' },
  { value: 'clients', label: 'Clients' },
  { value: 'entreprises', label: 'Entreprises' },
  { value: 'mandats', label: 'Mandats' },
];

const entityRoutes: Record<EntityType, string> = {
  candidats: '/candidats',
  clients: '/clients',
  entreprises: '/entreprises',
  mandats: '/mandats',
};

const entityLabels: Record<EntityType, string> = {
  candidats: 'candidats',
  clients: 'clients',
  entreprises: 'entreprises',
  mandats: 'mandats',
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const steps = [
  { num: 1, label: 'Upload' },
  { num: 2, label: 'Mapping' },
  { num: 3, label: 'Prévisualisation' },
  { num: 4, label: 'Résultat' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center">
          {/* Circle */}
          <div className="flex flex-col items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step.num < current
                  ? 'bg-primary-500 text-white'
                  : step.num === current
                    ? 'bg-primary-500 text-white ring-4 ring-primary-500/20'
                    : 'bg-neutral-100 text-neutral-300'
              }`}
            >
              {step.num < current ? <Check size={16} /> : step.num}
            </div>
            <span
              className={`mt-1.5 text-xs font-medium ${
                step.num <= current ? 'text-primary-500' : 'text-neutral-300'
              }`}
            >
              {step.label}
            </span>
          </div>
          {/* Connector line */}
          {idx < steps.length - 1 && (
            <div
              className={`mx-2 h-0.5 w-16 rounded sm:w-24 ${
                step.num < current ? 'bg-primary-500' : 'bg-neutral-100'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const navigate = useNavigate();

  // Wizard state
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [entityType, setEntityType] = useState<EntityType>('candidats');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state (from upload response)
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Step 3 state (from preview response)
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [duplicates, setDuplicates] = useState<number[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Step 4 state (from execute response)
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // ---- Drag & drop handlers ----

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      validateAndSetFile(selected);
    }
  };

  const validateAndSetFile = (f: File) => {
    const validTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(f.type) && ext !== 'csv' && ext !== 'xlsx') {
      toast('error', 'Format non supporté. Veuillez sélectionner un fichier .csv ou .xlsx');
      return;
    }
    setFile(f);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ---- Step 1: Upload ----

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `/api/v1/import/upload?entityType=${entityType}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Erreur lors de l’envoi du fichier');
      }
      const data: UploadResponse = await res.json();
      setHeaders(data.headers);
      setRows(data.rows);
      setMapping(data.autoMapping || {});
      toast('success', `${data.rowCount} lignes détectées`);
      setStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l’envoi du fichier';
      toast('error', message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Step 2: Preview ----

  const handlePreview = async () => {
    setLoading(true);
    try {
      const data = await api.post<PreviewResponse>('/import/preview', {
        rows,
        mapping,
        entityType,
      });
      setPreview(data.preview);
      setDuplicates(data.duplicates);
      setStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la prévisualisation';
      toast('error', message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Step 3: Execute ----

  const handleExecute = async () => {
    setLoading(true);
    try {
      const data = await api.post<ExecuteResponse>('/import/execute', {
        rows,
        mapping,
        entityType,
        skipDuplicates,
      });
      setResult(data);
      setStep(4);
      toast('success', `Import terminé : ${data.imported} enregistrement(s) importé(s)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l’import';
      toast('error', message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Reset ----

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setEntityType('candidats');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview([]);
    setDuplicates([]);
    setSkipDuplicates(true);
    setResult(null);
    setErrorsExpanded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ---- Mapping helpers ----

  const updateMapping = (csvHeader: string, atsField: string) => {
    setMapping((prev) => ({ ...prev, [csvHeader]: atsField }));
  };

  const mappedCount = headers.filter((h) => mapping[h]).length;
  const unmappedCount = headers.length - mappedCount;

  // ---- Compute mapped column headers for preview ----

  const mappedFields = Object.entries(mapping).filter(([, v]) => v);
  const allFieldLabels: Record<string, string> = {};
  Object.values(fieldOptions).forEach((opts) => {
    opts.forEach((o) => {
      if (o.value) allFieldLabels[o.value] = o.label;
    });
  });

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div>
      <PageHeader
        title="Import"
        subtitle="Importez des données depuis un fichier CSV ou Excel"
        breadcrumbs={[
          { label: 'Tableau de bord', href: '/' },
          { label: 'Import' },
        ]}
      />

      <StepIndicator current={step} />

      {/* ------------------------------------------------------------------ */}
      {/* STEP 1 — Upload                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <Card>
          <div className="mx-auto max-w-xl space-y-6">
            {/* Entity type selection */}
            <Select
              label="Type de données à importer"
              options={entityOptions}
              value={entityType}
              onChange={(v) => setEntityType(v as EntityType)}
            />

            {/* Dropzone */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Fichier (.csv ou .xlsx)
              </label>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-[200px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
                  dragActive
                    ? 'border-primary-500 bg-primary-50 animate-pulse'
                    : 'border-neutral-300 bg-neutral-50 hover:border-primary-300 hover:bg-primary-50'
                }`}
              >
                <Upload
                  size={48}
                  className={`mb-3 ${dragActive ? 'text-primary-500' : 'text-neutral-300'}`}
                />
                <p className="text-[15px] text-neutral-500">
                  Glissez un fichier ici ou cliquez pour sélectionner
                </p>
                <p className="mt-1.5 text-[11px] text-neutral-300">
                  CSV, XLSX — max 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* File info */}
            {file && (
              <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                <FileSpreadsheet size={20} className="text-primary-500" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {file.name}
                  </p>
                  <p className="text-xs text-neutral-300">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  className="rounded-lg p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Upload button */}
            <div className="flex justify-end">
              <Button onClick={handleUpload} disabled={!file || loading}>
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Envoyer le fichier
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 2 — Column mapping                                            */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && (
        <Card>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-10 w-full" count={5} />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-neutral-900">
                    Correspondance des colonnes
                  </h2>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    Associez chaque colonne de votre fichier à un champ de l&apos;ATS.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={mappedCount > 0 ? 'success' : 'default'}>
                    {mappedCount} mappé(s)
                  </Badge>
                  {unmappedCount > 0 && (
                    <Badge variant="warning">{unmappedCount} ignoré(s)</Badge>
                  )}
                </div>
              </div>

              {/* Mapping rows */}
              <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-2 gap-4 bg-neutral-50 px-4 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Colonne du fichier
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Champ ATS
                  </span>
                </div>
                {headers.map((header) => (
                  <div
                    key={header}
                    className="grid grid-cols-2 items-center gap-4 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {!mapping[header] && (
                        <AlertTriangle
                          size={14}
                          className="shrink-0 text-warning"
                        />
                      )}
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {header}
                      </span>
                    </div>
                    <Select
                      options={fieldOptions[entityType]}
                      value={mapping[header] || ''}
                      onChange={(v) => updateMapping(header, v)}
                      placeholder="— Ignorer —"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} />
                  Retour
                </Button>
                <Button onClick={handlePreview} disabled={mappedCount === 0 || loading}>
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      Prévisualiser
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 3 — Preview                                                   */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && (
        <Card padding={false}>
          {loading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-10 w-full" count={6} />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-6 pt-6 pb-4">
                <span className="text-[13px] text-neutral-500">
                  <strong className="text-neutral-900">{preview.length}</strong>{' '}
                  ligne(s) à importer
                </span>
                {duplicates.length > 0 && (
                  <Badge variant="warning">
                    {duplicates.length} doublon(s) détecté(s)
                  </Badge>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        #
                      </th>
                      {mappedFields.map(([, field]) => (
                        <th
                          key={field}
                          className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
                        >
                          {allFieldLabels[field] || field}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Statut
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, idx) => {
                      const isDuplicate = duplicates.includes(idx);
                      return (
                        <tr
                          key={idx}
                          className={`border-b border-neutral-100 last:border-0 ${
                            isDuplicate ? 'bg-warning-100' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-neutral-300">{idx + 1}</td>
                          {mappedFields.map(([, field]) => (
                            <td key={field} className="px-4 py-3 text-neutral-900">
                              {row[field] || '—'}
                            </td>
                          ))}
                          <td className="px-4 py-3">
                            {isDuplicate ? (
                              <Badge variant="warning">Doublon</Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Skip duplicates checkbox + actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 px-6 pt-4 pb-6">
                <label className="flex items-center gap-2 text-sm text-neutral-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                  />
                  Ignorer les doublons
                </label>
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    <ArrowLeft size={16} />
                    Retour
                  </Button>
                  <Button onClick={handleExecute} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        Importer
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 4 — Result                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 4 && result && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="flex flex-col items-center py-2">
                <span className="text-3xl font-bold text-success">{result.imported}</span>
                <span className="mt-1 text-[13px] text-neutral-500">Importé(s)</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center py-2">
                <span className="text-3xl font-bold text-warning">{result.skipped}</span>
                <span className="mt-1 text-[13px] text-neutral-500">Ignoré(s)</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col items-center py-2">
                <span className="text-3xl font-bold text-error">{result.errors.length}</span>
                <span className="mt-1 text-[13px] text-neutral-500">Erreur(s)</span>
              </div>
            </Card>
          </div>

          {/* Error details */}
          {result.errors.length > 0 && (
            <Card>
              <button
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-error" />
                  <span className="text-sm font-medium text-neutral-900">
                    {result.errors.length} erreur(s) lors de l&apos;import
                  </span>
                </div>
                {errorsExpanded ? (
                  <ChevronUp size={16} className="text-neutral-300" />
                ) : (
                  <ChevronDown size={16} className="text-neutral-300" />
                )}
              </button>
              {errorsExpanded && (
                <div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-3 px-4 py-3">
                      <Badge variant="error">Ligne {err.row}</Badge>
                      <span className="text-sm text-neutral-500">{err.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="secondary" onClick={handleReset}>
              Nouvel import
            </Button>
            <Button onClick={() => navigate(entityRoutes[entityType])}>
              Voir les {entityLabels[entityType]}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
