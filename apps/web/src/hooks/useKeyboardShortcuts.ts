import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const shortcuts: ShortcutConfig[] = [
    { key: 'd', description: 'Dashboard', action: () => navigate('/') },
    { key: 'c', description: 'Candidats', action: () => navigate('/candidats') },
    { key: 'm', description: 'Mandats', action: () => navigate('/mandats') },
    { key: 't', description: 'Tâches', action: () => navigate('/taches') },
    { key: 'e', description: 'Entreprises', action: () => navigate('/entreprises') },
    { key: 'k', description: 'Clients', action: () => navigate('/clients') },
    { key: 'a', description: 'Activités', action: () => navigate('/activites') },
    { key: 's', description: 'Statistiques', action: () => navigate('/stats') },
    { key: 'n', ctrl: true, description: 'Nouveau candidat', action: () => navigate('/candidats/new') },
    { key: '/', description: 'Aide raccourcis', action: () => setShowHelp(prev => !prev) },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if typing in an input, textarea, or contenteditable
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if ((e.target as HTMLElement).isContentEditable) return;

    for (const shortcut of shortcuts) {
      if (shortcut.ctrl && !e.ctrlKey && !e.metaKey) continue;
      if (!shortcut.ctrl && (e.ctrlKey || e.metaKey)) continue;
      if (e.key.toLowerCase() === shortcut.key.toLowerCase()) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp, shortcuts };
}

/** @deprecated Use useKeyboardShortcuts instead */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Don't trigger with modifiers (except for Ctrl+K which is already handled)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case 'c':
          e.preventDefault();
          navigate('/candidats/new');
          break;
        case 't':
          e.preventDefault();
          navigate('/taches');
          break;
        case 'd':
          e.preventDefault();
          navigate('/');
          break;
        case 'm':
          e.preventDefault();
          navigate('/mandats');
          break;
        case '?':
          // Show shortcuts help (dispatch custom event)
          window.dispatchEvent(new CustomEvent('show-shortcuts'));
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}
