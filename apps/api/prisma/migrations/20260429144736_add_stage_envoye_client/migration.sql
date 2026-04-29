-- AlterEnum
-- "Envoyé au client en attente de retour" — between ENTRETIEN_1 and ENTRETIEN_CLIENT
-- in the kanban (UI controls position; enum values are unordered).
ALTER TYPE "StageCandidature" ADD VALUE IF NOT EXISTS 'ENVOYE_CLIENT';
