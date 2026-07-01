-- Ficha de CS (NPS, Relacionamento, Curva, Feedback negativo).
-- Aditiva e idempotente.

DO $$
BEGIN
  CREATE TYPE "ClientNps" AS ENUM ('PROMOTOR', 'NEUTRO', 'DETRATOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ClientRelacionamento" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ClientCurva" AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "nps" "ClientNps";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "relacionamento" "ClientRelacionamento";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "curva" "ClientCurva";
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "feedbackNegativo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "fichaCsUpdatedAt" TIMESTAMP(3);
