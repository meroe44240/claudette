-- L'étape PROCESS a été ajoutée à l'enum directement en prod (sans migration).
-- Idempotent : no-op en prod, rattrape les bases neuves (CI, dev).
ALTER TYPE "StageCandidature" ADD VALUE IF NOT EXISTS 'PROCESS' BEFORE 'OFFRE';
