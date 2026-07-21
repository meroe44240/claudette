-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute `visibleStages` sur mandats : liste des StageCandidature visibles
-- côté client (via le portail à venir + bouton "Aperçu client" du kanban).
--
-- Défaut : ENVOYE_CLIENT, ENTRETIEN_CLIENT, OFFRE, PLACE
-- (le client voit les étapes où il a du contexte concret, pas SOURCING/CONTACTE).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "mandats"
  ADD COLUMN "visibleStages" "StageCandidature"[] NOT NULL
  DEFAULT ARRAY['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE']::"StageCandidature"[];
