# Mapa de Lacunas — Performli

**Data:** 2026-06-30
**Versão:** 1.0
**Agente:** analista-lacunas
**Gate:** ESCOPO (o maestro não avança para arquitetura sem este documento)

> Cruzamento de `docs/auditoria-codigo.md` (o que existe) × `docs/mapa-pops.md`
> (o que o negócio precisa). Classificação por POP + lista consolidada de models
> novos **com justificativa de não-duplicação** (gate de duplicação).

---

## Tabela-Resumo

| POP | Score | Classificação | Esforço | Fase | Ação principal |
|---|---|---|---|---|---|
| WAR-14 | 4.52 | **PARCIAL** | M | 1 | Estender `CriticalProtocol`: critério de saída, responsável, prazo |
| WAR-16 | 4.47 | **PARCIAL** | M | 2 | Cron de monitoramento + escalação 3 semanas → Marcos |
| FIN-19 | 4.45 | **PARCIAL** | G | 1 | DAL financeiro + fila de inadimplência + régua de cobrança |
| CSX-13 | 4.40 | **PARCIAL** | M | 2 | Fila anti-churn a partir de `ChurnRiskScore` + ação proativa |
| OPE-06 | 4.39 | **PARCIAL** | G | 1 | Validação de qualidade do check-in + fila CS + status aprovação |
| CSX-12 | 4.32 | **PARCIAL** | M | 2 | Rotina de fechamento semanal + termômetro + bloqueio se incompleto |
| CRM-18 | 4.19 | **INEXISTENTE** | M | 2 | Acompanhamento diário de Otimização (dias sem comentário) |
| ONB-05 | 4.09 | **INEXISTENTE** | G | 2 | Onboarding estruturado + milestones primeiros 30 dias |
| CRM-17 | 3.94 | **PARCIAL** | M | 2 | Classificação automática etapa a partir do health |
| CSX-11 | 3.91 | **PARCIAL** | P | 1 | Fila transversal de demandas atrasadas (Task/Operation) |
| FIN-21 | 3.88 | **PARCIAL** | M | 1 | Snapshot financeiro semanal + alerta de desatualização |
| CSX-10 | 3.76 | **PARCIAL** | M | 1 | Validação automática de completude do check-in |
| OPE-07 | 3.62 | **PARCIAL** | P | 2 | Status de envio da prestação de contas + pergunta de ativação |
| CAP-03 | 3.40 | **PARCIAL** | M | 3 | Fila de leads frios/ex-clientes + cadência de recuperação |
| WAR-15 | 3.40 | **INEXISTENTE** | M | 2 | `WarRoomDecision`: decisões → tarefas com responsável e prazo |
| ONB-04 | 3.34 | **INEXISTENTE** | M | 2 | Checklist de configuração inicial com itens obrigatórios |
| CAP-02 | 3.28 | **PARCIAL** | M | 3 | Checklist de fechamento: contrato + fee + comissão |
| OPE-08 | 3.22 | **PARCIAL** | M | 3 | Checklist de auditoria técnica mensal por tipo de negócio |
| OPE-09 | 3.22 | **JÁ_EXISTE** | P | 3 | `MonthlyReport` existe; falta status de envio/aprovação |
| FIN-20 | 3.03 | **PARCIAL** | P | 3 | Alerta de despesa sem categoria + DRE parcial |
| CAP-01 | 2.78 | **PARCIAL** | M | 3 | Score de qualificação + SLA de primeiro contato |

**Distribuição:** JÁ_EXISTE 1 · PARCIAL 15 · INEXISTENTE 5.
A infraestrutura cobre quase tudo; o gap dominante é **camada operacional de
visibilidade, validação e escalação** — não coleta de dados.

---

## Lista consolidada de models a CRIAR (gate de duplicação)

Apenas **3** models novos sobrevivem à justificativa de não-duplicação. Todo o
resto reaproveita os 29 existentes.

### 1. `AuditLog` — ✅ JUSTIFICADO
- **Por que nenhum existente serve:** o CLAUDE.md exige `AuditLog` para toda
  mutação sensível (regra técnica #8). Hoje **não existe no schema** (confirmado
  na auditoria). `Alert` é notificação voltada ao cliente/operador (tem `read`,
  `sentAt`), não trilha imutável de auditoria. `Operation` é registro de trabalho
  operacional por cliente (subject/requested/done), não log de mutação de sistema.
  `SyncLog` é específico de sincronização de integração.
- **Usado por:** todas as fatias (transversal). Bloqueante para WAR-14.

### 2. `WarRoomDecision` — ✅ JUSTIFICADO (Fase 2, POP WAR-15)
- **Por que nenhum existente serve:** WAR-15 exige que cada decisão de War Room
  vire tarefa rastreável vinculada ao protocolo. `Task` é a tarefa-destino, mas
  não há entidade que ligue *decisão → tarefa(s) → protocolo* com pauta e ata.
  `CriticalProtocol.notes` é texto solto — viola a regra "nenhuma decisão fica só
  em texto". Decisão precisa de histórico append-only com responsável e status.
