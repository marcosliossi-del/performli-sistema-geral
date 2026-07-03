-- Migração ClickUp→Performli: extensões ADITIVAS do Motor A de recorrência.
-- Todas as colunas são nullable ou têm default => regras/templates existentes
-- permanecem com o comportamento atual (nada é backfillado).

-- TaskTemplate: checklist bloqueante opt-in + etiquetas
ALTER TABLE "TaskTemplate" ADD COLUMN "enforceChecklist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskTemplate" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- TaskRecurrenceRule: múltiplos dias da semana, prorrogação p/ dia útil, escopo por segmento
ALTER TABLE "TaskRecurrenceRule" ADD COLUMN "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "TaskRecurrenceRule" ADD COLUMN "rollToBusinessDay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskRecurrenceRule" ADD COLUMN "businessType" "BusinessType";

-- Task: checklist bloqueante propagado do template
ALTER TABLE "Task" ADD COLUMN "enforceChecklist" BOOLEAN NOT NULL DEFAULT false;
