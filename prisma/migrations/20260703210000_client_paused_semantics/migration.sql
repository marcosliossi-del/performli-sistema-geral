-- T-23: semântica real do status PAUSED do cliente.
-- Migration ADITIVA: só acrescenta colunas nullable (nenhum dado existente é
-- tocado; clientes ACTIVE/CHURNED permanecem com pausedAt/pauseReason = NULL).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "pauseReason" TEXT;
