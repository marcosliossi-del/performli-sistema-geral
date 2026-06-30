-- BLOCO 3: seed do template recorrente de Check-in semanal (OPE-06).
-- Dado de referência, idempotente (ON CONFLICT). Não cria coluna nem tabela.

INSERT INTO "TaskTemplate"
  ("id","code","name","description","areaId","popId","defaultType","defaultPriority","defaultStatus","defaultAssigneeRole","relativeDueDays","slaHours","evidenceRequired","active","updatedAt")
VALUES
  ('tpl_ope_06','TPL-OPE-06','Check-in semanal do cliente',
   'Check-in semanal preenchido pelo gestor e validado pela CS.',
   'area_trafego','pop_ope_06','CHECKLIST_OPERACIONAL','MEDIA','A_FAZER','MANAGER',2,48,true,true,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "TaskRecurrenceRule"
  ("id","templateId","frequency","dayOfWeek","hour","minute","active","updatedAt")
VALUES
  ('rec_ope_06','tpl_ope_06','SEMANAL',1,8,0,true,CURRENT_TIMESTAMP)
ON CONFLICT ("templateId") DO NOTHING;

INSERT INTO "TaskTemplateStep" ("id","templateId","label","required","order") VALUES
  ('step_ope_06_1','tpl_ope_06','Coletar dados do Meta Ads',true,0),
  ('step_ope_06_2','tpl_ope_06','Coletar dados do GA4',true,1),
  ('step_ope_06_3','tpl_ope_06','Registrar faturamento, investimento e ROAS',true,2),
  ('step_ope_06_4','tpl_ope_06','Análise causal do resultado',true,3),
  ('step_ope_06_5','tpl_ope_06','Definir próxima ação',true,4),
  ('step_ope_06_6','tpl_ope_06','Enviar para validação da CS',true,5)
ON CONFLICT ("id") DO NOTHING;
