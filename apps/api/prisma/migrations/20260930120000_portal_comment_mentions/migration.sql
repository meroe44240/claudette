-- Mentions (@) dans les commentaires du portail client.
ALTER TABLE "portal_comments" ADD COLUMN IF NOT EXISTS "mentions" JSONB NOT NULL DEFAULT '[]';

-- Nom du contact invité, affiché à la place de son email dans le portail.
ALTER TABLE "portal_accesses" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255);

-- Colonne du portail client (Inbox, Screening, Case, Culture Fit…) : distingue
-- Case et Culture Fit, qui correspondent tous deux à l'étape PROCESS dans l'ATS.
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "portal_stage" VARCHAR(20);
