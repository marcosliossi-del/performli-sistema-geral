-- CENTRAL OPERACIONAL — BLOCO 1
-- Estende Task como entidade central + 24 models novos. Aditivo, exceto a troca
-- (com backfill) dos enums TaskStatus/TaskPriority. Roda 1x via migrate deploy.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Troca de enum TaskStatus (backfill dos valores antigos)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
CREATE TYPE "TaskStatus" AS ENUM (
  'A_FAZER','EM_ANDAMENTO','AGUARDANDO_CLIENTE','AGUARDANDO_GESTOR','AGUARDANDO_CS',
  'EM_VALIDACAO','AJUSTES_SOLICITADOS','BLOQUEADO','ATRASADO','CONCLUIDO','CANCELADO'
);
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus" USING (
  CASE "status"::text
    WHEN 'PENDING'     THEN 'A_FAZER'
    WHEN 'IN_PROGRESS' THEN 'EM_ANDAMENTO'
    WHEN 'DONE'        THEN 'CONCLUIDO'
    WHEN 'CANCELLED'   THEN 'CANCELADO'
    ELSE 'A_FAZER'
  END::"TaskStatus"
);
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'A_FAZER';
DROP TYPE "TaskStatus_old";

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Troca de enum TaskPriority (backfill)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TYPE "TaskPriority" RENAME TO "TaskPriority_old";
CREATE TYPE "TaskPriority" AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
ALTER TABLE "Task" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "priority" TYPE "TaskPriority" USING (
  CASE "priority"::text
    WHEN 'LOW'    THEN 'BAIXA'
    WHEN 'MEDIUM' THEN 'MEDIA'
    WHEN 'HIGH'   THEN 'ALTA'
    ELSE 'MEDIA'
  END::"TaskPriority"
);
ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 'MEDIA';
DROP TYPE "TaskPriority_old";

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Novos enums
-- ════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN CREATE TYPE "TaskType" AS ENUM ('SIMPLES','RECORRENTE','CHECKLIST_OPERACIONAL','APROVACAO','VALIDACAO','FOLLOWUP','REUNIAO','COBRANCA','AUDITORIA','RELATORIO','DEMANDA_CLIENTE','DEMANDA_INTERNA','MELHORIA_PROCESSO','BUG_OPERACIONAL','WAR_ROOM','ONBOARDING','FINANCEIRA','COMERCIAL','CS','GERADA_POR_ALERTA','GERADA_POR_POP','GERADA_POR_IA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TaskOrigin" AS ENUM ('MANUAL','TEMPLATE','RECORRENCIA','AUTOMACAO','ALERTA','IA','WHATSAPP'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AreaCode" AS ENUM ('COMERCIAL','ONBOARDING','TRAFEGO','SUCESSO_CLIENTE','WAR_ROOM','CRM_AUTOMACAO','FINANCEIRO','JURIDICO','GESTAO_INTERNA','CONTEUDO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RecurrenceFrequency" AS ENUM ('DIARIA','DIA_UTIL','SEMANAL','QUINZENAL','MENSAL','DIA_DO_MES','DIA_DA_SEMANA','POR_CLIENTE_ATIVO','POR_STATUS_CLIENTE','POR_MUDANCA_ETAPA','POR_EVENTO','POR_CONDICAO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AutomationLogStatus" AS ENUM ('SUCESSO','FALHA','DUPLICIDADE_EVITADA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CustomFieldType" AS ENUM ('TEXT','NUMBER','CURRENCY','PERCENT','DATE','BOOLEAN','SELECT','MULTISELECT','URL','USER_REF','CLIENT_REF'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Novas tabelas de hierarquia
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "TaskArea" (
  "id" TEXT NOT NULL, "code" "AreaCode" NOT NULL, "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskArea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskArea_code_key" ON "TaskArea"("code");

CREATE TABLE IF NOT EXISTS "POPProcess" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "objective" TEXT,
  "areaId" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "POPProcess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "POPProcess_code_key" ON "POPProcess"("code");

CREATE TABLE IF NOT EXISTS "POPStep" (
  "id" TEXT NOT NULL, "popId" TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "POPStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "POPFriction" (
  "id" TEXT NOT NULL, "popId" TEXT NOT NULL, "description" TEXT NOT NULL,
  CONSTRAINT "POPFriction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TaskList" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "areaId" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5) Novas colunas em Task
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "type" "TaskType" NOT NULL DEFAULT 'SIMPLES';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "origin" "TaskOrigin" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "areaId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "popId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "listId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "contractId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requesterId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedById" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "slaHours" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "slaBreached" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurrenceId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "evidence" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "blockReason" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "delayReason" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_idempotencyKey_key" ON "Task"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Task_areaId_idx" ON "Task"("areaId");
CREATE INDEX IF NOT EXISTS "Task_popId_idx" ON "Task"("popId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX IF NOT EXISTS "Task_assignedTo_idx" ON "Task"("assignedTo");
CREATE INDEX IF NOT EXISTS "Task_clientId_idx" ON "Task"("clientId");

-- ════════════════════════════════════════════════════════════════════════════
-- 6) Demais tabelas
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "TaskAuxAssignee" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "userId" TEXT NOT NULL, CONSTRAINT "TaskAuxAssignee_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskAuxAssignee_taskId_userId_key" ON "TaskAuxAssignee"("taskId","userId");
CREATE TABLE IF NOT EXISTS "TaskWatcher" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "userId" TEXT NOT NULL, CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskWatcher_taskId_userId_key" ON "TaskWatcher"("taskId","userId");
CREATE TABLE IF NOT EXISTS "TaskChecklistItem" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "label" TEXT NOT NULL, "done" BOOLEAN NOT NULL DEFAULT false, "required" BOOLEAN NOT NULL DEFAULT false, "order" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskComment" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" TEXT NOT NULL, "mentions" TEXT[] NOT NULL DEFAULT '{}', "internal" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskAttachment" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "url" TEXT NOT NULL, "filename" TEXT, "uploadedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskActivity" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "fromValue" TEXT, "toValue" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "TaskActivity"("taskId");
CREATE TABLE IF NOT EXISTS "TaskDependency" ("id" TEXT NOT NULL, "dependentId" TEXT NOT NULL, "blockingId" TEXT NOT NULL, CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskDependency_dependentId_blockingId_key" ON "TaskDependency"("dependentId","blockingId");
CREATE TABLE IF NOT EXISTS "TaskApproval" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "approverId" TEXT, "approved" BOOLEAN, "note" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskApproval_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskCustomFieldDefinition" ("id" TEXT NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL, "type" "CustomFieldType" NOT NULL, "areaId" TEXT, "popId" TEXT, "options" TEXT[] NOT NULL DEFAULT '{}', "required" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskCustomFieldDefinition_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskCustomFieldDefinition_key_key" ON "TaskCustomFieldDefinition"("key");
CREATE TABLE IF NOT EXISTS "TaskCustomFieldValue" ("id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "fieldId" TEXT NOT NULL, "value" TEXT, CONSTRAINT "TaskCustomFieldValue_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskCustomFieldValue_taskId_fieldId_key" ON "TaskCustomFieldValue"("taskId","fieldId");
CREATE TABLE IF NOT EXISTS "TaskTemplate" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "areaId" TEXT, "popId" TEXT, "defaultType" "TaskType" NOT NULL DEFAULT 'SIMPLES', "defaultPriority" "TaskPriority" NOT NULL DEFAULT 'MEDIA', "defaultStatus" "TaskStatus" NOT NULL DEFAULT 'A_FAZER', "defaultAssigneeRole" TEXT, "relativeDueDays" INTEGER, "slaHours" INTEGER, "evidenceRequired" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskTemplate_code_key" ON "TaskTemplate"("code");
CREATE TABLE IF NOT EXISTS "TaskTemplateStep" ("id" TEXT NOT NULL, "templateId" TEXT NOT NULL, "label" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true, "order" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "TaskTemplateStep_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskTemplateField" ("id" TEXT NOT NULL, "templateId" TEXT NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL, "type" "CustomFieldType" NOT NULL, "required" BOOLEAN NOT NULL DEFAULT false, "options" TEXT[] NOT NULL DEFAULT '{}', CONSTRAINT "TaskTemplateField_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskRecurrenceRule" ("id" TEXT NOT NULL, "templateId" TEXT, "frequency" "RecurrenceFrequency" NOT NULL, "dayOfWeek" INTEGER, "dayOfMonth" INTEGER, "hour" INTEGER, "minute" INTEGER DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true, "lastRunAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskRecurrenceRule_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskRecurrenceRule_templateId_key" ON "TaskRecurrenceRule"("templateId");
CREATE TABLE IF NOT EXISTS "TaskAutomationRule" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "trigger" TEXT NOT NULL, "condition" TEXT, "actionType" TEXT NOT NULL, "templateId" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskAutomationRule_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "AutomationLog" ("id" TEXT NOT NULL, "ruleId" TEXT, "recurrenceId" TEXT, "clientId" TEXT, "assigneeId" TEXT, "createdTaskId" TEXT, "status" "AutomationLogStatus" NOT NULL, "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "AutomationLog_status_idx" ON "AutomationLog"("status");
CREATE INDEX IF NOT EXISTS "AutomationLog_clientId_idx" ON "AutomationLog"("clientId");
CREATE INDEX IF NOT EXISTS "AutomationLog_createdAt_idx" ON "AutomationLog"("createdAt");
CREATE TABLE IF NOT EXISTS "TaskSavedView" ("id" TEXT NOT NULL, "ownerId" TEXT, "name" TEXT NOT NULL, "config" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskSavedView_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "OperationalRoutine" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "areaId" TEXT, "cadence" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OperationalRoutine_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "TaskSLA" ("id" TEXT NOT NULL, "scopeType" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "hours" INTEGER NOT NULL, CONSTRAINT "TaskSLA_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "TaskSLA_scopeType_scopeKey_key" ON "TaskSLA"("scopeType","scopeKey");

-- ════════════════════════════════════════════════════════════════════════════
-- 7) Foreign keys
-- ════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN ALTER TABLE "POPProcess" ADD CONSTRAINT "POPProcess_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "TaskArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "POPStep" ADD CONSTRAINT "POPStep_popId_fkey" FOREIGN KEY ("popId") REFERENCES "POPProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "POPFriction" ADD CONSTRAINT "POPFriction_popId_fkey" FOREIGN KEY ("popId") REFERENCES "POPProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "TaskArea"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "TaskArea"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_popId_fkey" FOREIGN KEY ("popId") REFERENCES "POPProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrenceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskAuxAssignee" ADD CONSTRAINT "TaskAuxAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockingId_fkey" FOREIGN KEY ("blockingId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TaskCustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "TaskArea"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_popId_fkey" FOREIGN KEY ("popId") REFERENCES "POPProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskTemplateStep" ADD CONSTRAINT "TaskTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskTemplateField" ADD CONSTRAINT "TaskTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TaskRecurrenceRule" ADD CONSTRAINT "TaskRecurrenceRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TaskAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrenceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8) Seed de referência: 7 áreas + 21 POPs (idempotente)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO "TaskArea" ("id","code","name","order") VALUES
  ('area_comercial','COMERCIAL','Captação e Comercial',1),
  ('area_onboarding','ONBOARDING','Onboarding de Cliente',2),
  ('area_trafego','TRAFEGO','Operação de Tráfego',3),
  ('area_csx','SUCESSO_CLIENTE','Sucesso do Cliente',4),
  ('area_war','WAR_ROOM','War Room e Contas Críticas',5),
  ('area_crm','CRM_AUTOMACAO','Automação e CRM',6),
  ('area_fin','FINANCEIRO','Financeiro',7)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "POPProcess" ("id","code","name","areaId") VALUES
  ('pop_cap_01','CAP-01','Prospecção e qualificação de leads comerciais','area_comercial'),
  ('pop_cap_02','CAP-02','Fechamento de contrato e definição de comissão','area_comercial'),
  ('pop_cap_03','CAP-03','Recuperação de leads frios e ex-clientes','area_comercial'),
  ('pop_onb_04','ONB-04','Configuração inicial do cliente','area_onboarding'),
  ('pop_onb_05','ONB-05','Acompanhamento dos primeiros 30 dias','area_onboarding'),
  ('pop_ope_06','OPE-06','Check-in semanal por cliente','area_trafego'),
  ('pop_ope_07','OPE-07','Prestação de contas semanal ao cliente','area_trafego'),
  ('pop_ope_08','OPE-08','Auditoria técnica de contas pelo Supervisor','area_trafego'),
  ('pop_ope_09','OPE-09','Relatório mensal consolidado ao cliente','area_trafego'),
  ('pop_csx_10','CSX-10','Validação de qualidade dos check-ins','area_csx'),
  ('pop_csx_11','CSX-11','Acompanhamento diário de demandas em atraso','area_csx'),
  ('pop_csx_12','CSX-12','Fechamento semanal e termômetro da carteira','area_csx'),
  ('pop_csx_13','CSX-13','Protocolo anti-churn proativo','area_csx'),
  ('pop_war_14','WAR-14','Abertura de War Room para conta crítica','area_war'),
  ('pop_war_15','WAR-15','Reunião de War Room e documentação de decisões','area_war'),
  ('pop_war_16','WAR-16','Acompanhamento pós-War Room até saída do crítico','area_war'),
  ('pop_crm_17','CRM-17','Classificação automática de Resultado para Etapa','area_crm'),
  ('pop_crm_18','CRM-18','Acompanhamento diário de clientes em Otimização','area_crm'),
  ('pop_fin_19','FIN-19','Controle de Contas a Receber e inadimplência','area_fin'),
  ('pop_fin_20','FIN-20','Controle de Contas a Pagar e categorização de despesas','area_fin'),
  ('pop_fin_21','FIN-21','Atualização semanal do dashboard financeiro','area_fin')
ON CONFLICT ("code") DO NOTHING;
