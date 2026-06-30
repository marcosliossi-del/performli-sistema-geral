-- Resultado semanal automatizado (ROAS/GA4) + Etapa derivada.
-- Aditiva e idempotente: cria enums se não existirem e adiciona colunas no Client.

DO $$
BEGIN
  CREATE TYPE "ClientResultado" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ClientEtapa" AS ENUM ('ESCALA', 'MONITORAMENTO', 'OTIMIZACAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resultado" "ClientResultado";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "etapa" "ClientEtapa";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resultadoRoas" DECIMAL(8,4);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resultadoWeek" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resultadoUpdatedAt" TIMESTAMP(3);
