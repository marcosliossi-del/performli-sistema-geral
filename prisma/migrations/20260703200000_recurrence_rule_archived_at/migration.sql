-- ═══════════════════════════════════════════════════════════════════════════
-- TaskRecurrenceRule.archivedAt — arquivamento de regras de recorrência (T-19).
--
-- Hoje a única ação sobre uma regra é pausar/reativar (active). Uma regra mal
-- configurada fica presa para sempre na lista. `archivedAt` permite ARQUIVAR
-- (tirar da lista padrão e do motor) SEM apagar histórico: as tarefas já
-- geradas continuam apontando para recurrenceId, e os AutomationLog permanecem.
--
-- Aditiva e idempotente: coluna anulável adicionada com IF NOT EXISTS. Regras
-- existentes nascem com archivedAt = NULL (não arquivadas), preservando o
-- comportamento atual. NÃO há backfill.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "TaskRecurrenceRule"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
