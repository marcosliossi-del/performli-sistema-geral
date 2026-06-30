-- WAR-14: Abertura de War Room com critério de saída + AuditLog transversal.
-- 100% ADITIVO e idempotente (não quebra produção, seguro para re-deploy).

-- CreateEnum: WarRoomOutcome
DO $$ BEGIN
  CREATE TYPE "WarRoomOutcome" AS ENUM ('RESOLVIDO_POSITIVO', 'ENCERRADO_NEUTRO', 'PERDIDO_CHURN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: CriticalProtocol — campos do plano da War Room (todos nullable)
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "diagnosis"     TEXT;
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "exitCriteria"  TEXT;
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "exitMetric"    "MetricType";
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "exitTarget"    DECIMAL(12,2);
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "exitMetAt"     TIMESTAMP(3);
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "responsibleId" TEXT;
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "deadline"      TIMESTAMP(3);
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "escalatedAt"   TIMESTAMP(3);
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "closedOutcome" "WarRoomOutcome";

-- CreateIndex: CriticalProtocol novos índices
CREATE INDEX IF NOT EXISTS "CriticalProtocol_responsibleId_idx" ON "CriticalProtocol"("responsibleId");
CREATE INDEX IF NOT EXISTS "CriticalProtocol_escalatedAt_idx"   ON "CriticalProtocol"("escalatedAt");

-- AddForeignKey: CriticalProtocol.responsibleId → User (SetNull)
DO $$ BEGIN
  ALTER TABLE "CriticalProtocol" ADD CONSTRAINT "CriticalProtocol_responsibleId_fkey"
    FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: AuditLog (append-only, sem updatedAt)
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id"         TEXT NOT NULL,
    "actorId"    TEXT,
    "actorRole"  TEXT,
    "action"     TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "clientId"   TEXT,
    "metadata"   JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AuditLog
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_clientId_createdAt_idx"  ON "AuditLog"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx"   ON "AuditLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"    ON "AuditLog"("action", "createdAt");

-- AddForeignKey: AuditLog → User / Client (SetNull, preserva trilha)
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
