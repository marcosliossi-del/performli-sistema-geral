-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('LEAD', 'PROPOSTA', 'NEGOCIACAO', 'ATIVO', 'CHURNED');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('LIGACAO', 'REUNIAO', 'EMAIL', 'WHATSAPP', 'NOTA', 'PROPOSTA_ENVIADA', 'CONTRATO_ASSINADO');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "contractStart" TIMESTAMP(3),
ADD COLUMN     "contractValue" DECIMAL(65,30),
ADD COLUMN     "document" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN     "tags" TEXT[];

-- CreateTable
CREATE TABLE "ClientInteraction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientInteraction_clientId_createdAt_idx" ON "ClientInteraction"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientInteraction" ADD CONSTRAINT "ClientInteraction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInteraction" ADD CONSTRAINT "ClientInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
