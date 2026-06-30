-- BLOCO 5 / OPE-07: seed do template recorrente de Prestação de contas semanal.
-- Roda na quarta-feira (após o check-in da segunda). Idempotente (ON CONFLICT).
-- Não cria coluna nem tabela — apenas dado de referência.

INSERT INTO "TaskTemplate"
  ("id","code","name","description","areaId","popId","defaultType","defaultPriority","defaultStatus","defaultAssigneeRole","relativeDueDays","slaHours","evidenceRequired","active","updatedAt")
VALUES
  ('tpl_ope_07','TPL-OPE-07','Prestação de contas semanal ao cliente',
   'Consolidar o resultado da semana e prestar contas ao cliente, com confirmação de recebimento.',
   'area_trafego','pop_ope_07','CHECKLIST_OPERACIONAL','MEDIA','A_FAZER','MANAGER',1,24,true,true,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "TaskRecurrenceRule"
  ("id","templateId","frequency","dayOfWeek","hour","minute","active","updatedAt")
VALUES
  ('rec_ope_07','tpl_ope_07','SEMANAL',3,9,0,true,CURRENT_TIMESTAMP)
ON CONFLICT ("templateId") DO NOTHING;

INSERT INTO "TaskTemplateStep" ("id","templateId","label","required","order") VALUES
  ('step_ope_07_1','tpl_ope_07','Consolidar resultados da semana (investimento, faturamento, ROAS)',true,0),
  ('step_ope_07_2','tpl_ope_07','Gerar resumo/relatório da prestação de contas',true,1),
  ('step_ope_07_3','tpl_ope_07','Enviar a prestação de contas ao cliente (WhatsApp/e-mail)',true,2),
  ('step_ope_07_4','tpl_ope_07','Confirmar recebimento pelo cliente',true,3),
  ('step_ope_07_5','tpl_ope_07','Registrar a próxima ação acordada com o cliente',false,4)
ON CONFLICT ("id") DO NOTHING;
