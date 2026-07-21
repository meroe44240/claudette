-- ═══════════════════════════════════════════════════════════════════════════
-- Portail client multi-tenant (chantier 3) — additif, aucun DROP.
-- 4 nouvelles tables + 3 enums.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enums
CREATE TYPE "PortalEventType" AS ENUM ('LOGIN', 'VIEW_PROFILE', 'MOVE', 'DECISION', 'COMMENT');
CREATE TYPE "PortalDecisionType" AS ENUM ('RENCONTRER', 'A_DISCUTER', 'ECARTER');

-- PortalAccess : compte d'accès (Client x Mandat), auth par email + password
CREATE TABLE "portal_accesses" (
    "id"           UUID NOT NULL,
    "mandatId"     UUID NOT NULL,
    "clientId"     UUID NOT NULL,
    "email"        VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "lastLoginAt"  TIMESTAMPTZ,
    "revokedAt"    TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_accesses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "portal_accesses_mandatId_email_key" ON "portal_accesses"("mandatId", "email");
CREATE INDEX "portal_accesses_mandatId_idx" ON "portal_accesses"("mandatId");
CREATE INDEX "portal_accesses_clientId_idx" ON "portal_accesses"("clientId");
ALTER TABLE "portal_accesses"
  ADD CONSTRAINT "portal_accesses_mandatId_fkey" FOREIGN KEY ("mandatId") REFERENCES "mandats"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "portal_accesses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PortalEvent : bus temps réel (LOGIN, VIEW_PROFILE, MOVE, DECISION, COMMENT)
CREATE TABLE "portal_events" (
    "id"             UUID NOT NULL,
    "portalAccessId" UUID NOT NULL,
    "mandatId"       UUID NOT NULL,
    "type"           "PortalEventType" NOT NULL,
    "candidatureId"  UUID,
    "payload"        JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_events_mandatId_createdAt_idx" ON "portal_events"("mandatId", "createdAt");
CREATE INDEX "portal_events_portalAccessId_idx" ON "portal_events"("portalAccessId");
CREATE INDEX "portal_events_candidatureId_idx" ON "portal_events"("candidatureId");
ALTER TABLE "portal_events"
  ADD CONSTRAINT "portal_events_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portal_accesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PortalDecision : rencontrer / à discuter / écarter + raison
CREATE TABLE "portal_decisions" (
    "id"             UUID NOT NULL,
    "portalAccessId" UUID NOT NULL,
    "candidatureId"  UUID NOT NULL,
    "decision"       "PortalDecisionType" NOT NULL,
    "reason"         TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_decisions_candidatureId_idx" ON "portal_decisions"("candidatureId");
CREATE INDEX "portal_decisions_portalAccessId_idx" ON "portal_decisions"("portalAccessId");
ALTER TABLE "portal_decisions"
  ADD CONSTRAINT "portal_decisions_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portal_accesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PortalComment : commentaire client identifié
CREATE TABLE "portal_comments" (
    "id"             UUID NOT NULL,
    "portalAccessId" UUID NOT NULL,
    "candidatureId"  UUID,
    "mandatId"       UUID NOT NULL,
    "content"        TEXT NOT NULL,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_comments_candidatureId_idx" ON "portal_comments"("candidatureId");
CREATE INDEX "portal_comments_mandatId_createdAt_idx" ON "portal_comments"("mandatId", "createdAt");
ALTER TABLE "portal_comments"
  ADD CONSTRAINT "portal_comments_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portal_accesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
