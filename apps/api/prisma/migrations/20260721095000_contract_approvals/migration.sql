-- ═══════════════════════════════════════════════════════════════════════════
-- Contrat mandat : trace des envois signature + validation admin sous 18%.
-- Additif (aucun DROP).
-- ═══════════════════════════════════════════════════════════════════════════

-- Statut du contrat sur le mandat
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'EXPIRED');
CREATE TYPE "ContractApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Champs contrat sur mandats
ALTER TABLE "mandats"
  ADD COLUMN "contractStatus"    "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "contractSentAt"    TIMESTAMPTZ,
  ADD COLUMN "contractSignedAt"  TIMESTAMPTZ,
  ADD COLUMN "paymentTerms"      VARCHAR(50),
  ADD COLUMN "applicableCountry" VARCHAR(2);

-- Demandes de validation admin (sous le plancher 18%)
CREATE TABLE "contract_approvals" (
    "id"            UUID NOT NULL,
    "mandatId"      UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "feeRequested"  DECIMAL(5,2) NOT NULL,
    "reason"        TEXT NOT NULL,
    "status"        "ContractApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById"  UUID,
    "approvedAt"    TIMESTAMPTZ,
    "rejectionNote" TEXT,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ NOT NULL,
    CONSTRAINT "contract_approvals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_approvals"
  ADD CONSTRAINT "contract_approvals_mandatId_fkey"
    FOREIGN KEY ("mandatId") REFERENCES "mandats"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "contract_approvals_mandatId_idx" ON "contract_approvals"("mandatId");
CREATE INDEX "contract_approvals_status_idx" ON "contract_approvals"("status");
