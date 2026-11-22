-- Idempotence des appels d'outils MCP (lot 2 accès des agents)
CREATE TABLE IF NOT EXISTS "mcp_idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "args_hash" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_idempotency_keys_user_id_key_key" ON "mcp_idempotency_keys"("user_id", "key");
CREATE INDEX IF NOT EXISTS "mcp_idempotency_keys_created_at_idx" ON "mcp_idempotency_keys"("created_at");
