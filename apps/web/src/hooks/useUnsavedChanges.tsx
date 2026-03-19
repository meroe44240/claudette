import { useEffect } from 'react';

export function useUnsavedChanges(isDirty: boolean) {
  // Browser close / tab close / external navigation warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Note: in-app navigation blocking (useBlocker) requires createBrowserRouter (data router).
  // Since the app uses <BrowserRouter>, useBlocker is not available.
  // The beforeunload handler above still protects against accidental tab/browser closes.

  return { unsavedChangesModal: null };
}
