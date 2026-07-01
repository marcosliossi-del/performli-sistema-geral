-- FASE 5 — TaskCompletionGuard: campos flag-gated para bloquear a conclusão de
-- tarefas críticas sem evidência/checklist/notas/revisão.
-- Migração ADITIVA e IDEMPOTENTE. Todos os campos são opcionais ou têm DEFAULT,
-- garantindo zero regressão em tarefas existentes.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "reviewerId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requiresEvidence" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requiresReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completionNotes" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "sourcePopCode" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isGeneratedByAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "generatedByAgentName" TEXT;
