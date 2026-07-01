-- Índices aditivos para queries quentes (auditoria trava #16). Idempotentes.
-- Não alteram dados; apenas aceleram filtros/ordenações frequentes.

CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status");
CREATE INDEX IF NOT EXISTS "Client_pipelineStage_idx" ON "Client"("pipelineStage");

CREATE INDEX IF NOT EXISTS "SyncLog_platformAccountId_startedAt_idx" ON "SyncLog"("platformAccountId", "startedAt");
CREATE INDEX IF NOT EXISTS "SyncLog_status_idx" ON "SyncLog"("status");

CREATE INDEX IF NOT EXISTS "AgencyLead_status_deletedAt_idx" ON "AgencyLead"("status", "deletedAt");
