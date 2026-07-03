-- ═══════════════════════════════════════════════════════════════════════════
-- WAR-14/15 — Diagnóstico do gestor + Decisões da CS na War Room.
--
-- Substitui os DOIS PDFs manuais da Arkza (diagnóstico enviado no chat até
-- quarta + ata de decisões da call de quinta) por campos estruturados dentro
-- do protocolo de conta crítica que JÁ existe. Nenhum model novo: apenas duas
-- colunas Json ADITIVAS e NULLABLE em CriticalProtocol.
--
-- Shapes validados em runtime por zod (src/lib/warroom/forms.ts):
--   • "diagnosticoGestor" → DiagnosticoGestor
--   • "decisoesCs"        → DecisoesCs
--
-- 100% aditiva e idempotente (ADD COLUMN IF NOT EXISTS). Sem backfill: os
-- campos nunca existiram, então protocolos atuais nascem com NULL (= "ainda
-- não preenchido"), respeitado pelo loader/UI.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "diagnosticoGestor" JSONB;
ALTER TABLE "CriticalProtocol" ADD COLUMN IF NOT EXISTS "decisoesCs" JSONB;
