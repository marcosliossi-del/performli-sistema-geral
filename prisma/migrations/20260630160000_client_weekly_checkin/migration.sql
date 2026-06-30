-- OPE-06: check-in semanal por cliente + workflow de validação da CS.
-- 100% ADITIVO e idempotente.

-- CreateEnum: CheckinStatus
DO $$ BEGIN
  CREATE TYPE "CheckinStatus" AS ENUM ('PENDENTE', 'PREENCHIDO', 'APROVADO', 'REPROVADO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum: novos tipos de alerta
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CHECKIN_MISSING';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CHECKIN_REJECTED_STALE';

-- CreateTable: ClientWeeklyCheckin
CREATE TABLE IF NOT EXISTS "ClientWeeklyCheckin" (
    "id"              TEXT NOT NULL,
    "clientId"        TEXT NOT NULL,
    "weekStart"       DATE NOT NULL,
    "managerId"       TEXT NOT NULL,
    "status"          "CheckinStatus" NOT NULL DEFAULT 'PENDENTE',
    "resultadoSemana" TEXT,
    "oQueFoiFeito"    TEXT,
    "proximosPassos"  TEXT,
    "submittedAt"     TIMESTAMP(3),
    "reviewedById"    TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "reviewNote"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientWeeklyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientWeeklyCheckin_clientId_weekStart_key" ON "ClientWeeklyCheckin"("clientId", "weekStart");
CREATE INDEX IF NOT EXISTS "ClientWeeklyCheckin_status_weekStart_idx"    ON "ClientWeeklyCheckin"("status", "weekStart");
CREATE INDEX IF NOT EXISTS "ClientWeeklyCheckin_managerId_weekStart_idx" ON "ClientWeeklyCheckin"("managerId", "weekStart");
CREATE INDEX IF NOT EXISTS "ClientWeeklyCheckin_clientId_weekStart_idx"  ON "ClientWeeklyCheckin"("clientId", "weekStart");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ClientWeeklyCheckin" ADD CONSTRAINT "ClientWeeklyCheckin_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientWeeklyCheckin" ADD CONSTRAINT "ClientWeeklyCheckin_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientWeeklyCheckin" ADD CONSTRAINT "ClientWeeklyCheckin_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
