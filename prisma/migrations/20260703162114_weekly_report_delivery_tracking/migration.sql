-- FASE 1.2 — Instrumentação de ENTREGA do relatório semanal (anti-churn / Bloco 5)
--
-- Contexto: WeeklyReport só registrava content + generatedAt. O sistema sabia que
-- o relatório foi GERADO, mas nunca se o cliente RECEBEU a prestação de contas —
-- a falha mais silenciosa da auditoria docs/AUDITORIA_CHURN_SILENCIOSO.md (Bloco 5).
--
-- Esta migration é ADITIVA e IDEMPOTENTE (ADD COLUMN IF NOT EXISTS): fecha o funil
-- gerado → enviado → entregue → respondido sem tocar nos dados existentes.
--
--   sentAt        quando alguém marcou o relatório como enviado ao cliente
--   sentBy        userId do Performli que marcou o envio
--   deliveredAt   confirmação de entrega (webhook de status Z-API) — campo pronto,
--                 preenchimento aguarda spec de callback de status da Z-API (TODO)
--   firstReplyAt  primeira resposta do cliente após o envio

ALTER TABLE "WeeklyReport" ADD COLUMN IF NOT EXISTS "sentAt"       TIMESTAMP(3);
ALTER TABLE "WeeklyReport" ADD COLUMN IF NOT EXISTS "sentBy"       TEXT;
ALTER TABLE "WeeklyReport" ADD COLUMN IF NOT EXISTS "deliveredAt"  TIMESTAMP(3);
ALTER TABLE "WeeklyReport" ADD COLUMN IF NOT EXISTS "firstReplyAt" TIMESTAMP(3);