- **Não criar agora:** WAR-15 é Fase 2. Listado para arquitetura, não para esta fatia.

### 3. `OnboardingChecklist` — ⚠️ JUSTIFICADO CONDICIONALMENTE (Fase 2, ONB-04/05)
- **Por que talvez nenhum existente sirva:** `WeeklyChecklist` é semanal por
  *gestor* (`@@unique([managerId, weekStart])`), não por *cliente* e não modela
  milestones de 30 dias com data-alvo. Reaproveitar exigiria desvirtuar o model.
- **Alternativa a avaliar pelo arquiteto-dados:** campos de onboarding em `Client`
  (kickoffAt, day30ReviewAt) + `Task` recorrentes podem cobrir ONB sem model novo.
  **Decisão adiada para `arquiteto-dados`.**

### ❌ Models REJEITADOS (reaproveitar existente)
- `WarRoomExitCriteria` → **rejeitado**: critério de saída único cabe como campos
  aditivos em `CriticalProtocol` (MVP). Model dedicado só se houver múltiplos
  critérios por War Room (Fase 2+).
- `ClientWeeklyThermometer` → **rejeitado**: termômetro (CSX-12) é agregação de
  `HealthScore` + `ClientStatusStreak` já existentes; vira leitura/DAL, não model.
- `FinancialSnapshot` → **rejeitado para Fase 1**: FIN-21 pode ser computado on-read
  de `AsaasPayment`/`AsaasSubscription`/`Expense`. Reavaliar se a query ficar cara.
- `CommissionLedger`, `LeadFollowUpCadence`, `ProcessRun`, `ProcessStepRun`,
  `ProcessEvidence`, `ProcessSlaRule`, `ProcessAutomationRule`, `ProcessFailureLog`,
  `QualityReview`, `FirstThirtyDaysReview` → **rejeitados/adiados**: pertencem a POPs
  de Fase 3+ ou são cobertos por extensão de models existentes. Não criar especulativamente.

### Catálogo vivo de POPs (`/processos`)
O POP-como-entidade (`OperationalProcess`) é necessário para a tela `/processos`
(módulo 2 do briefing). Porém os 21 POPs são um conjunto **fixo e conhecido** —
podem ser um **seed estático** (constante/tabela de referência) em vez de um model
mutável. **Decisão para `arquiteto-dados`:** avaliar `OperationalProcess` (model)
vs catálogo estático + `lastRunAt`/`nextRunAt` derivados das rotinas existentes.

---

## Detalhe por POP (top-8 MVP + os de Fase 1)

### WAR-14 — Abertura de War Room (PARCIAL)
```json
{
  "codigo": "WAR-14",
  "classificacao": "PARCIAL",
  "o_que_existe": "Model CriticalProtocol (schema:323), detecção automática em critical-account-detector.ts (2 gatilhos: ROAS 2 semanas, faturamento <70%), fireProtocol cria protocolo+alerta+WhatsApp, tela /anti-churn renderiza protocolos ativos via ProtocolCard.",
  "o_que_falta": "Critério de saída mensurável (dossiê: 'nenhuma War Room sem critério de saída'), responsável explícito, prazo, diagnóstico estruturado, escalação 3 semanas. CriticalProtocol só tem briefingCS/notes em texto livre.",
  "models_a_reaproveitar": ["CriticalProtocol", "Alert", "Task", "Client", "HealthScore", "ClientStatusStreak"],
  "models_a_criar": ["AuditLog (transversal)"],
  "telas_a_ampliar": ["/anti-churn (protocolos ativos → War Room com critério de saída)"],
  "telas_a_criar": [],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": false,
  "vira_score": false,
  "vira_evidencia_obrigatoria": true,
  "esforco_estimado": "M",
  "fase_recomendada": 1
}
```

### FIN-19 — Contas a Receber e inadimplência (PARCIAL)
```json
{
  "codigo": "FIN-19",
  "classificacao": "PARCIAL",
  "o_que_existe": "Models Asaas* completos, services/asaas/sync.ts, rotas /api/financeiro/summary|cashflow, webhook Asaas, tela /financeiro.",
  "o_que_falta": "Queries financeiras estão DENTRO das rotas API (fora do DAL — viola padrão). Sem fila priorizada de inadimplentes (valor × dias em atraso), sem régua de cobrança (D+3/D+7/D+15/D+30), sem alerta 'cliente ativo sem fatura'.",
  "models_a_reaproveitar": ["AsaasPayment", "AsaasSubscription", "AsaasCustomer", "Client", "Alert", "Task"],
  "models_a_criar": [],
  "telas_a_ampliar": ["/financeiro (fila de inadimplência)", "/cockpit (card inadimplência)"],
  "telas_a_criar": [],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": false,
  "vira_score": false,
  "vira_evidencia_obrigatoria": false,
  "esforco_estimado": "G",
  "fase_recomendada": 1
}
```

