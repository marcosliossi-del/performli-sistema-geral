-- ═══════════════════════════════════════════════════════════════════════════
-- TASK RECURRENCE RULE — Fase 2 (A2-BACKEND-CORE) · DECISIONS.md D-010
-- Regra de recorrência estilo ClickUp NA task individual. 100% ADITIVA e
-- IDEMPOTENTE. Shape (validado por zod em src/lib/tasks/recurrence.ts):
--   { freq: 'DAILY'|'WEEKLY'|'MONTHLY', interval, byWeekday?: number[],
--     mode: 'onComplete'|'schedule', skipWeekends?: boolean }
-- Coexiste com TaskRecurrenceRule (templates por cliente) — papéis distintos.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurrenceRule" JSONB;
