-- ═══════════════════════════════════════════════════════════════════════════
-- TASK AUTOMATION RULE — CONFIG (conditions / actionConfig) — Fase 5 (A5)
-- Colunas de configuração do motor de automação v0 (gatilho → condição → ação).
-- 100% ADITIVAS e IDEMPOTENTES. Convergem TaskAutomationRule para o alvo do
-- BLOCO 3.1 (conditions Json / actions Json) SEM dropar os campos legados
-- (trigger/condition/actionType/templateId permanecem intactos — CLAUDE.md #13).
--
--   conditions   : { listId?, clientId?, status? }        (condição do gatilho)
--   actionConfig : { assignTo?, alertTitle?, alertBody? }  (parâmetros da ação)
--
-- Justificativa da adição (handoff §2): sem um lugar tipado para os parâmetros
-- de ação (a quem atribuir / texto do alerta) o executor seria não-funcional; a
-- criação de MODEL novo é proibida, mas colunas nullable aditivas no model
-- existente são o caminho sancionado (migrations aditivas idempotentes).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "TaskAutomationRule" ADD COLUMN IF NOT EXISTS "conditions" JSONB;
ALTER TABLE "TaskAutomationRule" ADD COLUMN IF NOT EXISTS "actionConfig" JSONB;
