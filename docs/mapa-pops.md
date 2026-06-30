# Mapa de POPs — Performli

**Data:** 2026-06-30  
**Versão:** 1.0  
**Agente:** mapeador-pops  
**Score:** versão 0.30 (saída do operacional)

> Score privilegia processos que hoje só funcionam porque o Marcos lembra deles.
> `score_final = dependencia_marcos*0.30 + risco_falha_silenciosa*0.22 + impacto_churn*0.20 + valor_financeiro*0.13 + volume_frequencia*0.10 + chance_automacao*0.05`

---

## Tabela-Resumo (ranking por score_final)

| # | POP | Score | Área | Candidato MVP (Fase 1) |
|---|---|---|---|---|
| 1 | WAR-14 — Abertura de War Room para conta crítica | **4.52** | WAR | ✅ |
| 2 | WAR-16 — Acompanhamento pós-War Room até saída do crítico | **4.47** | WAR | ✅ |
| 3 | FIN-19 — Controle de Contas a Receber e inadimplência | **4.45** | FIN | ✅ |
| 4 | CSX-13 — Protocolo anti-churn proativo | **4.40** | CSX | ✅ |
| 5 | OPE-06 — Check-in semanal por cliente | **4.39** | OPE | ✅ |
| 6 | CSX-12 — Fechamento semanal e termômetro da carteira | **4.32** | CSX | ✅ |
| 7 | CRM-18 — Acompanhamento diário de clientes em Otimização | **4.19** | CRM | ✅ |
| 8 | ONB-05 — Acompanhamento dos primeiros 30 dias | **4.09** | ONB | ✅ |
| 9 | CRM-17 — Classificação automática de Resultado para Etapa | **3.94** | CRM | — |
| 10 | CSX-11 — Acompanhamento diário de demandas em atraso | **3.91** | CSX | — |
| 11 | FIN-21 — Atualização semanal do dashboard financeiro | **3.88** | FIN | — |
| 12 | CSX-10 — Validação de qualidade dos check-ins | **3.76** | CSX | — |
| 13 | OPE-07 — Prestação de contas semanal ao cliente | **3.62** | OPE | — |
| 14 | CAP-03 — Recuperação de leads frios e ex-clientes | **3.40** | CAP | — |
| 15 | WAR-15 — Reunião de War Room e documentação de decisões | **3.40** | WAR | — |
| 16 | ONB-04 — Configuração inicial do cliente no ClickUp | **3.34** | ONB | — |
| 17 | CAP-02 — Fechamento de contrato e definição de comissão | **3.28** | CAP | — |
| 18 | OPE-08 — Auditoria técnica de contas pelo Supervisor | **3.22** | OPE | — |
| 19 | OPE-09 — Relatório mensal consolidado ao cliente | **3.22** | OPE | — |
| 20 | FIN-20 — Controle de Contas a Pagar e categorização de despesas | **3.03** | FIN | — |
| 21 | CAP-01 — Prospecção e qualificação de leads comerciais | **2.78** | CAP | — |

---

## Especificações por POP

---

### WAR-14 — Abertura de War Room para conta crítica

