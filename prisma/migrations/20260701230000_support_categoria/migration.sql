-- Hub de Suporte: categoria operacional da demanda (Tráfego / Demanda da Agência
-- / Sucesso do Cliente), espelhando as listas do ClickUp do Time de CS.
-- Migração ADITIVA e IDEMPOTENTE. Campo opcional: zero regressão.

DO $$
BEGIN
  CREATE TYPE "SupportCategory" AS ENUM ('TRAFEGO', 'DEMANDA_DA_AGENCIA', 'SUCESSO_DO_CLIENTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "supportCategory" "SupportCategory";
