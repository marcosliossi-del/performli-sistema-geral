-- Navegação editável (decisão do Marcos, 2026-07-13 — "sidebar como no ClickUp").
-- Migration 100% ADITIVA: cria 1 enum + 1 tabela nova com self-relation (cascade).
-- Nenhuma tabela existente é alterada; nada é removido. A árvore é semeada em
-- runtime por ensureNavTree() (idempotente) — NÃO há migração de dados aqui.

-- CreateEnum
CREATE TYPE "NavNodeKind" AS ENUM ('GROUP', 'LEAF');

-- CreateTable
CREATE TABLE "NavNode" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "NavNodeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT,
    "spaceKey" TEXT,
    "module" TEXT,
    "countKey" TEXT,
    "alert" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "order" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "defaultOpen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NavNode_spaceKey_key" ON "NavNode"("spaceKey");

-- CreateIndex
CREATE INDEX "NavNode_parentId_order_idx" ON "NavNode"("parentId", "order");

-- AddForeignKey
ALTER TABLE "NavNode" ADD CONSTRAINT "NavNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NavNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
