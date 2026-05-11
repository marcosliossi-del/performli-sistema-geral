-- CreateEnum
CREATE TYPE "CriticalProtocolStatus" AS ENUM ('ATIVADO', 'EM_EXECUCAO', 'MONITORANDO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "CriticalProtocol" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "trigger" "AlertType" NOT NULL,
    "status" "CriticalProtocolStatus" NOT NULL DEFAULT 'ATIVADO',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "briefingCS" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriticalProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CriticalProtocol_clientId_status_idx" ON "CriticalProtocol"("clientId", "status");

-- CreateIndex
CREATE INDEX "CriticalProtocol_status_idx" ON "CriticalProtocol"("status");

-- AddForeignKey
ALTER TABLE "CriticalProtocol" ADD CONSTRAINT "CriticalProtocol_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
