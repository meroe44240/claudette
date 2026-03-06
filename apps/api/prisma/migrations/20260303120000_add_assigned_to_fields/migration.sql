-- AlterTable
ALTER TABLE "candidats" ADD COLUMN "assignedToId" UUID;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "assignedToId" UUID;

-- AlterTable
ALTER TABLE "mandats" ADD COLUMN "assignedToId" UUID;

-- AddForeignKey
ALTER TABLE "candidats" ADD CONSTRAINT "candidats_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandats" ADD CONSTRAINT "mandats_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
