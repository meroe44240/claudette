import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Bouton « Retour » des fiches : revient à la page d'où l'on vient (mandat,
 * pipeline, recherche…). Si la fiche a été ouverte directement (lien, nouvel
 * onglet), il n'y a pas d'historique dans l'app : on va à la liste `fallback`.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = location.key !== 'default';
  const goBack = useCallback(() => {
    if (hasHistory) navigate(-1);
    else navigate(fallback);
  }, [hasHistory, navigate, fallback]);
  return { goBack, hasHistory };
}
