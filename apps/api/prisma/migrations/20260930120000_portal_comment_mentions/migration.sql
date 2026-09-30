-- Mentions (@) dans les commentaires du portail client.
ALTER TABLE "portal_comments" ADD COLUMN IF NOT EXISTS "mentions" JSONB NOT NULL DEFAULT '[]';

-- Nom du contact invité, affiché à la place de son email dans le portail.
ALTER TABLE "portal_accesses" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255);
