-- Lot 4 accès des agents : webhooks sortants par type d'événement.
CREATE TABLE IF NOT EXISTS "webhooks" (
    "id" UUID NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "last_delivery_at" TIMESTAMPTZ,
    "last_status" INTEGER,
    "last_error" VARCHAR(500),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);
