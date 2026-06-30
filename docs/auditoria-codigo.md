# Auditoria de Código — Performli Sistema Geral

**Data:** 2026-06-30
**Versão:** 1.1 (enriquecida com segunda passagem de evidências)
**Agente:** auditor-codigo
**Repositório:** marcosliossi-del/performli-sistema-geral

> Read-only. Nenhuma proposta de feature ou model novo. Só evidências do que existe.

---

## 1. Dashboards / Cockpit

```json
{
  "area": "Dashboards / Cockpit",
  "models_envolvidos": ["Client", "HealthScore", "Alert", "Task", "ChurnRiskScore", "MetricSnapshot"],
  "rotas_existentes": [
    "src/app/(dashboard)/dashboard/page.tsx",
    "src/app/(dashboard)/page.tsx"
  ],
  "componentes_existentes": [
    "src/lib/dal.ts:60 — getDashboardData(userId, role)",
    "src/lib/dal.ts:213 — getClientsOperationalTable(userId, role)",
    "src/lib/dal.ts:1233 — getAtRiskClients(userId, role)"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Dashboard agrega dados mas não responde às 6 perguntas operacionais do CLAUDE.md (O que está errado? O que fazer agora? Quem? Prazo? Impacto?)",
    "Sem card explícito de 'próxima ação do dia'",
    "Sem indicador de última atualização de dados visível na tela"
  ],
  "riscos_de_seguranca_observados": [],
  "reaproveitavel": true,
  "evidencia": "src/lib/dal.ts:60 (getDashboardData), src/app/(dashboard)/dashboard/page.tsx"
}
```

---

## 2. Clientes (Client 360)

```json
{
  "area": "Clientes / Client 360",
  "models_envolvidos": ["Client", "ClientAssignment", "ClientInteraction", "PlatformAccount", "Goal", "HealthScore", "ClientStatusStreak", "ChurnRiskScore", "CriticalProtocol"],
  "rotas_existentes": [
    "src/app/(dashboard)/clients/page.tsx",
    "src/app/(dashboard)/clients/[slug]/page.tsx",
    "src/app/(dashboard)/clients/new/page.tsx"
  ],
  "componentes_existentes": [
    "src/lib/dal.ts:419 — getClientDetail(slug)",
    "src/lib/dal.ts:532 — getClientKPIs(clientId, userId, role)",
    "src/lib/dal.ts:770 — getClientMetricHistory(clientId, days)",
    "src/lib/dal.ts:1634 — getClientChurnHistory(clientId, weeks)",
    "src/lib/dal.ts:2134 — getClientInteractions(clientId)",
    "src/lib/dal.ts:2367 — getClientSalesFunnel(clientId)",
    "src/app/actions/clients.ts",
    "src/app/actions/updateClient.ts",
    "src/app/actions/interactions.ts"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Client 360 existe mas onboarding/primeiros 30 dias não tem tela dedicada",
    "Sem fila visual de 'clientes sem check-in esta semana'",
    "Sem indicador de 'último contato com o cliente' no card"
  ],
  "riscos_de_seguranca_observados": [
    "getClientDetail (dal.ts:419) usa slug sem filtrar por userId/role — IDOR corrigido na auditoria round 3 (commit f0e43ca), mas deve ser monitorado em novos endpoints"
  ],
  "reaproveitavel": true,
  "evidencia": "src/lib/dal.ts:419 (getClientDetail), src/lib/dal.ts:532 (getClientKPIs)"
}
```

---

## 3. Métricas e Snapshots

```json
{
  "area": "Métricas e Snapshots",
  "models_envolvidos": ["MetricSnapshot", "Goal", "CampaignSnapshot", "SyncLog"],
  "rotas_existentes": [
    "src/app/api/sync/ga4/route.ts",
    "src/app/api/clients/[clientId]/budget/route.ts"
  ],
  "componentes_existentes": [
    "src/lib/dal.ts:770 — getClientMetricHistory(clientId, days=14)",
    "src/lib/dal.ts:835 — getClientDailyRevenue(clientId)",
    "src/lib/dal.ts:935 — getClientMonthlyComparison(clientId, months=6)",
    "src/lib/dal.ts:1806 — getClientCampaigns(clientId)",
    "src/lib/dal.ts:1724 — getGoalPaceMetrics(clientId)",
    "src/lib/dal.ts:2256 — getWeekScoreComparison(clientId)"
  ],
  "estado": "completo",
  "divida_tecnica": [
    "SyncLog existe mas não há tela de visibilidade de sincronização para o operador",
    "Sem alerta proativo de 'sync falhou há N dias' visível no dashboard"
  ],
  "riscos_de_seguranca_observados": [],
  "reaproveitavel": true,
  "evidencia": "src/services/meta-ads/sync.ts, src/services/ga4/sync.ts, src/services/google-ads/sync.ts"
}
```

