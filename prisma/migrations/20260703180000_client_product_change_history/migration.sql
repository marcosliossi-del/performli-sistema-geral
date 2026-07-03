-- ═══════════════════════════════════════════════════════════════════════════
-- ClientProductChange — histórico versionado das transições de produtos do
-- cliente (Fase 3 anti-churn: DOWNGRADE de produto). `Client.produtos` guarda
-- só o estado atual; este model versiona ADDED/REMOVED por produto para
-- alimentar o gatilho de downgrade e (em 90 dias) o fator de score de churn.
--
-- Aditiva e idempotente:
--   • enum criado via bloco guardado (IF NOT EXISTS não existe p/ CREATE TYPE);
--   • tabela e índice com IF NOT EXISTS;
--   • FK adicionada só se ainda não existir.
-- Histórico começa AGORA — não há backfill (o campo nunca teve mutação antes).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Enum ProductChangeAction (guardado — CREATE TYPE não aceita IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductChangeAction') THEN
    CREATE TYPE "ProductChangeAction" AS ENUM ('ADDED', 'REMOVED');
  END IF;
END
$$;

-- 2) Tabela
CREATE TABLE IF NOT EXISTS "ClientProductChange" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "product"   TEXT NOT NULL,
  "action"    "ProductChangeAction" NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy" TEXT,
  CONSTRAINT "ClientProductChange_pkey" PRIMARY KEY ("id")
);

-- 3) Índice de leitura da série temporal por cliente
CREATE INDEX IF NOT EXISTS "ClientProductChange_clientId_changedAt_idx"
  ON "ClientProductChange" ("clientId", "changedAt");

-- 4) FK para Client (cascade no delete do cliente) — guardada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientProductChange_clientId_fkey'
  ) THEN
    ALTER TABLE "ClientProductChange"
      ADD CONSTRAINT "ClientProductChange_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
