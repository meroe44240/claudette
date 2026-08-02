-- Leads (prospection commerciale à relances) + interactions
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "company" VARCHAR(255) NOT NULL,
    "contact" VARCHAR(255) NOT NULL,
    "role" VARCHAR(160),
    "city" VARCHAR(120),
    "sector" VARCHAR(120),
    "headcount" VARCHAR(60),
    "phone" VARCHAR(60),
    "email" VARCHAR(255),
    "source" VARCHAR(255),
    "src" VARCHAR(20) NOT NULL DEFAULT 'cold',
    "stage" VARCHAR(20) NOT NULL DEFAULT 'nouveau',
    "ownerId" UUID,
    "entrepriseId" UUID,
    "clientId" UUID,
    "pushedCandidat" JSONB,
    "lostReason" VARCHAR(160),
    "lostNote" TEXT,
    "lastContactAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leads_ownerId_idx" ON "leads"("ownerId");
CREATE INDEX "leads_stage_idx" ON "leads"("stage");
CREATE TABLE "lead_interactions" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" VARCHAR(20),
    "text" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_interactions_leadId_idx" ON "lead_interactions"("leadId");
ALTER TABLE "lead_interactions" ADD CONSTRAINT "lead_interactions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