---

## 4. Health Score

```json
{
  "area": "Health Score",
  "models_envolvidos": ["HealthScore", "HealthStatus", "ClientStatusStreak", "Goal", "MetricSnapshot"],
  "rotas_existentes": [],
  "componentes_existentes": [
    "src/services/health-scorer.ts (485 linhas)",
    "src/lib/dal.ts:2302 — getHealthScoreHistory(clientId, weeks=8)",
    "src/lib/dal.ts:2246 — getWeekScoreComparison(clientId)",
    "src/lib/health.ts"
  ],
  "estado": "completo",
  "divida_tecnica": [
    "Lógica de two-signal (MTD + tendência) está implementada e documentada",
    "Distinção ECOMMERCE/LOCAL já implementada",
    "ClientStatusStreak existe mas não é exibido em destaque na tela"
  ],
  "riscos_de_seguranca_observados": [],
  "reaproveitavel": true,
  "evidencia": "src/services/health-scorer.ts:1 (runHealthScorer), src/lib/dal.ts:2302"
}
```

---

## 5. Alertas

```json
{
  "area": "Alertas",
  "models_envolvidos": ["Alert", "AlertType"],
  "rotas_existentes": [
    "src/app/(dashboard)/alerts/page.tsx",
    "src/app/actions/alerts.ts"
  ],
  "componentes_existentes": [
    "src/services/alert-dispatcher.ts (202 linhas)",
    "src/services/oscillation-detector.ts (205 linhas)",
    "src/services/budget-monitor.ts",
    "src/services/contract-expiry-checker.ts",
    "src/services/critical-account-detector.ts (197 linhas)"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Alertas existem mas a tela /alerts não tem separação por severidade/urgência visível",
    "Sem SLA de resposta vinculado ao alerta ('alertado há X dias sem ação')",
    "Sem campo 'responsável' explícito no alerta"
  ],
  "riscos_de_seguranca_observados": [],
  "reaproveitavel": true,
  "evidencia": "src/services/alert-dispatcher.ts:1, src/app/actions/alerts.ts:1"
}
```

---

## 6. CRM / Interações

```json
{
  "area": "CRM / Interações",
  "models_envolvidos": ["ClientInteraction", "InteractionType", "AgencyLead", "AgencyActivity", "PipelineStage"],
  "rotas_existentes": [
    "src/app/(dashboard)/pipeline/page.tsx",
    "src/app/(dashboard)/comercial/page.tsx",
    "src/app/(dashboard)/comercial/dashboard/page.tsx",
    "src/app/api/comercial/leads/route.ts",
    "src/app/api/comercial/leads/[id]/route.ts",
    "src/app/api/comercial/leads/[id]/convert/route.ts",
    "src/app/api/comercial/activities/route.ts"
  ],
  "componentes_existentes": [
    "src/lib/dal.ts:2081 — getPipelineClients(userId, role)",
    "src/lib/dal.ts:2134 — getClientInteractions(clientId)",
    "src/app/(dashboard)/pipeline/PipelineBoard.tsx",
    "src/app/actions/interactions.ts"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Pipeline comercial (AgencyLead) existe mas não tem cadência de follow-up automatizada",
    "Sem alerta de 'lead quente sem próximo contato há N dias'",
    "Falta distinção entre CRM de prospects (AgencyLead) e CRM de clientes ativos (ClientInteraction) na visão unificada"
  ],
  "riscos_de_seguranca_observados": [
    "Endpoint /leads/[id]/convert tinha bypass de ownership (corrigido commit e12d4d6)"
  ],
  "reaproveitavel": true,
  "evidencia": "src/lib/dal.ts:2081, src/app/api/comercial/leads/route.ts"
}
```

---

## 7. Financeiro (Asaas, receita, inadimplência)