### OPE-06 — Check-in semanal (PARCIAL)
```json
{
  "codigo": "OPE-06",
  "classificacao": "PARCIAL",
  "o_que_existe": "WeeklyChecklist (Json items), weekly-checklist-generator.ts gera toda segunda por gestor, getWeeklyChecklist no DAL, WeeklyChecklistCard na dashboard.",
  "o_que_falta": "Validação de completude/qualidade (campo vazio, cópia da semana anterior), fila de revisão da CS, status aprovado/reprovado, motivo de reprovação, histórico de reprovações por gestor, alerta 'cliente sem check-in'.",
  "models_a_reaproveitar": ["WeeklyChecklist", "Alert", "WeeklyReport"],
  "models_a_criar": [],
  "telas_a_ampliar": ["dashboard (fila CS de check-ins)", "/cockpit"],
  "telas_a_criar": ["/check-ins (fila de validação CS) — avaliar"],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": true,
  "vira_score": false,
  "vira_evidencia_obrigatoria": true,
  "esforco_estimado": "G",
  "fase_recomendada": 1
}
```

### CSX-11 — Demandas atrasadas (PARCIAL)
```json
{
  "codigo": "CSX-11",
  "classificacao": "PARCIAL",
  "o_que_existe": "Models Task e Operation com dueDate/status, getTasks e getOperations no DAL (role-scoped), telas /tasks e /operations.",
  "o_que_falta": "Fila TRANSVERSAL de demandas atrasadas (todos os clientes/gestores), SLA visual ('atrasada há N dias'), agrupamento por responsável, escalação D+7.",
  "models_a_reaproveitar": ["Task", "Operation", "Alert"],
  "models_a_criar": [],
  "telas_a_ampliar": ["/cockpit (card demandas atrasadas)", "/tasks (filtro atrasadas)"],
  "telas_a_criar": [],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": false,
  "vira_score": false,
  "vira_evidencia_obrigatoria": false,
  "esforco_estimado": "P",
  "fase_recomendada": 1
}
```

### FIN-21 — Dashboard financeiro semanal (PARCIAL)
```json
{
  "codigo": "FIN-21",
  "classificacao": "PARCIAL",
  "o_que_existe": "Rota /api/financeiro/summary calcula KPIs on-read, tela /financeiro, models Expense/FinancialCategory.",
  "o_que_falta": "MRR previsto vs realizado lado a lado, margem automática, alerta de despesa sem categoria, indicador de 'última atualização' visível, alerta de desvio previsto×realizado.",
  "models_a_reaproveitar": ["AsaasSubscription", "AsaasPayment", "Expense", "FinancialCategory"],
  "models_a_criar": [],
  "telas_a_ampliar": ["/financeiro", "/cockpit (cards MRR/margem)"],
  "telas_a_criar": [],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": false,
  "vira_score": false,
  "vira_evidencia_obrigatoria": false,
  "esforco_estimado": "M",
  "fase_recomendada": 1
}
```

### CSX-10 — Validação de qualidade dos check-ins (PARCIAL)
```json
{
  "codigo": "CSX-10",
  "classificacao": "PARCIAL",
  "o_que_existe": "WeeklyChecklist com items Json; geração automática.",
  "o_que_falta": "Regras de validação objetivas (completude, anti-cópia, evidência numérica), status de revisão CS, métrica de tempo de correção, padrão de reprovação por gestor.",
  "models_a_reaproveitar": ["WeeklyChecklist", "Alert"],
  "models_a_criar": [],
  "telas_a_ampliar": ["dashboard (fila CS)"],
  "telas_a_criar": [],
  "vira_automacao": true,
  "vira_alerta": true,
  "vira_checklist": true,
  "vira_score": false,
  "vira_evidencia_obrigatoria": true,
  "esforco_estimado": "M",
  "fase_recomendada": 1
}
```

> Os demais POPs (Fase 2/3) seguem o mesmo padrão e estão consolidados na
> Tabela-Resumo. Detalhamento completo será expandido quando cada fatia entrar
> em arquitetura, para não inflar o escopo antes da hora (princípio de fatia vertical).

---

## Decisão de fatia #1 (entrada em arquitetura)

**POP escolhido: WAR-14** (maior score, 4.52; PARCIAL; esforço M; bloqueia WAR-15/16).

Justificativa: maior dependência do Marcos + maior impacto em churn + risco de
falha silenciosa máximo. O model-base (`CriticalProtocol`) já existe e já é
populado automaticamente — a fatia é **aditiva e de baixo risco de regressão**:
estende o model com critério de saída/responsável/prazo, cria `AuditLog`
(transversal, exigido pelo CLAUDE.md) e adiciona escalação. Nenhuma funcionalidade
existente é removida.

**Models que esta fatia toca:** `CriticalProtocol` (estender, aditivo) + `AuditLog` (novo).
