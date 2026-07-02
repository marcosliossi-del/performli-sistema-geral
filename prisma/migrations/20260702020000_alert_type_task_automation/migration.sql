-- ═══════════════════════════════════════════════════════════════════════════
-- ALERT TYPE — TASK_AUTOMATION — Fase 5 (A5-AUTOMATION)
-- Valor de AlertType emitido pela ação `notify` do motor de automação de tasks
-- (src/services/task-automation.ts). 100% ADITIVO e IDEMPOTENTE.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_AUTOMATION';