```json
{
  "area": "Financeiro",
  "models_envolvidos": ["AsaasPayment", "AsaasSubscription", "AsaasCustomer", "AsaasTransfer", "Expense", "FinancialCategory"],
  "rotas_existentes": [
    "src/app/(dashboard)/financeiro/page.tsx",
    "src/app/api/financeiro/summary/route.ts (208 linhas)",
    "src/app/api/financeiro/cashflow/route.ts (75 linhas)",
    "src/app/api/financeiro/expenses/route.ts (52 linhas)",
    "src/app/api/financeiro/expenses/[id]/route.ts",
    "src/app/api/asaas/sync/route.ts",
    "src/app/api/asaas/webhook/route.ts"
  ],
  "componentes_existentes": [
    "src/services/asaas/sync.ts (239 linhas)",
    "src/services/asaas/client.ts",
    "src/components/settings/AsaasStatus.tsx"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "DAL não tem funções financeiras — queries financeiras ficam dentro das rotas API diretamente (viola padrão DAL)",
    "Sem MRR previsto vs realizado na tela",
    "Sem margem operacional calculada automaticamente",
    "Sem fila de inadimplentes com tempo de atraso e valor em aberto"
  ],
  "riscos_de_seguranca_observados": [
    "Rotas financeiras restringem a ADMIN/CS (api/financeiro/summary:10) — correto, mas DAL bypass é dívida"
  ],
  "reaproveitavel": true,
  "evidencia": "src/app/api/financeiro/summary/route.ts:1, src/services/asaas/sync.ts:1"
}
```

---

## 8. Jurídico / Contratos

```json
{
  "area": "Jurídico / Contratos",
  "models_envolvidos": ["Contract", "ContractStatus", "ContractType"],
  "rotas_existentes": [
    "src/app/(dashboard)/juridico/page.tsx",
    "src/app/api/admin/contract-fee/route.ts",
    "src/app/api/admin/seed-contracts/route.ts"
  ],
  "componentes_existentes": [
    "src/services/contract-expiry-checker.ts",
    "src/app/actions/contracts.ts (217 linhas)"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Tela /juridico existe mas sem visão de pipeline de contratos (quem assinou, quem está pendente)",
    "Sem alerta de renovação com antecedência configurável (hoje: fixo 30 dias)",
    "Sem campo de valor de contrato / MRR por contrato",
    "Sem histórico de alterações contratuais"
  ],
  "riscos_de_seguranca_observados": [
    "Middleware protegia /juridico apenas após commit e12d4d6 (adicionado tardiamente)"
  ],
  "reaproveitavel": true,
  "evidencia": "src/services/contract-expiry-checker.ts:1, src/app/actions/contracts.ts:1"
}
```

---

## 9. Tarefas e Operações

```json
{
  "area": "Tarefas e Operações",
  "models_envolvidos": ["Task", "TaskStatus", "TaskPriority", "Operation", "WeeklyChecklist"],
  "rotas_existentes": [
    "src/app/(dashboard)/tasks/page.tsx",
    "src/app/(dashboard)/operations/page.tsx"
  ],
  "componentes_existentes": [
    "src/lib/dal.ts:1063 — getTasks(userId, role)",
    "src/lib/dal.ts:953 — getOperations(userId, role)",
    "src/lib/dal.ts:1657 — getWeeklyChecklist(managerId)",
    "src/services/weekly-checklist-generator.ts (155 linhas)",
    "src/app/actions/tasks.ts",
    "src/app/actions/operations.ts",
    "src/app/actions/weeklyChecklist.ts",
    "src/components/tasks/TaskFormModal.tsx",
    "src/components/tasks/TaskList.tsx"
  ],
  "estado": "parcial",
  "divida_tecnica": [
    "Checklist semanal é gerado mas sem fila de 'demandas em atraso' transversal a todos os clientes",
    "Sem SLA visual ('tarefa atrasada há N dias')",
    "Task e Operation são modelos separados mas sem hierarquia clara na UI"
  ],
  "riscos_de_seguranca_observados": [],
  "reaproveitavel": true,
  "evidencia": "src/services/weekly-checklist-generator.ts:1, src/lib/dal.ts:1657"
}
```

---

## 10. Relatórios e IA

