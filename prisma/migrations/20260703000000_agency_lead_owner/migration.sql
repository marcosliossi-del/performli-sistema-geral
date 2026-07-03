-- ═══════════════════════════════════════════════════════════════════════════
-- AGENCYLEAD.ownerId — responsável comercial pelo lead (correção de atrito de
-- cadastro: lead nascia sem responsável). Aditiva e idempotente. Sem FK formal,
-- seguindo o padrão de AgencyActivity.leadId.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "AgencyLead" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

CREATE INDEX IF NOT EXISTS "AgencyLead_ownerId_idx" ON "AgencyLead"("ownerId");
