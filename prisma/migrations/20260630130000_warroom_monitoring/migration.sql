-- WAR-16: acompanhamento pós-War Room (monitoramento do critério de saída + revisão).
-- 100% ADITIVO e idempotente.

-- AlterEnum: novos tipos de alerta de War Room
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'WARROOM_NO_REVIEW';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'WARROOM_EXIT_CRITERIA_MET';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'WARROOM_REGRESSION';

-- AlterTable: CriticalProtocol — marca da última revisão semanal
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3);
