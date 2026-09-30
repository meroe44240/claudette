-- Portail client : 6 colonnes (Screening / Case / Culture Fit / Offre / Engagé / Perdu)
-- = ENVOYE_CLIENT, ENTRETIEN_CLIENT, PROCESS, OFFRE, PLACE, REFUSE.
-- Nouveau défaut + mise à jour des mandats restés sur l'ancien défaut.
ALTER TABLE "mandats" ALTER COLUMN "visibleStages"
  SET DEFAULT ARRAY['ENVOYE_CLIENT','ENTRETIEN_CLIENT','PROCESS','OFFRE','PLACE','REFUSE']::"StageCandidature"[];

UPDATE "mandats"
  SET "visibleStages" = ARRAY['ENVOYE_CLIENT','ENTRETIEN_CLIENT','PROCESS','OFFRE','PLACE','REFUSE']::"StageCandidature"[]
  WHERE "visibleStages" = ARRAY['ENVOYE_CLIENT','ENTRETIEN_CLIENT','OFFRE','PLACE']::"StageCandidature"[];
