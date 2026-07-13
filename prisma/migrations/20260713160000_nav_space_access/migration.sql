-- ACL de navegação por espaço (decisão do Marcos, 2026-07-13).
-- Migration 100% ADITIVA: cria DUAS tabelas novas + FK para "User" (cascade).
-- Nenhuma tabela existente é alterada; nada é removido; a matriz RBAC
-- (permissions.ts) continua sendo o padrão default e não é tocada.

-- CreateTable
CREATE TABLE "NavSpaceMode" (
    "spaceKey" TEXT NOT NULL,
    "custom" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavSpaceMode_pkey" PRIMARY KEY ("spaceKey")
);

-- CreateTable
CREATE TABLE "NavSpaceAccess" (
    "id" TEXT NOT NULL,
    "spaceKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavSpaceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NavSpaceAccess_spaceKey_userId_key" ON "NavSpaceAccess"("spaceKey", "userId");

-- CreateIndex
CREATE INDEX "NavSpaceAccess_userId_idx" ON "NavSpaceAccess"("userId");

-- CreateIndex
CREATE INDEX "NavSpaceAccess_spaceKey_idx" ON "NavSpaceAccess"("spaceKey");

-- AddForeignKey
ALTER TABLE "NavSpaceAccess" ADD CONSTRAINT "NavSpaceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
