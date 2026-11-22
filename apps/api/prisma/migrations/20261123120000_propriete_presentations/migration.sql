-- Lot 3 accès des agents : propriété, présentations, valeur d'opportunité des leads.
-- Écrit pour pouvoir être rejoué sans erreur (IF NOT EXISTS, reprise de données sans doublon).

ALTER TABLE "entreprises" ADD COLUMN IF NOT EXISTS "owner_id" UUID;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "nb_postes" INTEGER;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "package_moyen" INTEGER;

CREATE TABLE IF NOT EXISTS "ownerships" (
    "id" UUID NOT NULL,
    "entite_type" VARCHAR(20) NOT NULL,
    "entite_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "motif" TEXT,
    "claimed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "released_by_id" UUID,
    "release_motif" TEXT,
    CONSTRAINT "ownerships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "presentations" (
    "id" UUID NOT NULL,
    "candidat_id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "client_id" UUID,
    "mandat_id" UUID,
    "candidature_id" UUID,
    "lead_id" UUID,
    "canal" VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
    "statut" VARCHAR(20) NOT NULL DEFAULT 'ENVOYEE',
    "accord_candidat" BOOLEAN NOT NULL DEFAULT false,
    "accord_date" TIMESTAMPTZ,
    "anonyme" BOOLEAN NOT NULL DEFAULT true,
    "cv_url" VARCHAR(1000),
    "note" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'MANUEL',
    "presented_by_id" UUID,
    "presented_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "presentations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ownerships_entite_type_entite_id_idx" ON "ownerships"("entite_type", "entite_id");
CREATE INDEX IF NOT EXISTS "ownerships_owner_id_idx" ON "ownerships"("owner_id");
CREATE INDEX IF NOT EXISTS "ownerships_expires_at_idx" ON "ownerships"("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "presentations_candidature_id_key" ON "presentations"("candidature_id");
CREATE INDEX IF NOT EXISTS "presentations_candidat_id_idx" ON "presentations"("candidat_id");
CREATE INDEX IF NOT EXISTS "presentations_entreprise_id_idx" ON "presentations"("entreprise_id");
CREATE INDEX IF NOT EXISTS "presentations_lead_id_idx" ON "presentations"("lead_id");
CREATE INDEX IF NOT EXISTS "presentations_presented_at_idx" ON "presentations"("presented_at");
CREATE INDEX IF NOT EXISTS "entreprises_owner_id_idx" ON "entreprises"("owner_id");

ALTER TABLE "entreprises" DROP CONSTRAINT IF EXISTS "entreprises_owner_id_fkey";
ALTER TABLE "entreprises" ADD CONSTRAINT "entreprises_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ownerships" DROP CONSTRAINT IF EXISTS "ownerships_owner_id_fkey";
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presentations" DROP CONSTRAINT IF EXISTS "presentations_candidat_id_fkey";
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_candidat_id_fkey" FOREIGN KEY ("candidat_id") REFERENCES "candidats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presentations" DROP CONSTRAINT IF EXISTS "presentations_entreprise_id_fkey";
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presentations" DROP CONSTRAINT IF EXISTS "presentations_presented_by_id_fkey";
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_presented_by_id_fkey" FOREIGN KEY ("presented_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Reprise 1 : candidatures envoyées au client (ou plus loin) → une présentation chacune ───
INSERT INTO "presentations" ("id", "candidat_id", "entreprise_id", "client_id", "mandat_id", "candidature_id",
  "canal", "statut", "accord_candidat", "accord_date", "anonyme", "source", "presented_by_id", "presented_at", "created_at", "updated_at")
SELECT gen_random_uuid(), c."candidatId", m."entrepriseId", m."clientId", m."id", c."id",
  'EMAIL',
  CASE c."stage"::text
    WHEN 'ENVOYE_CLIENT' THEN 'ENVOYEE'
    WHEN 'ENTRETIEN_CLIENT' THEN 'ENTRETIEN'
    WHEN 'PROCESS' THEN 'ENTRETIEN'
    WHEN 'OFFRE' THEN 'ENTRETIEN'
    WHEN 'PLACE' THEN 'EMBAUCHE'
    ELSE 'REFUSEE' END,
  c."interet_confirme", c."interet_confirme_date", false, 'REPRISE',
  COALESCE(sh."changedById", c."createdById"),
  COALESCE(sh."changedAt", c."datePresentation", c."updatedAt"),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "candidatures" c
JOIN "mandats" m ON m."id" = c."mandatId"
LEFT JOIN LATERAL (
  SELECT h."changedById", h."changedAt" FROM "stage_history" h
  WHERE h."candidatureId" = c."id" AND h."toStage"::text IN ('ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE')
  ORDER BY h."changedAt" ASC LIMIT 1
) sh ON true
WHERE (c."stage"::text IN ('ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE')
       OR (c."stage"::text = 'REFUSE' AND sh."changedAt" IS NOT NULL))
ON CONFLICT ("candidature_id") DO NOTHING;

-- ─── Reprise 2 : pushs List Push (lead src=push) → candidat de la liste marché ───
INSERT INTO "presentations" ("id", "candidat_id", "entreprise_id", "lead_id", "canal", "statut", "anonyme", "source",
  "presented_by_id", "presented_at", "created_at", "updated_at")
SELECT DISTINCT ON (l."id") gen_random_uuid(), ml."candidatId", l."entrepriseId", l."id", 'EMAIL',
  CASE l."stage" WHEN 'perdu' THEN 'REFUSEE' WHEN 'rdv' THEN 'INTERESSE' WHEN 'gagne' THEN 'INTERESSE' ELSE 'ENVOYEE' END,
  true, 'REPRISE', l."ownerId", l."createdAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "leads" l
JOIN "market_list_establishments" e ON e."entrepriseId" = l."entrepriseId"
JOIN "market_lists" ml ON ml."id" = e."marketListId"
JOIN "candidats" ca ON ca."id" = ml."candidatId"
JOIN "entreprises" en ON en."id" = l."entrepriseId"
WHERE l."src" = 'push' AND l."pushedCandidat" IS NOT NULL AND ml."candidatId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "presentations" p WHERE p."lead_id" = l."id")
ORDER BY l."id", ml."updatedAt" DESC;

-- ─── Reprise 3 : propriétaires actuels des leads et des contacts clients ───
INSERT INTO "ownerships" ("id", "entite_type", "entite_id", "owner_id", "motif", "claimed_at")
SELECT gen_random_uuid(), 'LEAD', l."id", l."ownerId", 'Reprise de l''existant', l."createdAt"
FROM "leads" l JOIN "users" u ON u."id" = l."ownerId"
WHERE NOT EXISTS (SELECT 1 FROM "ownerships" o WHERE o."entite_type" = 'LEAD' AND o."entite_id" = l."id" AND o."released_at" IS NULL);

INSERT INTO "ownerships" ("id", "entite_type", "entite_id", "owner_id", "motif", "claimed_at")
SELECT gen_random_uuid(), 'CLIENT', c."id", c."assignedToId", 'Reprise de l''existant', c."updatedAt"
FROM "clients" c JOIN "users" u ON u."id" = c."assignedToId"
WHERE NOT EXISTS (SELECT 1 FROM "ownerships" o WHERE o."entite_type" = 'CLIENT' AND o."entite_id" = c."id" AND o."released_at" IS NULL);
