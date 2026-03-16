import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

export function useUnsavedChanges(isDirty: boolean) {
  // Browser close / external navigation
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // In-app navigation blocking
  const blocker = useBlocker(isDirty);

  const handleStay = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset?.();
    }
  }, [blocker]);

  const handleLeave = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.proceed?.();
    }
  }, [blocker]);

  const unsavedChangesModal = blocker.state === 'blocked' ? (
    <Modal
      isOpen={true}
      onClose={handleStay}
      title="Modifications non enregistrées"
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Voulez-vous quitter cette page ? Les modifications non enregistrées seront perdues.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleStay}>
            Rester
          </Button>
          <Button variant="danger" onClick={handleLeave}>
            Quitter
          </Button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { unsavedChangesModal };
}
