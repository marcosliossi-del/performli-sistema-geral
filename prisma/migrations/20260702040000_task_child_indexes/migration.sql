-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICES taskId NAS TABELAS-FILHAS DE TASK — Fase 6 (recomendação P2 do A7)
-- Abrir o painel da task fazia Seq Scan em checklist/comments/approvals/
-- attachments (medido: Rows Removed by Filter: 3998 @ 4k linhas). Aditivo e
-- idempotente. TaskActivity já tinha índice; junções M:N já cobertas pela PK.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "TaskChecklistItem_taskId_idx" ON "TaskChecklistItem"("taskId");
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_idx"       ON "TaskComment"("taskId");
CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx"    ON "TaskAttachment"("taskId");
CREATE INDEX IF NOT EXISTS "TaskApproval_taskId_idx"      ON "TaskApproval"("taskId");
