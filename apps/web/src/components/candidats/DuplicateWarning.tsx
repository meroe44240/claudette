import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';

interface DuplicateCandidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  linkedinUrl: string | null;
}

interface DuplicateWarningProps {
  email?: string;
  linkedinUrl?: string;
  excludeId?: string;
}

export default function DuplicateWarning({ email, linkedinUrl, excludeId }: DuplicateWarningProps) {
  const [duplicates, setDuplicates] = useState<DuplicateCandidat[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!email && !linkedinUrl) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.post<{ duplicates: DuplicateCandidat[] }>('/candidats/check-duplicate', {
          email: email || undefined,
          linkedinUrl: linkedinUrl || undefined,
          excludeId,
        });
        setDuplicates(res.duplicates || []);
        setDismissed(false);
      } catch {
        setDuplicates([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [email, linkedinUrl, excludeId]);

  if (dismissed || duplicates.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {duplicates.length === 1 ? 'Doublon potentiel détecté' : `${duplicates.length} doublons potentiels détectés`}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Un candidat avec les mêmes informations existe déjà :
            </p>
            <div className="mt-2 space-y-1.5">
              {duplicates.map((d) => (
                <Link
                  key={d.id}
                  to={`/candidats/${d.id}`}
                  className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 hover:underline"
                >
                  <ExternalLink size={12} />
                  <span className="font-medium">{d.prenom ? `${d.prenom} ${d.nom}` : d.nom}</span>
                  {d.email && <span className="text-xs text-amber-500">({d.email})</span>}
                </Link>
              ))}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
