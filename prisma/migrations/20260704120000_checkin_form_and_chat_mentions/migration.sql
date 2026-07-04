-- Handoff do check-in: tarefa-formulário + menção da CS no chat do cliente.
-- Tudo ADITIVO (nullable / default) — sem impacto no que já existe.

-- Menção estruturada (@) nas mensagens do chat do cliente
ALTER TABLE "ClientChatMessage" ADD COLUMN "mentions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Tarefa-formulário: leva ao formulário específico (ex.: check-in) em vez de checklist
ALTER TABLE "TaskTemplate" ADD COLUMN "formType" TEXT;
ALTER TABLE "Task" ADD COLUMN "formType" TEXT;
