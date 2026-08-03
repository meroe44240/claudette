-- Type de mandat : CLIENT (classique) ou VIVIER (sourcing sans client, exclu des stats)
CREATE TYPE "MandatType" AS ENUM ('CLIENT', 'VIVIER');

ALTER TABLE "mandats" ADD COLUMN "type" "MandatType" NOT NULL DEFAULT 'CLIENT';

-- Un mandat VIVIER n'a pas de client : le clientId devient optionnel.
ALTER TABLE "mandats" ALTER COLUMN "clientId" DROP NOT NULL;
