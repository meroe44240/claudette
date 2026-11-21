-- Valeurs hors conditions standard demandées pour un contrat (garde-fous MCP generate_contract)
ALTER TABLE "contract_approvals" ADD COLUMN IF NOT EXISTS "exceptions" JSONB;
