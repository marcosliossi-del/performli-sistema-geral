-- Adiciona os 3 campos que completam as 6 perguntas do check-in do gestor.
-- Aditiva e idempotente (não quebra deploy de produção).
ALTER TABLE "ClientWeeklyCheckin" ADD COLUMN IF NOT EXISTS "problema" TEXT;
ALTER TABLE "ClientWeeklyCheckin" ADD COLUMN IF NOT EXISTS "pedidosCliente" TEXT;
ALTER TABLE "ClientWeeklyCheckin" ADD COLUMN IF NOT EXISTS "novosSeguidores" INTEGER;