```json
{
  "codigo": "WAR-14",
  "nome": "Abertura de War Room para conta crítica",
  "area": "WAR",
  "frase_de_sistema": "Recebe cliente em status RUIM por N dias consecutivos, abre protocolo de War Room com diagnóstico obrigatório e entrega protocolo ativo com responsável, prazo e critério mensurável de saída.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 5,
    "valor_financeiro": 4,
    "volume_frequencia": 2,
    "chance_automacao": 4,
    "score_final": 4.52
  },
  "output": ["protocolo", "tarefa", "alerta", "evidencia"],
  "input": ["clientId", "diasEmCritico", "healthScoreAtual", "ultimasMetricas", "historicoCritico"],
  "fluxo_tecnico": {
    "gatilho": "Cliente com status RUIM por ≥2 semanas consecutivas (ClientStatusStreak) OU abertura manual pelo ADMIN/CS",
    "responsavel": "CS (abertura) + MANAGER (execução) + ADMIN (escalação)",
    "status_inicial": "ABERTO",
    "regras_validacao": [
      "Diagnóstico obrigatório (campo não nulo)",
      "Critério de saída mensurável obrigatório (ex: ROAS ≥ 1.5 por 2 semanas)",
      "Responsável definido"
    ],
    "regras_sla": [
      "Abertura em até 24h após detecção de crítico",
      "Reunião de War Room em até 48h após abertura",
      "Revisão semanal obrigatória enquanto ativo"
    ],
    "caminho_aprovado": "Critério de saída atingido → protocolo encerrado com registro de resolução",
    "caminho_reprovado": "Critério não atingido → semana seguinte com novo ciclo de revisão",
    "caminho_atrasado": "Sem revisão por >7 dias → alerta para CS + ADMIN",
    "caminho_critico": "3+ semanas em War Room → escalação automática para Marcos",
    "escalacao": "3 semanas consecutivas em crítico → alerta ESCALADO para ADMIN",
    "registro_historico": "CriticalProtocol + WarRoomDecision (novo model)",
    "encerramento": "Cliente sai do status RUIM por ≥2 semanas → sugestão de encerramento"
  },
  "ferramentas_origem_destino": {
    "origem": "HealthScore (Prisma), ClientStatusStreak (Prisma)",
    "destino": "CriticalProtocol (Prisma), Alert (Prisma), Task (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "3-4h de Marcos por War Room (coordenação manual)",
    "risco_reduzido": "Saída de cliente crítico sem diagnóstico ou plano",
    "dinheiro_protegido": "Ticket médio por cliente (MRR em risco)",
    "churn_evitado": "Cada War Room mal gerenciado = ~60% de churn",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### WAR-16 — Acompanhamento pós-War Room até saída do crítico

```json
{
  "codigo": "WAR-16",
  "nome": "Acompanhamento pós-War Room até saída do crítico",
  "area": "WAR",
  "frase_de_sistema": "Recebe protocolo de War Room ativo, monitora automaticamente o progresso do critério de saída a cada semana e entrega status atualizado com alerta de regressão ou escalação.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 5,
    "valor_financeiro": 4,
    "volume_frequencia": 2,
    "chance_automacao": 3,
    "score_final": 4.47
  },
  "output": ["status", "alerta", "historico", "evidencia"],
  "input": ["protocoloId", "criterioSaida", "healthScoreAtual", "metricasSemana"],
  "fluxo_tecnico": {
    "gatilho": "Cron diário verifica CriticalProtocol com status ABERTO e ClientStatusStreak",
    "responsavel": "CS (monitoramento semanal) + MANAGER (execução das ações)",
    "status_inicial": "MONITORANDO",
    "regras_validacao": ["Revisão semanal registrada com evidência"],
    "regras_sla": ["Revisão semanal obrigatória", "3 semanas → escalação para Marcos"],
    "caminho_aprovado": "Health melhora e mantém ≥2 semanas → encerramento documentado",
    "caminho_reprovado": "Health não melhora → nova semana + avaliação de escalação",
    "caminho_atrasado": "Sem revisão em 7 dias → alerta CS/ADMIN",
    "caminho_critico": "3+ semanas sem melhora → nível ESCALADO",
    "escalacao": "ADMIN notificado com histórico completo do protocolo",
    "registro_historico": "CriticalProtocol.decisoes[] + HealthScore histórico",
    "encerramento": "Protocolo fecha com registro de data de saída e causa"
  },
  "ferramentas_origem_destino": {
    "origem": "CriticalProtocol (Prisma), HealthScore (Prisma), MetricSnapshot (Prisma)",
    "destino": "Alert (Prisma), Task (Prisma), CriticalProtocol (atualização)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h/War Room de acompanhamento manual",
    "risco_reduzido": "War Room esquecida, cliente sai sem que ninguém perceba",
    "dinheiro_protegido": "MRR de cada conta crítica",
    "churn_evitado": "Acompanhamento ativo reduz taxa de churn pós-War Room em ~40%",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### FIN-19 — Controle de Contas a Receber e inadimplência

```json
{
  "codigo": "FIN-19",
  "nome": "Controle de Contas a Receber e inadimplência",
  "area": "FIN",
  "frase_de_sistema": "Recebe dados do Asaas (pagamentos e assinaturas), calcula inadimplência por cliente e entrega fila priorizada de cobranças com valor, dias em atraso, histórico e status de cobrança.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 3,
    "valor_financeiro": 5,
    "volume_frequencia": 4,
    "chance_automacao": 4,
    "score_final": 4.45
  },
  "output": ["dashboard", "fila", "alerta", "historico"],
  "input": ["asaasPayments", "asaasSubscriptions", "clientId", "valorFee", "dataVencimento"],
  "fluxo_tecnico": {
    "gatilho": "Cron diário (sync Asaas) + verificação de faturas vencidas",
    "responsavel": "ADMIN (ação de cobrança) + CS (escalação)",
    "status_inicial": "VERIFICANDO",
    "regras_validacao": [
      "Todo cliente ativo deve ter assinatura ativa no Asaas",
      "Fatura vencida há >3 dias gera alerta automático"
    ],
    "regras_sla": [
      "D+3: alerta automático",
      "D+7: cobrança WhatsApp automatizada",
      "D+15: pausa de serviço sugerida",
      "D+30: escalação para Marcos + CS"
    ],
    "caminho_aprovado": "Pagamento confirmado → alerta encerrado + histórico atualizado",
    "caminho_reprovado": "Não pago → régua de cobrança avança",
    "caminho_atrasado": "D+15 sem resposta → tarefa para ADMIN decidir pausa",
    "caminho_critico": "D+30 → escalação com histórico completo",
    "escalacao": "ADMIN + CS notificados com valor total em risco",
    "registro_historico": "AsaasPayment (Prisma) + AuditLog de cobrança",
    "encerramento": "Pagamento confirmado via webhook Asaas"
  },
  "ferramentas_origem_destino": {
    "origem": "Asaas API (AsaasPayment, AsaasSubscription)",
    "destino": "Alert (Prisma), Task (Prisma), WhatsApp (Z-API/Evolution)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "3-4h de Marcos toda segunda verificando planilha",
    "risco_reduzido": "Cliente inadimplente há semanas sem cobrança ativa",
    "dinheiro_protegido": "MRR total em risco de inadimplência",
    "churn_evitado": "Cobrança tardia gera atrito → risco de cancelamento",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CSX-13 — Protocolo anti-churn proativo

```json
{
  "codigo": "CSX-13",
  "nome": "Protocolo anti-churn proativo",
  "area": "CSX",
  "frase_de_sistema": "Recebe ChurnRiskScore acima do limiar, identifica clientes em risco silencioso e entrega fila de ação proativa com histórico de sinais, sugestão de abordagem e responsável.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 5,
    "valor_financeiro": 4,
    "volume_frequencia": 3,
    "chance_automacao": 4,
    "score_final": 4.40
  },
  "output": ["fila", "alerta", "tarefa", "historico"],
  "input": ["churnRiskScore", "clientId", "ultimasInteracoes", "healthScoreHistorico", "statusAtual"],
  "fluxo_tecnico": {
    "gatilho": "ChurnRiskScore semanal ≥ 60 OU combinação: RUIM por 2 semanas + sem interação há 14 dias",
    "responsavel": "CS (ação proativa) + MANAGER (contato com cliente)",
    "status_inicial": "EM_RISCO",
    "regras_validacao": ["Ação proativa registrada como ClientInteraction"],
    "regras_sla": ["Ação em até 48h após sinal de churn", "Follow-up em 7 dias"],
    "caminho_aprovado": "Cliente responde positivamente + score desce → encerrado",
    "caminho_reprovado": "Score mantém ou sobe → War Room sugerida",
    "caminho_atrasado": "Sem ação em 48h → alerta ADMIN",
    "caminho_critico": "Score ≥ 80 → abertura automática de War Room sugerida",
    "escalacao": "Score ≥ 80 ou 3 semanas sem melhora → ADMIN",
    "registro_historico": "ChurnRiskScore histórico + ClientInteraction de anti-churn",
    "encerramento": "Score < 40 por 2 semanas consecutivas"
  },
  "ferramentas_origem_destino": {
    "origem": "ChurnRiskScore (Prisma), HealthScore (Prisma), ClientInteraction (Prisma)",
    "destino": "Task (Prisma), Alert (Prisma), CriticalProtocol (se score ≥ 80)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h de Marcos identificando quais clientes estão em risco",
    "risco_reduzido": "Churn silencioso de cliente aparentemente OK",
    "dinheiro_protegido": "MRR de cada cliente em risco",
    "churn_evitado": "Ação proativa reduz churn em ~35% vs. reativo",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### OPE-06 — Check-in semanal por cliente

```json
{
  "codigo": "OPE-06",
  "nome": "Check-in semanal por cliente",
  "area": "OPE",
  "frase_de_sistema": "Recebe dados das plataformas (Meta, GA4, Google Ads, Nuvemshop) toda semana, valida preenchimento e qualidade pelo gestor e entrega check-in estruturado pronto para revisão da CS.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 5,
    "valor_financeiro": 3,
    "volume_frequencia": 5,
    "chance_automacao": 4,
    "score_final": 4.39
  },
  "output": ["checklist", "fila", "alerta", "historico"],
  "input": ["clientId", "managerId", "metricasSemana", "comentarioGestor", "statusCampanha"],
  "fluxo_tecnico": {
    "gatilho": "Segunda-feira: WeeklyChecklist gerado automaticamente para cada gestor",
    "responsavel": "MANAGER (preenchimento até quarta) + CS (revisão até sexta)",
    "status_inicial": "PENDENTE",
    "regras_validacao": [
      "Campos obrigatórios por tipo de negócio (ECOMMERCE vs LOCAL)",
      "Comentário não pode ser cópia da semana anterior",
      "Resultado precisa ter evidência (número ou % de variação)"
    ],
    "regras_sla": [
      "Prazo de preenchimento: quarta-feira 18h",
      "Prazo de revisão CS: sexta-feira 12h"
    ],
    "caminho_aprovado": "CS aprova → check-in arquivado + cliente recebe prestação de contas",
    "caminho_reprovado": "CS reprova com motivo → gestor corrige em até 24h",
    "caminho_atrasado": "Sem preenchimento até quarta 18h → alerta automático para gestor + CS",
    "caminho_critico": "Sem preenchimento até quinta → alerta ADMIN",
    "escalacao": "2 semanas sem check-in → ADMIN + risco de churn sinalizado",
    "registro_historico": "WeeklyChecklist (Prisma) + histórico de reprovações por gestor",
    "encerramento": "Check-in aprovado pela CS"
  },
  "ferramentas_origem_destino": {
    "origem": "MetricSnapshot (Meta, GA4, Google Ads, Nuvemshop via cron)",
    "destino": "WeeklyChecklist (Prisma), Alert (Prisma), WeeklyReport (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "5h de coordenação manual (Marcos + CS verificando um a um)",
    "risco_reduzido": "Cliente sem check-in por semanas sem ninguém perceber",
    "dinheiro_protegido": "Qualidade operacional do serviço prestado",
    "churn_evitado": "Check-in mal feito ou não enviado = perda de percepção de valor",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CSX-12 — Fechamento semanal e termômetro da carteira

```json
{
  "codigo": "CSX-12",
  "nome": "Fechamento semanal e termômetro da carteira",
  "area": "CSX",
  "frase_de_sistema": "Recebe todos os check-ins, health scores e interações da semana, gera termômetro da carteira com variação e entrega resumo operacional para Marcos e CS com alertas de tendência negativa.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 5,
    "valor_financeiro": 3,
    "volume_frequencia": 4,
    "chance_automacao": 3,
    "score_final": 4.32
  },
  "output": ["dashboard", "relatorio", "alerta", "historico"],
  "input": ["healthScoresSemana", "checkInsSemana", "interacoesSemana", "statusAnterior"],
  "fluxo_tecnico": {
    "gatilho": "Sexta-feira: após aprovação de todos os check-ins",
    "responsavel": "CS (geração + validação) + ADMIN (recebimento do termômetro)",
    "status_inicial": "GERANDO",
    "regras_validacao": ["Termômetro só fecha se todos os check-ins estiverem revisados"],
    "regras_sla": ["Fechamento até sexta 18h", "Histórico deve ser pesquisável por semana"],
    "caminho_aprovado": "Termômetro gerado e confirmado → enviado para Marcos",
    "caminho_reprovado": "Check-ins pendentes → termômetro bloqueado",
    "caminho_atrasado": "Sem fechamento até sexta 18h → alerta CS + ADMIN",
    "caminho_critico": "3+ clientes críticos na mesma semana → alerta especial",
    "escalacao": "Tendência de piora por 2 semanas → revisão com Marcos",
    "registro_historico": "ClientStatusStreak + HealthScore histórico + WeeklyReport",
    "encerramento": "Termômetro registrado com carimbo de data/hora"
  },
  "ferramentas_origem_destino": {
    "origem": "HealthScore (Prisma), WeeklyChecklist (Prisma), ClientInteraction (Prisma)",
    "destino": "WeeklyReport (Prisma), Alert (Prisma), WhatsApp digest"
  },
  "valor_interno": {
    "tempo_economizado_semana": "3h de Marcos toda sexta fazendo varredura manual da carteira",
    "risco_reduzido": "Semana fecha sem visão do estado real da carteira",
    "dinheiro_protegido": "Detecção precoce de tendências negativas",
    "churn_evitado": "Visibilidade antecipada de clientes em risco",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CRM-18 — Acompanhamento diário de clientes em Otimização

```json
{
  "codigo": "CRM-18",
  "nome": "Acompanhamento diário de clientes em Otimização",
  "area": "CRM",
  "frase_de_sistema": "Recebe lista de clientes em etapa Otimização, verifica se houve comentário ou ação no dia e entrega fila de pendências para o Red com dias sem atividade e severidade.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 4,
    "valor_financeiro": 3,
    "volume_frequencia": 5,
    "chance_automacao": 4,
    "score_final": 4.19
  },
  "output": ["fila", "alerta", "historico"],
  "input": ["clientePipelineStage", "ultimaInteracao", "diasSemAtividade"],
  "fluxo_tecnico": {
    "gatilho": "Cron diário: verifica clientes com pipelineStage = OTIMIZACAO sem interação há >1 dia",
    "responsavel": "Red (acompanhamento diário) + MANAGER (ações) + ADMIN (escalação)",
    "status_inicial": "MONITORANDO",
    "regras_validacao": ["Comentário diário obrigatório enquanto em Otimização"],
    "regras_sla": ["1 dia sem comentário → alerta leve", "3 dias → alerta grave", "7 dias → escalação"],
    "caminho_aprovado": "Cliente sai de Otimização → registro de alta + motivo",
    "caminho_reprovado": "Sem melhora em 2 semanas → sugestão de War Room",
    "caminho_atrasado": "3 dias sem atividade → alerta Red + ADMIN",
    "caminho_critico": "7 dias sem atividade → escalação Marcos",
    "escalacao": "ADMIN notificado com lista de clientes em Otimização sem ação",
    "registro_historico": "ClientInteraction (Prisma) + histórico de Otimização por cliente",
    "encerramento": "Cliente muda de etapa (saiu de Otimização)"
  },
  "ferramentas_origem_destino": {
    "origem": "Client.pipelineStage (Prisma), ClientInteraction (Prisma)",
    "destino": "Alert (Prisma), Task (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos cobrando Red diariamente",
    "risco_reduzido": "Cliente em Otimização esquecido por dias vira crítico",
    "dinheiro_protegido": "MRR de clientes em Otimização",
    "churn_evitado": "Otimização sem ação → crítico → churn em 2-4 semanas",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### ONB-05 — Acompanhamento dos primeiros 30 dias

```json
{
  "codigo": "ONB-05",
  "nome": "Acompanhamento dos primeiros 30 dias",
  "area": "ONB",
  "frase_de_sistema": "Recebe cliente novo com data de início operacional, monitora milestones dos primeiros 30 dias e entrega painel de onboarding com sinais de risco, pendências e revisão do dia 30.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 5,
    "valor_financeiro": 3,
    "volume_frequencia": 2,
    "chance_automacao": 4,
    "score_final": 4.09
  },
  "output": ["dashboard", "checklist", "alerta", "historico"],
  "input": ["clientId", "dataInicioOperacional", "metasIniciais", "healthScoreAtual"],
  "fluxo_tecnico": {
    "gatilho": "Cliente com status ONBOARDING ou data início < 30 dias",
    "responsavel": "MANAGER (execução) + CS (monitoramento) + ADMIN (revisão dia 30)",
    "status_inicial": "ONBOARDING",
    "regras_validacao": [
      "Metas iniciais devem estar cadastradas até dia 7",
      "Primeiro check-in até dia 7",
      "Revisão do dia 30 obrigatória"
    ],
    "regras_sla": [
      "D+7: primeiro check-in + metas cadastradas",
      "D+14: primeiro relatório",
      "D+30: revisão formal + NPS/satisfação"
    ],
    "caminho_aprovado": "Dia 30 com resultado OK → cliente passa para operação normal",
    "caminho_reprovado": "Resultado ruim no dia 30 → cliente entra em protocolo de atenção",
    "caminho_atrasado": "Milestone não cumprido → alerta CS",
    "caminho_critico": "Health RUIM nos primeiros 30 dias → alerta ADMIN + ação imediata",
    "escalacao": "Health RUIM por 2+ semanas nos primeiros 30 dias → Marcos",
    "registro_historico": "WeeklyChecklist + HealthScore + ClientInteraction do período",
    "encerramento": "Revisão do dia 30 registrada e aprovada"
  },
  "ferramentas_origem_destino": {
    "origem": "Client.startDate (Prisma), HealthScore (Prisma), Goal (Prisma)",
    "destino": "Alert (Prisma), Task (Prisma), WeeklyReport (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h de Marcos monitorando novos clientes manualmente",
    "risco_reduzido": "Novo cliente com resultado ruim nos primeiros 30 dias sem ninguém perceber",
    "dinheiro_protegido": "LTV de clientes novos (primeiros 30 dias = maior risco de churn precoce)",
    "churn_evitado": "Onboarding mal acompanhado = churn em 60-90 dias",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CRM-17 — Classificação automática de Resultado para Etapa

```json
{
  "codigo": "CRM-17",
  "nome": "Classificação automática de Resultado para Etapa",
  "area": "CRM",
  "frase_de_sistema": "Recebe health score atualizado de cada cliente, classifica automaticamente na etapa correspondente (Escala, Monitoramento, Otimização) e entrega fila de movimentações da semana com justificativa.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 4,
    "valor_financeiro": 3,
    "volume_frequencia": 5,
    "chance_automacao": 5,
    "score_final": 3.94
  },
  "output": ["status", "historico", "alerta"],
  "input": ["healthStatus", "clientId", "pipelineStageAtual"],
  "fluxo_tecnico": {
    "gatilho": "Após recálculo diário do HealthScore (cron daily)",
    "responsavel": "Sistema (automático) + Red (validação de movimentações)",
    "status_inicial": "CLASSIFICANDO",
    "regras_validacao": [
      "OTIMO ≥ 2 semanas → ESCALA",
      "REGULAR → MONITORAMENTO",
      "RUIM → OTIMIZACAO ou CRITICO"
    ],
    "regras_sla": ["Classificação em até 1h após recálculo do health score"],
    "caminho_aprovado": "Etapa correta → registro de movimentação com data e motivo",
    "caminho_reprovado": "Health RUIM e etapa ainda ESCALA → alerta de divergência",
    "caminho_atrasado": "n/a (automático)",
    "caminho_critico": "RUIM por 2+ semanas sem mudar de etapa → alerta ADMIN",
    "escalacao": "Divergência entre etapa e resultado por >3 dias → ADMIN",
    "registro_historico": "ClientStatusStreak + histórico de etapas por cliente",
    "encerramento": "Etapa atualizada com log de movimentação"
  },
  "ferramentas_origem_destino": {
    "origem": "HealthScore (Prisma), ClientStatusStreak (Prisma)",
    "destino": "Client.pipelineStage (Prisma), Alert (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Red classificando clientes manualmente no ClickUp",
    "risco_reduzido": "Cliente ruim permanece em etapa errada, sem ação apropriada",
    "dinheiro_protegido": "Detecção precoce de clientes em deterioração",
    "churn_evitado": "Classificação correta → ação certa → cliente mantido",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CSX-11 — Acompanhamento diário de demandas em atraso

```json
{
  "codigo": "CSX-11",
  "nome": "Acompanhamento diário de demandas em atraso",
  "area": "CSX",
  "frase_de_sistema": "Recebe todas as tarefas com prazo vencido ou status parado, consolida por responsável e entrega fila de pendências com SLA violado, cliente afetado e impacto.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 3,
    "valor_financeiro": 2,
    "volume_frequencia": 5,
    "chance_automacao": 5,
    "score_final": 3.91
  },
  "output": ["fila", "alerta", "historico"],
  "input": ["taskId", "dueDate", "assigneeId", "clientId", "status"],
  "fluxo_tecnico": {
    "gatilho": "Cron diário: Task/Operation com dueDate < hoje e status != DONE",
    "responsavel": "CS (monitoramento) + MANAGER (execução) + ADMIN (escalação)",
    "status_inicial": "ATRASADA",
    "regras_validacao": ["Toda demanda atrasada deve ter justificativa ou novo prazo"],
    "regras_sla": ["D+1: alerta leve", "D+3: alerta grave", "D+7: escalação ADMIN"],
    "caminho_aprovado": "Tarefa concluída com evidência → removida da fila",
    "caminho_reprovado": "Tarefa redatada sem evidência → permanece na fila com novo prazo",
    "caminho_atrasado": "D+3 sem ação → alerta CS + gestor responsável",
    "caminho_critico": "D+7 → escalação ADMIN com impacto em cliente",
    "escalacao": "Mesma demanda atrasada por 2+ semanas → ADMIN",
    "registro_historico": "Task histórico + AuditLog de SLA violado",
    "encerramento": "Tarefa concluída com evidência registrada"
  },
  "ferramentas_origem_destino": {
    "origem": "Task (Prisma), Operation (Prisma)",
    "destino": "Alert (Prisma), WhatsApp (notificação ao gestor)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h de CS fazendo varredura manual de ClickUp",
    "risco_reduzido": "Demanda atrasada esquecida por dias",
    "dinheiro_protegido": "Qualidade do serviço prestado",
    "churn_evitado": "Demandas atrasadas reincidentes → insatisfação → churn",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### FIN-21 — Atualização semanal do dashboard financeiro

```json
{
  "codigo": "FIN-21",
  "nome": "Atualização semanal do dashboard financeiro",
  "area": "FIN",
  "frase_de_sistema": "Recebe dados do Asaas e despesas cadastradas, calcula MRR previsto vs realizado, margem, inadimplência e saldo previsto, e entrega snapshot financeiro semanal com variação e alerta de desvio.",
  "score_priorizacao": {
    "dependencia_marcos": 5,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 1,
    "valor_financeiro": 5,
    "volume_frequencia": 4,
    "chance_automacao": 5,
    "score_final": 3.88
  },
  "output": ["dashboard", "relatorio", "alerta"],
  "input": ["asaasPayments", "asaasSubscriptions", "expenses", "financialCategories"],
  "fluxo_tecnico": {
    "gatilho": "Segunda-feira: cron gera snapshot financeiro semanal",
    "responsavel": "Sistema (geração automática) + ADMIN (revisão)",
    "status_inicial": "CALCULANDO",
    "regras_validacao": ["Toda despesa precisa ter categoria antes de entrar no DRE"],
    "regras_sla": ["Snapshot disponível até segunda 10h", "Alerta se dados desatualizados > 24h"],
    "caminho_aprovado": "Snapshot gerado com todos os dados → exibido no dashboard",
    "caminho_reprovado": "Despesa sem categoria → alertada separadamente para categorização",
    "caminho_atrasado": "Dados desatualizados → alerta de 'última atualização há X horas'",
    "caminho_critico": "MRR realizado < MRR previsto por >10% → alerta especial",
    "escalacao": "Margem abaixo da meta → alerta ADMIN",
    "registro_historico": "FinancialSnapshot (novo model sugerido) por semana",
    "encerramento": "Snapshot semanal registrado e acessível para histórico"
  },
  "ferramentas_origem_destino": {
    "origem": "AsaasPayment (Prisma), AsaasSubscription (Prisma), Expense (Prisma)",
    "destino": "Dashboard financeiro, Alert (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "3h de Marcos toda segunda atualizando planilha financeira",
    "risco_reduzido": "Decisões baseadas em dados financeiros desatualizados",
    "dinheiro_protegido": "Controle de margem e fluxo de caixa",
    "churn_evitado": "n/a — impacto direto na saúde financeira da agência",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CSX-10 — Validação de qualidade dos check-ins

```json
{
  "codigo": "CSX-10",
  "nome": "Validação de qualidade dos check-ins",
  "area": "CSX",
  "frase_de_sistema": "Recebe check-ins preenchidos pelos gestores, valida qualidade e completude com critérios objetivos e entrega fila de revisão para a CS com destaque para reprovações e padrões recorrentes de falha.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 5,
    "impacto_churn": 4,
    "valor_financeiro": 2,
    "volume_frequencia": 5,
    "chance_automacao": 4,
    "score_final": 3.76
  },
  "output": ["fila", "alerta", "historico"],
  "input": ["weeklyChecklistId", "checkInFields", "managerId", "clientId"],
  "fluxo_tecnico": {
    "gatilho": "Gestor submete check-in → validação automática de campos obrigatórios",
    "responsavel": "Sistema (validação automática) + CS (revisão qualitativa)",
    "status_inicial": "AGUARDANDO_REVISAO",
    "regras_validacao": [
      "Campos obrigatórios preenchidos",
      "Resultado diferente da semana anterior",
      "Comentário com ≥ 50 caracteres",
      "Evidência numérica presente"
    ],
    "regras_sla": ["Revisão CS em até 48h após submissão"],
    "caminho_aprovado": "CS aprova → check-in arquivado",
    "caminho_reprovado": "CS reprova com motivo → gestor notificado para corrigir em 24h",
    "caminho_atrasado": "Sem revisão CS em 48h → alerta ADMIN",
    "caminho_critico": "Gestor com >3 reprovações no mês → alerta de padrão para ADMIN",
    "escalacao": "Padrão de reprovação recorrente → reunião individual sugerida",
    "registro_historico": "WeeklyChecklist.status + histórico de reprovações por gestor",
    "encerramento": "Check-in aprovado pela CS"
  },
  "ferramentas_origem_destino": {
    "origem": "WeeklyChecklist (Prisma)",
    "destino": "Alert (Prisma), WeeklyReport (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h de CS revisando check-ins sem sistema de fila",
    "risco_reduzido": "Check-in ruim passa para o cliente sem revisão",
    "dinheiro_protegido": "Qualidade percebida do serviço",
    "churn_evitado": "Check-in repetitivo ou vazio → percepção de descaso → churn",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### OPE-07 — Prestação de contas semanal ao cliente

```json
{
  "codigo": "OPE-07",
  "nome": "Prestação de contas semanal ao cliente",
  "area": "OPE",
  "frase_de_sistema": "Recebe check-in aprovado pela CS, gera relatório semanal formatado e entrega ao gestor para envio ao cliente com status de confirmação de recebimento.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 4,
    "valor_financeiro": 3,
    "volume_frequencia": 5,
    "chance_automacao": 3,
    "score_final": 3.62
  },
  "output": ["relatorio", "status", "historico"],
  "input": ["weeklyChecklistId", "clientId", "managerId"],
  "fluxo_tecnico": {
    "gatilho": "Check-in aprovado pela CS → WeeklyReport gerado automaticamente por IA",
    "responsavel": "Sistema (geração) + MANAGER (envio + pergunta de ativação)",
    "status_inicial": "GERADO",
    "regras_validacao": ["Relatório deve ser enviado em até 24h após aprovação do check-in"],
    "regras_sla": ["Envio até sexta 18h"],
    "caminho_aprovado": "Relatório enviado → registro de envio com data/hora",
    "caminho_reprovado": "n/a (relatório vai para revisão se gestor não enviar)",
    "caminho_atrasado": "Sem envio em 24h após aprovação → alerta gestor + CS",
    "caminho_critico": "Sem prestação de contas por 2 semanas → alerta ADMIN",
    "escalacao": "2+ semanas sem envio ao cliente → ADMIN",
    "registro_historico": "WeeklyReport (Prisma) + data de envio",
    "encerramento": "Relatório enviado ao cliente com confirmação"
  },
  "ferramentas_origem_destino": {
    "origem": "WeeklyChecklist aprovado (Prisma), IA (claude-sonnet)",
    "destino": "WeeklyReport (Prisma), WhatsApp (Z-API/Evolution), E-mail (Resend)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h de gestores formatando relatórios manualmente",
    "risco_reduzido": "Semana sem prestação de contas ao cliente",
    "dinheiro_protegido": "Percepção de valor → renovação de contrato",
    "churn_evitado": "Cliente sem retorno semanal questiona o serviço",
    "tira_da_cabeca_do_marcos": false
  }
}
```

---

### CAP-03 — Recuperação de leads frios e ex-clientes

```json
{
  "codigo": "CAP-03",
  "nome": "Recuperação de leads frios e ex-clientes",
  "area": "CAP",
  "frase_de_sistema": "Recebe leads com último contato >30 dias e ex-clientes elegíveis para reativação, gera fila de recuperação priorizada e entrega cadência de follow-up com sugestão de abordagem.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 2,
    "valor_financeiro": 4,
    "volume_frequencia": 2,
    "chance_automacao": 4,
    "score_final": 3.40
  },
  "output": ["fila", "tarefa", "historico"],
  "input": ["agencyLeadId", "ultimoContato", "statusAnterior", "motivoPerda"],
  "fluxo_tecnico": {
    "gatilho": "AgencyLead sem contato há >30 dias OU ex-cliente com cancelamento há >90 dias",
    "responsavel": "ADMIN/Marcos (ação de recuperação)",
    "status_inicial": "FRIO",
    "regras_validacao": ["Tentativa de recuperação registrada como AgencyActivity"],
    "regras_sla": ["Contato em até 7 dias após entrada na fila"],
    "caminho_aprovado": "Lead responde positivamente → retorna ao pipeline",
    "caminho_reprovado": "Sem resposta após 3 tentativas → arquivado com motivo",
    "caminho_atrasado": "Sem ação em 7 dias → alerta ADMIN",
    "caminho_critico": "n/a",
    "escalacao": "Lead com alto ticket potencial → Marcos diretamente",
    "registro_historico": "AgencyActivity histórico + motivo de perda original",
    "encerramento": "Lead convertido ou arquivado definitivamente"
  },
  "ferramentas_origem_destino": {
    "origem": "AgencyLead (Prisma), Client (ex-clientes cancelados)",
    "destino": "AgencyActivity (Prisma), WhatsApp, Task (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos lembrando de quem não respondeu",
    "risco_reduzido": "Oportunidade de recuperação perdida por esquecimento",
    "dinheiro_protegido": "MRR potencial de reativação",
    "churn_evitado": "n/a (é captação/recuperação)",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### WAR-15 — Reunião de War Room e documentação de decisões

```json
{
  "codigo": "WAR-15",
  "nome": "Reunião de War Room e documentação de decisões",
  "area": "WAR",
  "frase_de_sistema": "Recebe pauta de War Room gerada pelo sistema, estrutura registro de decisões e entrega tarefas vinculadas a cada decisão com responsável, prazo e critério de evidência.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 3,
    "impacto_churn": 4,
    "valor_financeiro": 3,
    "volume_frequencia": 2,
    "chance_automacao": 3,
    "score_final": 3.40
  },
  "output": ["tarefa", "historico", "evidencia"],
  "input": ["protocoloId", "pauta", "participantes", "decisoes"],
  "fluxo_tecnico": {
    "gatilho": "War Room aberta (WAR-14) → reunião agendada em até 48h",
    "responsavel": "ADMIN (facilita) + MANAGER (executa) + CS (documenta)",
    "status_inicial": "REUNIAO_AGENDADA",
    "regras_validacao": [
      "Toda decisão precisa ter responsável e prazo",
      "Critério de saída precisa ser revisado ou confirmado"
    ],
    "regras_sla": ["Ata da reunião em até 24h após realização"],
    "caminho_aprovado": "Ata registrada + tarefas criadas → War Room em execução",
    "caminho_reprovado": "Reunião sem ata → alerta automático para CS",
    "caminho_atrasado": "Reunião não realizada em 48h → alerta ADMIN",
    "caminho_critico": "n/a",
    "escalacao": "Decisão de responsabilidade de Marcos não executada → escalação",
    "registro_historico": "CriticalProtocol.decisoes[] (novo campo/model sugerido)",
    "encerramento": "Todas as tarefas da reunião concluídas"
  },
  "ferramentas_origem_destino": {
    "origem": "CriticalProtocol (Prisma)",
    "destino": "Task (Prisma), CriticalProtocol (atualização)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de CS/Marcos documentando decisões manualmente",
    "risco_reduzido": "Decisões ficam no WhatsApp e não viram tarefas reais",
    "dinheiro_protegido": "Execução do plano de salvamento do cliente",
    "churn_evitado": "Decisão sem follow-up = War Room ineficaz",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### ONB-04 — Configuração inicial do cliente no ClickUp

```json
{
  "codigo": "ONB-04",
  "nome": "Configuração inicial do cliente no ClickUp",
  "area": "ONB",
  "frase_de_sistema": "Recebe novo cliente fechado, gera checklist de configuração inicial com itens obrigatórios e entrega painel de onboarding com itens pendentes e responsável por cada um.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 3,
    "valor_financeiro": 2,
    "volume_frequencia": 2,
    "chance_automacao": 4,
    "score_final": 3.34
  },
  "output": ["checklist", "alerta", "historico"],
  "input": ["clientId", "dataFechamento", "feeContratado", "gestorAtribuido"],
  "fluxo_tecnico": {
    "gatilho": "Novo cliente criado com status ONBOARDING",
    "responsavel": "MANAGER (configuração) + ADMIN (validação)",
    "status_inicial": "CONFIGURANDO",
    "regras_validacao": [
      "Gestor atribuído",
      "Fee cadastrado no financeiro (Asaas)",
      "Contrato vinculado",
      "Plataformas conectadas",
      "Metas iniciais cadastradas"
    ],
    "regras_sla": ["Configuração completa em até 3 dias após fechamento"],
    "caminho_aprovado": "Todos os itens checados → cliente passa para ONB-05",
    "caminho_reprovado": "Item obrigatório faltando → alerta ADMIN",
    "caminho_atrasado": "Configuração incompleta após 3 dias → alerta ADMIN",
    "caminho_critico": "Cliente operacional sem metas → risco de primeiro check-in inválido",
    "escalacao": "Configuração incompleta após 5 dias → Marcos",
    "registro_historico": "WeeklyChecklist de onboarding (ou OnboardingChecklist novo model)",
    "encerramento": "Todos os itens do checklist concluídos"
  },
  "ferramentas_origem_destino": {
    "origem": "Client (Prisma), Contract (Prisma)",
    "destino": "Task (Prisma), Alert (Prisma), Goal (Prisma), AsaasSubscription (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos verificando se onboarding foi feito",
    "risco_reduzido": "Cliente novo sem estrutura opera às cegas na primeira semana",
    "dinheiro_protegido": "Risco de churn precoce por onboarding mal feito",
    "churn_evitado": "Onboarding incompleto → percepção de desorganização → churn em 60 dias",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CAP-02 — Fechamento de contrato e definição de comissão

```json
{
  "codigo": "CAP-02",
  "nome": "Fechamento de contrato e definição de comissão",
  "area": "CAP",
  "frase_de_sistema": "Recebe lead convertido em cliente, valida existência de contrato, fee cadastrado e comissão definida, e entrega checklist de fechamento completo para iniciar onboarding.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 1,
    "valor_financeiro": 5,
    "volume_frequencia": 2,
    "chance_automacao": 3,
    "score_final": 3.28
  },
  "output": ["checklist", "alerta", "historico"],
  "input": ["agencyLeadId", "valorFee", "motivoDescontoFee", "comissaoUnica", "comissaoRecorrente"],
  "fluxo_tecnico": {
    "gatilho": "AgencyLead convertido para Client",
    "responsavel": "ADMIN (validação do contrato) + responsável comercial (comissão)",
    "status_inicial": "AGUARDANDO_CONTRATO",
    "regras_validacao": [
      "Contrato vinculado ao cliente",
      "Fee cadastrado no Asaas",
      "Comissão definida (ou motivo de isenção)",
      "Se fee abaixo do padrão: justificativa obrigatória"
    ],
    "regras_sla": ["Contrato em até 3 dias após fechamento verbal"],
    "caminho_aprovado": "Checklist completo → ONB-04 iniciado",
    "caminho_reprovado": "Item faltando → bloqueio de onboarding + alerta ADMIN",
    "caminho_atrasado": "Sem contrato em 3 dias → alerta ADMIN",
    "caminho_critico": "Cliente operacional sem contrato → alerta crítico ADMIN",
    "escalacao": "Sem contrato após 7 dias → Marcos",
    "registro_historico": "Contract (Prisma) + AgencyActivity de fechamento",
    "encerramento": "Contrato assinado + fee ativo no Asaas"
  },
  "ferramentas_origem_destino": {
    "origem": "AgencyLead (Prisma)",
    "destino": "Contract (Prisma), Client (Prisma), AsaasSubscription (Prisma), Task (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos verificando se contrato foi assinado",
    "risco_reduzido": "Cliente operacional sem contrato ou sem fee cadastrado",
    "dinheiro_protegido": "Receita do novo cliente + comissão do responsável",
    "churn_evitado": "n/a",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### OPE-08 — Auditoria técnica de contas pelo Supervisor

```json
{
  "codigo": "OPE-08",
  "nome": "Auditoria técnica de contas pelo Supervisor",
  "area": "OPE",
  "frase_de_sistema": "Recebe contas de clientes elegíveis para auditoria mensal, gera checklist técnico por tipo de negócio e entrega relatório de auditoria com problemas encontrados e ações combinadas.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 4,
    "impacto_churn": 3,
    "valor_financeiro": 3,
    "volume_frequencia": 3,
    "chance_automacao": 3,
    "score_final": 3.22
  },
  "output": ["checklist", "relatorio", "tarefa"],
  "input": ["clientId", "tipoBusiness", "platformAccounts", "ultimaAuditoria"],
  "fluxo_tecnico": {
    "gatilho": "Mensal: clientes sem auditoria há >30 dias",
    "responsavel": "Supervisor (auditoria) + MANAGER (execução de correções)",
    "status_inicial": "AGENDADA",
    "regras_validacao": ["Auditoria precisa ter resultado documentado e ação definida"],
    "regras_sla": ["1 auditoria por cliente por mês"],
    "caminho_aprovado": "Auditoria realizada sem problemas críticos → registro",
    "caminho_reprovado": "Problemas encontrados → tarefas geradas automaticamente",
    "caminho_atrasado": "Sem auditoria há >45 dias → alerta ADMIN",
    "caminho_critico": "Problema crítico encontrado → alerta imediato ADMIN",
    "escalacao": "Problema crítico sem solução em 48h → ADMIN + Marcos",
    "registro_historico": "Operation de auditoria + Task de correções",
    "encerramento": "Auditoria concluída com registro de achados"
  },
  "ferramentas_origem_destino": {
    "origem": "PlatformAccount (Prisma), MetricSnapshot (Prisma)",
    "destino": "Operation (Prisma), Task (Prisma), Alert (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de supervisor organizando auditorias manualmente",
    "risco_reduzido": "Problema técnico de conta não detectado por meses",
    "dinheiro_protegido": "Performance das campanhas dos clientes",
    "churn_evitado": "Conta com problema técnico não corrigido → resultado ruim → churn",
    "tira_da_cabeca_do_marcos": false
  }
}
```

---

### OPE-09 — Relatório mensal consolidado ao cliente

```json
{
  "codigo": "OPE-09",
  "nome": "Relatório mensal consolidado ao cliente",
  "area": "OPE",
  "frase_de_sistema": "Recebe todos os check-ins do mês e dados de métricas, gera relatório mensal consolidado por IA e entrega ao gestor para revisão e envio ao cliente.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 3,
    "impacto_churn": 4,
    "valor_financeiro": 2,
    "volume_frequencia": 4,
    "chance_automacao": 4,
    "score_final": 3.22
  },
  "output": ["relatorio", "status", "historico"],
  "input": ["clientId", "checkInsDoMes", "metricasDoMes", "metasDoMes"],
  "fluxo_tecnico": {
    "gatilho": "Primeiro dia útil do mês: geração do relatório do mês anterior",
    "responsavel": "Sistema (geração por IA) + MANAGER (revisão e envio)",
    "status_inicial": "GERADO",
    "regras_validacao": ["Relatório deve ser revisado pelo gestor antes do envio"],
    "regras_sla": ["Enviado ao cliente até dia 5 do mês"],
    "caminho_aprovado": "Relatório enviado → registro com data/hora",
    "caminho_reprovado": "Gestor reprovado → revisão manual + reenvio",
    "caminho_atrasado": "Sem envio até dia 5 → alerta CS + ADMIN",
    "caminho_critico": "Mês sem relatório enviado → alerta ADMIN",
    "escalacao": "2+ meses sem relatório → ADMIN + CS",
    "registro_historico": "MonthlyReport (Prisma)",
    "encerramento": "Relatório enviado e confirmado"
  },
  "ferramentas_origem_destino": {
    "origem": "WeeklyChecklist do mês (Prisma), MetricSnapshot (Prisma), IA (claude-sonnet)",
    "destino": "MonthlyReport (Prisma), WhatsApp/E-mail"
  },
  "valor_interno": {
    "tempo_economizado_semana": "2h/mês de gestores formatando relatórios mensais",
    "risco_reduzido": "Mês sem prestação de contas formal",
    "dinheiro_protegido": "Renovação de contrato baseada em percepção de valor",
    "churn_evitado": "Relatório mensal é o maior momento de retenção",
    "tira_da_cabeca_do_marcos": false
  }
}
```

---

### FIN-20 — Controle de Contas a Pagar e categorização de despesas

```json
{
  "codigo": "FIN-20",
  "nome": "Controle de Contas a Pagar e categorização de despesas",
  "area": "FIN",
  "frase_de_sistema": "Recebe despesas lançadas, valida categorização e entrega DRE parcial com despesas fixas, variáveis, sem categoria e projeção de saldo.",
  "score_priorizacao": {
    "dependencia_marcos": 4,
    "risco_falha_silenciosa": 3,
    "impacto_churn": 1,
    "valor_financeiro": 4,
    "volume_frequencia": 3,
    "chance_automacao": 3,
    "score_final": 3.03
  },
  "output": ["dashboard", "relatorio", "alerta"],
  "input": ["expenseId", "valor", "categoria", "dataVencimento", "recorrente"],
  "fluxo_tecnico": {
    "gatilho": "Lançamento de nova despesa + verificação semanal de despesas sem categoria",
    "responsavel": "ADMIN (lançamento) + Sistema (alerta de sem categoria)",
    "status_inicial": "LANÇADA",
    "regras_validacao": ["Toda despesa precisa ter FinancialCategory"],
    "regras_sla": ["Categorização em até 48h após lançamento"],
    "caminho_aprovado": "Despesa categorizada → entra no DRE",
    "caminho_reprovado": "Sem categoria → fica fora do DRE com alerta",
    "caminho_atrasado": "Despesa sem categoria há >48h → alerta ADMIN",
    "caminho_critico": "n/a",
    "escalacao": "n/a",
    "registro_historico": "Expense (Prisma) + FinancialCategory (Prisma)",
    "encerramento": "Despesa categorizada e incluída no DRE"
  },
  "ferramentas_origem_destino": {
    "origem": "Expense (Prisma), FinancialCategory (Prisma)",
    "destino": "Dashboard financeiro, DRE calculado"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos categorizando despesas na planilha",
    "risco_reduzido": "DRE distorcido por despesas sem categoria",
    "dinheiro_protegido": "Controle de custos e margem real",
    "churn_evitado": "n/a",
    "tira_da_cabeca_do_marcos": true
  }
}
```

---

### CAP-01 — Prospecção e qualificação de leads comerciais

```json
{
  "codigo": "CAP-01",
  "nome": "Prospecção e qualificação de leads comerciais",
  "area": "CAP",
  "frase_de_sistema": "Recebe lead inbound ou outbound, aplica critérios de qualificação (segmento, ticket, histórico), calcula score e entrega fila priorizada com próxima ação e prazo de follow-up.",
  "score_priorizacao": {
    "dependencia_marcos": 3,
    "risco_falha_silenciosa": 3,
    "impacto_churn": 1,
    "valor_financeiro": 4,
    "volume_frequencia": 3,
    "chance_automacao": 4,
    "score_final": 2.78
  },
  "output": ["fila", "status", "alerta"],
  "input": ["nome", "empresa", "segmento", "ticketEstimado", "origemLead", "historicoAgencias"],
  "fluxo_tecnico": {
    "gatilho": "Novo lead via WhatsApp (webhook Z-API) OU cadastro manual OU formulário",
    "responsavel": "ADMIN/Marcos (qualificação) + responsável comercial (follow-up)",
    "status_inicial": "NOVO",
    "regras_validacao": ["Score de qualificação calculado antes de avançar no pipeline"],
    "regras_sla": ["Primeiro contato em até 4h após entrada", "Follow-up em até 3 dias"],
    "caminho_aprovado": "Lead qualificado avança para reunião/proposta",
    "caminho_reprovado": "Lead desqualificado → arquivado com motivo",
    "caminho_atrasado": "Follow-up vencido → alerta ADMIN",
    "caminho_critico": "n/a",
    "escalacao": "Lead de alto ticket → Marcos diretamente",
    "registro_historico": "AgencyLead + AgencyActivity (Prisma)",
    "encerramento": "Lead convertido (CAP-02) ou arquivado"
  },
  "ferramentas_origem_destino": {
    "origem": "WhatsApp (Z-API webhook), Formulário, Manual",
    "destino": "AgencyLead (Prisma), AgencyActivity (Prisma), Task (Prisma)"
  },
  "valor_interno": {
    "tempo_economizado_semana": "1h de Marcos organizando pipeline de prospecção",
    "risco_reduzido": "Lead quente perdido por falta de follow-up",
    "dinheiro_protegido": "MRR potencial de novos clientes",
    "churn_evitado": "n/a",
    "tira_da_cabeca_do_marcos": false
  }
}
```
