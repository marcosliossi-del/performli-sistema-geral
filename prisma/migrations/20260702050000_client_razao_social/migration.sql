-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENT.razaoSocial — conciliação Asaas↔Cliente (pedido do dono, 2026-07-02)
-- Razão social exatamente como está no Asaas; name = nome fantasia/loja.
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT;
