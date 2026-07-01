-- ═══════════════════════════════════════════════════════════════════════════
-- TASKS CLICKUP-CLASS — Fase 1 (A1-ARQUITETO-DADOS)
-- Convergência do schema para o alvo do BLOCO 3.1. 100% ADITIVA e IDEMPOTENTE.
-- Cria: Workspace, WorkspaceMember, StatusSet, Status (+ enums) e colunas
-- aditivas em Task/TaskList. Zero DROP, zero rename, zero perda de dados.
-- Decisões: DECISIONS.md D-003 (fractional), D-004 (status 2 etapas),
-- D-005 (multi-assignee via TaskAuxAssignee), D-007 (tenancy gradual).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER','ADMIN','MEMBER','GUEST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusGroup" AS ENUM ('NOT_STARTED','ACTIVE','DONE','CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Workspace (D-007: tabela nova nasce com tenancy) ─────────────────────────
CREATE TABLE IF NOT EXISTS "Workspace" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "role"        "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key"
  ON "WorkspaceMember"("workspaceId","userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

DO $$ BEGIN
  ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── StatusSet + Status (D-004 etapa 1) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StatusSet" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatusSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StatusSet_workspaceId_idx" ON "StatusSet"("workspaceId");
DO $$ BEGIN
  ALTER TABLE "StatusSet" ADD CONSTRAINT "StatusSet_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Status" (
  "id"          TEXT NOT NULL,
  "statusSetId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "color"       TEXT NOT NULL,
  "group"       "StatusGroup" NOT NULL,
  "orderIndex"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Status_statusSetId_idx" ON "Status"("statusSetId");
DO $$ BEGIN
  ALTER TABLE "Status" ADD CONSTRAINT "Status_statusSetId_fkey"
    FOREIGN KEY ("statusSetId") REFERENCES "StatusSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Task: statusId + orderIndex (aditivos, NULL) ─────────────────────────────
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "statusId"   TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "orderIndex" TEXT;
DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_statusId_fkey"
    FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── TaskList: statusSetId (aditivo, NULL) ────────────────────────────────────
ALTER TABLE "TaskList" ADD COLUMN IF NOT EXISTS "statusSetId" TEXT;
DO $$ BEGIN
  ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_statusSetId_fkey"
    FOREIGN KEY ("statusSetId") REFERENCES "StatusSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Índices quentes (audit §6) ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Task_assignedTo_status_dueDate_idx" ON "Task"("assignedTo","status","dueDate");
CREATE INDEX IF NOT EXISTS "Task_status_dueDate_idx"            ON "Task"("status","dueDate");
CREATE INDEX IF NOT EXISTS "Task_isSupport_status_idx"          ON "Task"("isSupport","status");
CREATE INDEX IF NOT EXISTS "Task_updatedAt_idx"                 ON "Task"("updatedAt");
CREATE INDEX IF NOT EXISTS "Task_clientId_status_idx"           ON "Task"("clientId","status");
CREATE INDEX IF NOT EXISTS "Task_statusId_idx"                  ON "Task"("statusId");

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL (idempotente — seguro rodar N vezes)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Workspace Arkza
INSERT INTO "Workspace" ("id","name")
VALUES ('ws_arkza','Arkza')
ON CONFLICT ("id") DO NOTHING;

-- 2) Membros a partir de User (RBAC ADMIN→ADMIN, demais→MEMBER)
INSERT INTO "WorkspaceMember" ("id","workspaceId","userId","role")
SELECT 'wm_' || u."id", 'ws_arkza', u."id",
       (CASE WHEN u."role" = 'ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END)::"WorkspaceRole"
FROM "User" u
ON CONFLICT ("workspaceId","userId") DO NOTHING;

-- 3) StatusSet padrão Arkza
INSERT INTO "StatusSet" ("id","workspaceId","name","isDefault")
VALUES ('sset_arkza','ws_arkza','Pipeline Arkza',true)
ON CONFLICT ("id") DO NOTHING;

-- 4) 11 Status (1 por valor do enum TaskStatus), orderIndex fracionário
INSERT INTO "Status" ("id","statusSetId","name","color","group","orderIndex") VALUES
  ('st_a_fazer',             'sset_arkza','A Fazer',              '#6b7280','NOT_STARTED','a0'),
  ('st_em_andamento',        'sset_arkza','Em Andamento',         '#3b82f6','ACTIVE',     'a1'),
  ('st_aguardando_cliente',  'sset_arkza','Aguardando Cliente',   '#f59e0b','ACTIVE',     'a2'),
  ('st_aguardando_gestor',   'sset_arkza','Aguardando Gestor',    '#f59e0b','ACTIVE',     'a3'),
  ('st_aguardando_cs',       'sset_arkza','Aguardando CS',        '#f59e0b','ACTIVE',     'a4'),
  ('st_em_validacao',        'sset_arkza','Em Validação',         '#8b5cf6','ACTIVE',     'a5'),
  ('st_ajustes_solicitados', 'sset_arkza','Ajustes Solicitados',  '#f97316','ACTIVE',     'a6'),
  ('st_bloqueado',           'sset_arkza','Bloqueado',            '#ef4444','ACTIVE',     'a7'),
  ('st_atrasado',            'sset_arkza','Atrasado',             '#ef4444','ACTIVE',     'a8'),
  ('st_concluido',           'sset_arkza','Concluído',            '#22c55e','DONE',       'a9'),
  ('st_cancelado',           'sset_arkza','Cancelado',            '#6b7280','CLOSED',     'aA')
ON CONFLICT ("id") DO NOTHING;

-- 5) Task.statusId ← mapeamento do enum (só onde ainda NULL)
UPDATE "Task" SET "statusId" = CASE "status"
    WHEN 'A_FAZER'            THEN 'st_a_fazer'
    WHEN 'EM_ANDAMENTO'       THEN 'st_em_andamento'
    WHEN 'AGUARDANDO_CLIENTE' THEN 'st_aguardando_cliente'
    WHEN 'AGUARDANDO_GESTOR'  THEN 'st_aguardando_gestor'
    WHEN 'AGUARDANDO_CS'      THEN 'st_aguardando_cs'
    WHEN 'EM_VALIDACAO'       THEN 'st_em_validacao'
    WHEN 'AJUSTES_SOLICITADOS' THEN 'st_ajustes_solicitados'
    WHEN 'BLOQUEADO'          THEN 'st_bloqueado'
    WHEN 'ATRASADO'           THEN 'st_atrasado'
    WHEN 'CONCLUIDO'          THEN 'st_concluido'
    WHEN 'CANCELADO'          THEN 'st_cancelado'
  END
WHERE "statusId" IS NULL;

-- 6) TaskList.statusSetId ← default Arkza (só onde ainda NULL)
UPDATE "TaskList" SET "statusSetId" = 'sset_arkza'
WHERE "statusSetId" IS NULL;