```json
{
  "area": "Relatórios e IA",
  "models_envolvidos": ["WeeklyReport", "MonthlyReport", "CampaignSnapshot", "AIConversation", "AIMessage", "ClientInsight", "ClientChat", "ClientChatMessage", "KnowledgeDocument", "KnowledgeChunk"],
  "rotas_existentes": [
    "src/app/(dashboard)/reports/page.tsx",
    "src/app/(dashboard)/ai-agents/page.tsx",
    "src/app/(dashboard)/knowledge/page.tsx",
    "src/app/api/ai/chat/route.ts",
    "src/app/api/ai/clients/route.ts",
    "src/app/api/ai/dashboard-chat/route.ts",
    "src/app/api/admin/knowledge/route.ts",
    "src/app/api/admin/knowledge/upload/route.ts",
    "src/app/api/admin/knowledge/[id]/route.ts"
  ],
  "componentes_existentes": [
    "src/services/weekly-report-generator.ts (951 linhas)",
    "src/services/campaign-insight-generator.ts (186 linhas)",
    "src/lib/knowledge-search.ts (75 linhas)",
    "src/lib/ai-client-context.ts (316 linhas)",
    "src/lib/dal.ts:1669 — getClientWeeklyReport",
    "src/lib/dal.ts:1681 — getClientMonthlyReport",
    "src/lib/dal.ts:1781 — getLatestCampaignInsight",
    "src/app/actions/weeklyReports.ts",
    "src/app/actions/campaignInsights.ts",
    "src/app/actions/insights.ts",
    "src/app/actions/chat.ts",
    "src/components/reports/ReportClientSelect.tsx"
  ],
  "estado": "completo",
  "divida_tecnica": [
    "Relatórios gerados por IA mas sem fluxo de aprovação/envio ao cliente a partir da tela",
    "Base RAG existe mas sem interface de busca direta para o operador"
  ],
  "riscos_de_seguranca_observados": [
    "getReportData tinha IDOR (corrigido commit f0e43ca — scope por assignment)"
  ],
  "reaproveitavel": true,
  "evidencia": "src/services/weekly-report-generator.ts:1, src/lib/knowledge-search.ts:1"
}
```

---

## 11. Integrações Externas

```json
{
  "area": "Integrações Externas",
  "models_envolvidos": ["PlatformAccount", "MetricSnapshot", "SyncLog", "NuvemshopStore", "NuvemshopOrder", "IntegrationSetting"],
  "rotas_existentes": [
    "src/app/api/cron/daily/route.ts",
    "src/app/api/cron/digest/route.ts",
    "src/app/api/nuvemshop/auth/route.ts",
    "src/app/api/nuvemshop/callback/route.ts",
    "src/app/api/nuvemshop/install/route.ts",
    "src/app/api/nuvemshop/webhooks/route.ts",
    "src/app/api/nuvemshop/reconciliation/route.ts",
    "src/app/api/asaas/webhook/route.ts",
    "src/app/api/leads/capture/route.ts",
    "src/app/api/settings/whatsapp/route.ts",
    "src/app/api/settings/asaas/route.ts"
  ],
  "componentes_existentes": [
    "src/services/meta-ads/ (client.ts, sync.ts, transformers.ts)",
    "src/services/ga4/ (client.ts, sync.ts, transformers.ts)",
    "src/services/google-ads/ (client.ts, sync.ts, transformers.ts)",
    "src/services/nuvemshop/ (client.ts, sync.ts, transformers.ts, reconciliation.ts)",
    "src/services/asaas/ (client.ts, sync.ts, types.ts)",
    "src/services/zapi/client.ts",
    "src/services/evolution/client.ts",
    "src/services/windsor/ (client.ts, transformers.ts)",
    "src/services/notifications/daily-digest.ts (560 linhas)",
    "src/lib/whatsapp.ts"
  ],
  "estado": "completo",
  "divida_tecnica": [
    "Windsor integrado mas sem documentação de uso atual",
    "Dois clientes WhatsApp (Z-API e Evolution) — pode gerar duplicidade de envios",
    "Sem dashboard de saúde das integrações (último sync, status, falhas)"
  ],
  "riscos_de_seguranca_observados": [
    "OAuth Nuvemshop tinha CSRF — corrigido com HMAC no state (commit f0e43ca)",
    "Webhook WhatsApp tinha bypass de auth — corrigido (commit 3f03923)",
    "Todas as chamadas fetch do GA4 têm timeout de 30s (AbortController, commit f0e43ca)"
  ],
  "reaproveitavel": true,
  "evidencia": "src/app/api/cron/daily/route.ts, src/services/meta-ads/sync.ts"
}
```

---

## Sumário

