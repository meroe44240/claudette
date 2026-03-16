import { useEffect } from 'react';

/**
 * Sets document.title based on current page.
 * Usage: usePageTitle('Candidats') → "Candidats | HumanUp"
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | HumanUp` : 'HumanUp ATS';
    return () => { document.title = prev; };
  }, [title]);
}
