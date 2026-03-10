import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  Image,
  File,
  Trash2,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';

// ── Types ──────────────────────────────────────────

interface DocumentUploadProps {
  entityType: 'candidat' | 'client' | 'entreprise' | 'mandat';
  entityId: string;
}

interface DocumentMeta {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  entityType: string;
  entityId: string;
  createdAt: string;
}

interface UploadProgress {
  file: File;
  progress: number; // 0-100
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// ── Constants ──────────────────────────────────────

const API_BASE = '/api/v1';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Helpers ────────────────────────────────────────

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Type de fichier non accepté. Acceptés: PDF, DOC, DOCX, PNG, JPG`;
    }
  }
  if (file.size > MAX_SIZE) {
    return `Fichier trop volumineux (${formatFileSize(file.size)}). Max: 10 Mo`;
  }
  return null;
}

async function uploadFile(file: File, entityType: string, entityId: string): Promise<DocumentMeta> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', entityType);
  formData.append('entityId', entityId);

  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Erreur lors du téléversement');
  }

  return response.json();
}

async function fetchDocuments(entityType: string, entityId: string): Promise<DocumentMeta[]> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const params = new URLSearchParams({ entityType, entityId });
  const response = await fetch(`${API_BASE}/documents?${params}`, {
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Erreur lors du chargement des documents');
  }

  return response.json();
}

async function deleteDocument(id: string, entityType: string, entityId: string): Promise<void> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const params = new URLSearchParams({ entityType, entityId });
  const response = await fetch(`${API_BASE}/documents/${id}?${params}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Erreur lors de la suppression');
  }
}

// ── Component ──────────────────────────────────────

export default function DocumentUpload({ entityType, entityId }: DocumentUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  // Fetch existing documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => fetchDocuments(entityType, entityId),
    enabled: !!entityId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId, entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] });
      toast('success', 'Document supprimé');
    },
    onError: () => {
      toast('error', 'Erreur lors de la suppression du document');
    },
  });

  // Upload handler
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // Validate
      const error = validateFile(file);
      if (error) {
        toast('error', error);
        continue;
      }

      // Add to upload list
      const uploadEntry: UploadProgress = {
        file,
        progress: 0,
        status: 'uploading',
      };

      setUploads((prev) => [...prev, uploadEntry]);

      try {
        // Simulate progress (we don't have XHR progress with fetch)
        const progressInterval = setInterval(() => {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file && u.status === 'uploading'
                ? { ...u, progress: Math.min(u.progress + 15, 90) }
                : u,
            ),
          );
        }, 200);

        await uploadFile(file, entityType, entityId);

        clearInterval(progressInterval);

        // Mark as success
        setUploads((prev) =>
          prev.map((u) =>
            u.file === file ? { ...u, progress: 100, status: 'success' } : u,
          ),
        );

        // Remove from upload list after a short delay
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.file !== file));
        }, 2000);

        // Refresh document list
        queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] });
        toast('success', `${file.name} téléversé avec succès`);
      } catch (err: any) {
        setUploads((prev) =>
          prev.map((u) =>
            u.file === file
              ? { ...u, status: 'error', error: err.message || 'Erreur' }
              : u,
          ),
        );

        // Remove error entry after delay
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.file !== file));
        }, 5000);

        toast('error', `Erreur: ${err.message || 'Téléversement échoué'}`);
      }
    }
  }, [entityType, entityId, queryClient]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
      // Reset the input so the same file can be uploaded again
      e.target.value = '';
    }
  }, [handleUpload]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
          isDragOver
            ? 'border-primary-400 bg-primary-50/50 scale-[1.01]'
            : 'border-neutral-200 bg-neutral-50/50 hover:border-primary-300 hover:bg-primary-50/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200 ${
              isDragOver ? 'bg-primary-100 text-primary-500' : 'bg-neutral-100 text-neutral-400'
            }`}
          >
            <Upload size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700">
              {isDragOver ? 'Déposez vos fichiers ici' : 'Glissez-déposez vos fichiers ici'}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              ou <span className="text-primary-500 underline">parcourir</span> {'\u2022'} PDF, DOC, DOCX, PNG, JPG {'\u2022'} Max 10 Mo
            </p>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {uploads.map((upload, idx) => (
              <motion.div
                key={`${upload.file.name}-${idx}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white p-3"
              >
                {upload.status === 'uploading' && (
                  <Loader2 size={16} className="shrink-0 animate-spin text-primary-500" />
                )}
                {upload.status === 'success' && (
                  <CheckCircle size={16} className="shrink-0 text-green-500" />
                )}
                {upload.status === 'error' && (
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-700 truncate">{upload.file.name}</p>
                  {upload.status === 'uploading' && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <motion.div
                        className="h-full rounded-full bg-primary-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${upload.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                  {upload.status === 'error' && upload.error && (
                    <p className="mt-0.5 text-xs text-red-500">{upload.error}</p>
                  )}
                </div>

                <button
                  onClick={() => setUploads((prev) => prev.filter((u) => u.file !== upload.file))}
                  className="shrink-0 rounded p-1 text-neutral-300 hover:text-neutral-500"
                >
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-neutral-300" />
        </div>
      ) : documents.length === 0 ? (
        <div className="py-4 text-center text-sm text-neutral-400">
          Aucun document
        </div>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => {
            const Icon = getFileIcon(doc.mimeType);

            return (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="group flex items-center gap-3 rounded-xl border border-neutral-100 bg-white p-3 transition-all duration-150 hover:shadow-sm"
              >
                {/* File icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-50 text-neutral-400">
                  <Icon size={18} />
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800 truncate">
                    {doc.originalName}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {formatFileSize(doc.size)} {'\u2022'} {formatDate(doc.createdAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {/* Download link */}
                  <a
                    href={doc.url}
                    download={doc.originalName}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                    title="Télécharger"
                  >
                    <Download size={15} />
                  </a>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(doc.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
