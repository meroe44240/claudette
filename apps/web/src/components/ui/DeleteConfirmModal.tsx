import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './Button';
import { useEffect, useCallback } from 'react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityName: string;
  isLoading?: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  isLoading = false,
}: DeleteConfirmModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    },
    [onClose, isLoading],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="fixed inset-0 bg-[rgba(26,26,46,0.4)] backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !isLoading && onClose()}
          />
          <motion.div
            className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_24px_64px_rgba(26,26,46,0.18)]"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-text-primary">
                Supprimer {entityName} ?
              </h2>
              <p className="mb-6 text-sm text-text-secondary">
                Cette action est irr&eacute;versible. Toutes les donn&eacute;es associ&eacute;es seront supprim&eacute;es.
              </p>
              <div className="flex w-full items-center justify-center gap-3">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  onClick={onConfirm}
                  loading={isLoading}
                  disabled={isLoading}
                  className="!bg-red-500 !text-white hover:!bg-red-600"
                >
                  Supprimer
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
