## Banco de Dados

Auditoria da dimensão de dados do PERFORMLI. Base: `prisma/schema.prisma` (1582 linhas, 64 models) e 44 migrations em `prisma/migrations/`.

### (a) Visão dos domínios de models

- **Auth/Team:** `User`, enum `Role` (ADMIN/MANAGER/ANALYST/CS).
- **Clientes:** `Client`, `ClientAssignment`, `ClientInteraction`, `ClientStatusStreak`, `ClientInsight`, `ClientChat`/`ClientChatMessage`. Client acumula muitos campos derivados (resultado, etapa, ficha CS).
- **Plataformas/Métricas:** `PlatformAccount`, `MetricSnapshot`, `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Central Operacional (Task hub):** `Task` + 20 satélites (`TaskArea`, `POPProcess`, `POPStep`, `TaskTemplate`, `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskChecklistItem`, `TaskDependency`, `TaskCustomField*`, etc.). É o maior domínio, alinhado à estratégia de substituir o ClickUp.
- **War Room:** `CriticalProtocol` (+ `AuditLog` transversal).
- **CSX/Relatórios:** `WeeklyChecklist`, `ClientWeeklyCheckin`, `WeeklyReport`, `MonthlyReport`.
- **Integrações:** `NuvemshopStore`/`NuvemshopOrder`, `IntegrationSetting`, `AIConversation`/`AIMessage`, `KnowledgeDocument`/`KnowledgeChunk`.
- **Financeiro:** `AsaasCustomer/Payment/Subscription/Transfer`, `FinancialCategory`, `Expense`, `Contract`.
- **CRM comercial:** `AgencyLead`, `AgencyActivity`.

### (b) Pontos fortes

- Migrations recentes (a partir de `20260630*`) são fortemente idempotentes: `ADD COLUMN IF NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, `CREATE TYPE ... EXCEPTION WHEN duplicate_object` (ex.: `20260630170000_central_operacional_bloco1` com 101 guardas, `20260630140000_inadimplencia_alerts`).
- `AuditLog` append-only bem indexado (4 índices compostos por entidade/cliente/ator/ação) — atende regra técnica #8.
- Índices compostos consistentes em snapshots e relatórios (`@@unique([platformAccountId, date])`, `@@unique([clientId, weekStart])`), garantindo idempotência de sync/cron.
- Uso disciplinado de `onDelete: Cascade` nos filhos de `Client`/`Task` e `SetNull` em referências fracas (`AuditLog.actor`, `CriticalProtocol.responsible`, `Contract.responsible`).
- Truque anti-NULL em unique: `CampaignSnapshot.adSetId @default("")` evita furos de unicidade com NULL.
- `idempotencyKey @unique` em `Task` e `lastRunAt` em `TaskRecurrenceRule` atendem regras #7/#9.

### (c) Riscos por severidade

**ALTO**
- **`AgencyLead` sem índice em `phone` apesar de lookup por telefone em hot path.** `src/app/api/webhooks/whatsapp/route.ts:47` e `leads/capture/route.ts:60` fazem `where: { phone: { contains: phone.slice(-9) }, deletedAt: null }` a cada mensagem recebida. `AgencyLead` (schema:1444) só tem `@@index([status])` e `@@index([createdAt])`. `contains` não usa índice B-tree comum, mas a ausência de qualquer índice de suporte + varredura em webhook é risco de latência. Mitigável parcialmente; ver Travas.
- **Migrations antigas com `ALTER TYPE ADD VALUE` sem `IF NOT EXISTS`** (ex.: `20260324230442_add_cac_metric_type/migration.sql`: `ALTER TYPE "MetricType" ADD VALUE 'CAC';`). Se reaplicadas em banco já migrado, falham. Não corrigir migrations já aplicadas em produção (histórico imutável), mas é risco caso se recrie o banco do zero por replay — registrar.

**MÉDIO**
- **`Task.leadId` e `Task.contractId` são FKs lógicas sem constraint** (schema:678-679, comentado "sem FK"). Referências a `AgencyLead`/`Contract` podem ficar órfãs após exclusão. Usado em `src/app/actions/contracts.ts` e serviços de lead. Sem `onDelete`, deleção de lead/contrato deixa Task apontando para id inexistente.
- **`Task.assignedTo` com `onDelete: Cascade` (schema:719):** deletar um `User` apaga TODAS as tasks atribuídas a ele — perda de histórico operacional. Regra técnica #12 (não remover funcionalidade/histórico) sugere `SetNull` ou bloqueio de exclusão.
- **`AsaasSubscription.status`, `AsaasTransfer.status`, `Contract` usam `String` cru** onde enum caberia (`AsaasSubscription.status` schema:1382 "ACTIVE/INACTIVE/EXPIRED"; `FinancialCategory.type` "REVENUE|EXPENSE"). Sem enum, dados inconsistentes entram sem validação no banco.
- **`SyncLog` sem índices** (schema:1181): consultado por serviços de sync e DAL, mas não tem `@@index` em `platformAccountId`/`status`/`startedAt`. Tabela cresce por sync diário de ~30 clientes × plataformas.
- **`ClientResultado` e `ClientRelacionamento` são enums quase idênticos** (OTIMO/BOM/REGULAR/RUIM/PESSIMO) — duplicação semântica. Não é bug, mas gera confusão; documentar diferença de propósito (resultado automatizado vs. relacionamento manual).

**BAIXO**
- **Models potencialmente órfãos/subutilizados:** `OperationalRoutine` (schema:935), `TaskSavedView` (927), `TaskSLA` (944), `TaskAutomationRule` — verificar se têm consumo real ou são scaffolding do bloco Central Operacional ainda não ligado.
- **`Alert.triggeredBy` (User) sem `onDelete`** (schema:479) — default `Restrict` pode bloquear exclusão de usuário; provavelmente intencional, mas inconsistente com o resto (que usa SetNull para refs fracas).
- **`NuvemshopOrder.rawData`/`MetricSnapshot.rawData` Json sem limite** — crescimento de armazenamento; monitorar.

### 🔒 Travas / Fluidez

Foco em índices aditivos seguros e limpezas de baixo risco (todos aplicáveis via migration aditiva idempotente, sem alterar dados):

1. **Índice em `SyncLog(platformAccountId, startedAt)` e `SyncLog(status)`** — suporta telas de "última sincronização" (regra UX #10) e diagnóstico de sync falho. `CREATE INDEX IF NOT EXISTS`. Risco baixo.
2. **Índice em `AgencyLead(createdAt)` já existe; adicionar `@@index([status, deletedAt])`** — o filtro recorrente `status IN (...) AND deletedAt IS NULL` (lead-followup e CRM) se beneficia de índice parcial `WHERE deletedAt IS NULL`. Aditivo, risco baixo.
3. **Índice em `Client(status)` e `Client(pipelineStage)`** — 31 queries filtram Client por status/pipeline/businessType; nenhum índice em Client hoje além do PK/slug unique. Aditivo, risco baixo.
4. **Trocar `Task.assignedTo` onDelete Cascade → SetNull** (requer tornar `assignedTo` nullable) — preserva histórico. NÃO puramente aditivo (altera coluna); risco médio, deixar para arquiteto-dados.
5. **Formalizar FK em `Task.leadId`/`contractId` com `onDelete: SetNull`** — evita órfãos; requer backfill/validação de ids existentes antes. Risco médio.
