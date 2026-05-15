-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ContractStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'RENOVACAO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractType" AS ENUM ('FEE_MENSAL', 'PROJETO', 'AVULSO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum: add CONTRACT_EXPIRING_SOON to AlertType
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CONTRACT_EXPIRING_SOON';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Contract" (
    "id"                 TEXT NOT NULL,
    "clientId"           TEXT NOT NULL,
    "responsibleId"      TEXT,
    "status"             "ContractStatus" NOT NULL DEFAULT 'RASCUNHO',
    "type"               "ContractType"   NOT NULL DEFAULT 'FEE_MENSAL',
    "feeValue"           DECIMAL(12,2)    NOT NULL,
    "setupFee"           DECIMAL(12,2),
    "startDate"          DATE             NOT NULL,
    "endDate"            DATE             NOT NULL,
    "noticeDays"         INTEGER          NOT NULL DEFAULT 30,
    "autoRenew"          BOOLEAN          NOT NULL DEFAULT false,
    "documentUrl"        TEXT,
    "notes"              TEXT,
    "signedAt"           TIMESTAMP(3),
    "cancelledAt"        TIMESTAMP(3),
    "cancelReason"       TEXT,
    "previousContractId" TEXT,
    "createdAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contract_clientId_status_idx" ON "Contract"("clientId", "status");
CREATE INDEX IF NOT EXISTS "Contract_endDate_idx"          ON "Contract"("endDate");
CREATE INDEX IF NOT EXISTS "Contract_status_idx"           ON "Contract"("status");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousContractId_fkey"
  FOREIGN KEY ("previousContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
