-- Fase 2 — Governança de Alertas: SLA com dono.
-- Migration ADITIVA e IDEMPOTENTE (IF NOT EXISTS). Não remove nada.
-- acknowledgedAt/acknowledgedBy = contrato de SLA (quem assumiu e quando),
-- distinto de "read" (estado visual). Nulo = ainda não reconhecido.

ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "acknowledgedBy" TEXT;

-- Índice para o watchdog de SLA e o circuit breaker (varredura por tipo +
-- reconhecimento + data). Idempotente.
CREATE INDEX IF NOT EXISTS "Alert_type_acknowledgedAt_createdAt_idx"
  ON "Alert" ("type", "acknowledgedAt", "createdAt");
