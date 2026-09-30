-- Mentions (@) dans les commentaires du portail client.
ALTER TABLE "portal_comments" ADD COLUMN IF NOT EXISTS "mentions" JSONB NOT NULL DEFAULT '[]';
