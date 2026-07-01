-- Hub de Suporte: marca tarefas como demandas de atendimento e registra a
-- direção da demanda (cliente pediu para nós / nós pedimos ao cliente).
-- Migração ADITIVA e IDEMPOTENTE. Campos com DEFAULT/opcionais: zero regressão.

DO $$
BEGIN
  CREATE TYPE "SupportDirection" AS ENUM ('CLIENTE_PARA_NOS', 'NOS_PARA_CLIENTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isSupport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "supportDirection" "SupportDirection";