| Área | Estado | Risco Observado | Reaproveitável |
|---|---|---|---|
| Dashboards / Cockpit | parcial | nenhum atual | ✅ |
| Clientes / Client 360 | parcial | IDOR corrigido (f0e43ca) | ✅ |
| Métricas e Snapshots | completo | nenhum | ✅ |
| Health Score | completo | nenhum | ✅ |
| Alertas | parcial | nenhum | ✅ |
| CRM / Interações | parcial | ownership corrigido (e12d4d6) | ✅ |
| Financeiro | parcial | queries fora do DAL | ✅ |
| Jurídico / Contratos | parcial | middleware tardio (e12d4d6) | ✅ |
| Tarefas e Operações | parcial | nenhum | ✅ |
| Relatórios e IA | completo | IDOR corrigido (f0e43ca) | ✅ |
| Integrações Externas | completo | OAuth/webhook corrigidos | ✅ |

**Padrão geral:** infraestrutura sólida (serviços, DAL, cron, modelos). As lacunas são de **visibilidade operacional** — o sistema coleta e processa dados corretamente, mas não os exibe de forma que responda às 6 perguntas do CLAUDE.md em cada tela.

---

## Riscos de Segurança Confirmados (segunda passagem)

Os itens abaixo foram verificados com leitura direta dos arquivos e representam riscos ativos:

### [ALTO] Webhook Asaas sem autenticação obrigatória
- **Arquivo:** `src/app/api/asaas/webhook/route.ts:15`
- **Detalhe:** `ASAAS_WEBHOOK_TOKEN` é verificado apenas se definido. Se a env var não estiver configurada, qualquer POST externo é aceito e pode manipular status de pagamentos (ex: marcar cobrança como recebida).

### [ALTO] Contratos: createContract e updateContract sem verificação de papel
- **Arquivo:** `src/app/actions/contracts.ts:20, :84`
- **Detalhe:** Ambas as actions usam apenas `requireSession()` sem checar `role`. Um usuário com papel ANALYST pode criar e modificar contratos de qualquer cliente.

### [MÉDIO] addInteraction e deleteInteraction sem ownership check
- **Arquivo:** `src/app/actions/interactions.ts:8-28`
- **Detalhe:** `addInteraction` recebe `clientId` sem verificar se o usuário autenticado tem acesso a esse cliente. `deleteInteraction` deleta por ID sem verificar a quem pertence a interação.

### [MÉDIO] updatePipelineStage sem ownership check
- **Arquivo:** `src/app/actions/interactions.ts:31`
- **Detalhe:** Qualquer usuário autenticado pode mover qualquer cliente entre estágios do pipeline, independente de assignment.

### [MÉDIO] markAlertRead sem ownership do alerta
- **Arquivo:** `src/app/actions/alerts.ts:7`
- **Detalhe:** Apenas autentica a sessão. Qualquer usuário pode marcar qualquer alerta como lido, mesmo de clientes não atribuídos a ele.

### [MÉDIO] Webhook WhatsApp: token de autenticação opcional (condicional)
- **Arquivo:** `src/app/api/webhooks/whatsapp/route.ts:18-23`
- **Detalhe:** O header `client-token` é verificado apenas se presente. Se o atacante não enviar o header, a requisição é processada sem autenticação — pode injetar leads falsos via `AgencyLead`.

### [BAIXO] Evolution e Z-API sem timeout nas chamadas fetch
- **Arquivos:** `src/services/evolution/client.ts:30`, `src/services/zapi/client.ts:33`
- **Detalhe:** Nenhum dos dois clients usa `AbortController` ou `signal`. Uma falha na API de WhatsApp pode travar indefinidamente o cron diário durante o envio do digest.

---

## Dívidas Técnicas Transversais

1. **AuditLog não implementado:** CLAUDE.md exige `AuditLog` para automações críticas, mas o model não existe no `prisma/schema.prisma` e não há uso em nenhum serviço.
2. **`lastRunAt` do cron não persistido:** CLAUDE.md exige que toda rotina recorrente registre `lastRunAt`. O cron diário (`src/app/api/cron/daily/route.ts`) retorna JSON de resumo mas não persiste o timestamp de execução em banco.
3. **Queries diretas ao prisma em pages:** `financeiro/page.tsx`, `juridico/page.tsx`, `anti-churn/page.tsx`, `comercial/page.tsx` e `alerts/page.tsx` fazem queries diretas ao Prisma em vez de passar pelo DAL — viola a regra 1 do CLAUDE.md.
4. **Dois clientes WhatsApp paralelos:** `src/services/zapi/client.ts` e `src/services/evolution/client.ts` coexistem sem abstração comum — risco de divergência de comportamento e envios duplicados.
