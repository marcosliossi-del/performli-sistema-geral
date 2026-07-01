-- Fundação operacional (ClickUp mapping): papel operacional, responsáveis por
-- papel no Client, campos de meta/saúde/financeiro, rastreabilidade externalId.
-- Migração ADITIVA e IDEMPOTENTE.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "OperationalRole" AS ENUM ('HEAD','SUPERVISOR','GESTOR','CRM','CS','ACOMPANHAMENTO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ClientHealthStatus" AS ENUM ('SAUDAVEL','ATENCAO','CRITICO','POSSIVEL_CHURN','WAR_ROOM','ARQUIVADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "BusinessType" ADD VALUE IF NOT EXISTS 'B2B';

-- ── User ─────────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "operationalRole" "OperationalRole";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_externalId_key" ON "User"("externalId");

-- ── Client: colunas ──────────────────────────────────────────────────────────
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engajamento" "ClientRelacionamento";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "possivelChurn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "salaDeGuerra" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "healthStatus" "ClientHealthStatus";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "gestorId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "csId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "supervisorId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "headId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "crmId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "plataformas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "produtos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "roasMinimo" DECIMAL(8,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "cpaMaximo" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "investimentoMeta" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "investimentoGoogle" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "investimentoTiktok" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "faturamentoEsperado" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "dashboardLooker" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "painelEcommerce" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "billingDueDay" INTEGER;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "feeAmount" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contractEndDate" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "precisaCompletarCadastro" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_externalId_key" ON "Client"("externalId");
CREATE INDEX IF NOT EXISTS "Client_gestorId_idx" ON "Client"("gestorId");
CREATE INDEX IF NOT EXISTS "Client_csId_idx" ON "Client"("csId");

-- ── Client: FKs de responsável (idempotentes) ────────────────────────────────
DO $$ BEGIN ALTER TABLE "Client" ADD CONSTRAINT "Client_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Client" ADD CONSTRAINT "Client_csId_fkey" FOREIGN KEY ("csId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Client" ADD CONSTRAINT "Client_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Client" ADD CONSTRAINT "Client_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Client" ADD CONSTRAINT "Client_crmId_fkey" FOREIGN KEY ("crmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── TaskList: externalId + clientId ──────────────────────────────────────────
ALTER TABLE "TaskList" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "TaskList" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TaskList_externalId_key" ON "TaskList"("externalId");
CREATE INDEX IF NOT EXISTS "TaskList_clientId_idx" ON "TaskList"("clientId");
DO $$ BEGIN ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── TaskRecurrenceRule: âncora p/ quinzenal ──────────────────────────────────
ALTER TABLE "TaskRecurrenceRule" ADD COLUMN IF NOT EXISTS "anchorDate" TIMESTAMP(3);
