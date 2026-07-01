# Auditoria — Dimensão Banco de Dados

> Escopo: `prisma/schema.prisma` (64 models) e `prisma/migrations` (46 migrations).
> Data: 2026-07-01. Read-only fora de `docs/`.

## Banco de Dados

### (a) Domínios de models

- **Auth/Team** — `User`, `Role`.
- **Clientes** — `Client`, `ClientAssignment`, `ClientInteraction`, `ClientStatusStreak`, `ClientChat`, `ClientChatMessage`, `ClientInsight`. Enums: status, businessType, resultado/etapa, ficha CS (nps/relacionamento/curva).
- **Plataformas/Métricas** — `PlatformAccount`, `MetricSnapshot`, `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Nuvemshop** — `NuvemshopStore`, `NuvemshopOrder`.
- **Central Operacional (Task)** — `Task` + ~20 satélites (`TaskArea`, `POPProcess`, `POPStep`, `POPFriction`, `TaskList`, `TaskChecklistItem`, `TaskComment`, `TaskAttachment`, `TaskActivity`, `TaskDependency`, `TaskApproval`, `TaskCustomFieldDefinition/Value`, `TaskTemplate`+`Step`/`Field`, `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskWatcher`, `TaskAuxAssignee`, `TaskSavedView`, `TaskSLA`, `OperationalRoutine`).
- **War Room** — `CriticalProtocol`, `AuditLog`, `Alert`.
- **CSX/Relatórios** — `ClientWeeklyCheckin`, `WeeklyChecklist`, `WeeklyReport`, `MonthlyReport`.
- **Financeiro/Asaas** — `AsaasCustomer`, `AsaasPayment`, `AsaasSubscription`, `AsaasTransfer`, `FinancialCategory`, `Expense`.
- **Comercial/CRM** — `AgencyLead`, `AgencyActivity`.
- **IA/RAG** — `AIConversation`, `AIMessage`, `KnowledgeDocument`, `KnowledgeChunk`.
- **Config** — `IntegrationSetting`, `Contract`, `Operation`.

### (b) Pontos fortes

- **Idempotência recente exemplar.** Migrations de 2026-06-30+ usam `DO $$ ... EXCEPTION WHEN duplicate_object` para enums, `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`. Ex.: `20260630120000_warroom_and_auditlog`, `20260701020000_add_query_indexes`.
- **Integridade referencial coerente.** `onDelete: Cascade` em dados dependentes do `Client`; `SetNull` correto em vínculos opcionais (`AuditLog.actor/client`, `CriticalProtocol.responsible`, `AsaasCustomer.client`, `Contract.responsible`). AuditLog append-only preserva trilha mesmo com ator removido.
- **Idempotência de negócio.** Uniques de janela em quase todos os snapshots/relatórios (`MetricSnapshot @@unique([platformAccountId,date])`, `ClientWeeklyCheckin @@unique([clientId,weekStart])`, `Task.idempotencyKey @unique`) — evita duplicidade em cron.
- **Índices dedicados a filtros quentes** (status, dueDate, datas de vencimento) — `AsaasPayment` indexa `status`, `dueDate`, `paymentDate`; `Task` indexa 6 colunas.
- **Truque anti-NULL em unique**: `CampaignSnapshot.adSetId @default("")` evita buraco de unicidade com NULL (linha 1155).

### (c) Riscos por severidade

**ALTO — nenhum bloqueante encontrado.** Migrations aditivas, sem DROP destrutivo em produção.

**MÉDIO**

- **Migrations antigas não-idempotentes.** `20260321113638_init` e as de mar–mai/2026 usam `CREATE TYPE`, `CREATE INDEX` e `ADD COLUMN` crus (sem guarda). Evidência: 9 migrations sem `CREATE INDEX IF NOT EXISTS`; `init/migration.sql:2` `CREATE TYPE "Role"...` sem guarda. Risco só se um banco parcialmente migrado re-rodar essas migrations; em fluxo `migrate deploy` normal não afeta. Não reescrever migrations já aplicadas — apenas manter o padrão novo daqui pra frente.
- **FKs "soltas" em `Task`.** `Task.leadId` e `Task.contractId` (linhas 681–682) são `String?` sem relação FK ("sem FK" comentado). Sem integridade referencial nem `ON DELETE`: apagar um `AgencyLead`/`Contract` deixa `Task` apontando para id inexistente. Ainda sem uso no código (`grep` 0 refs), então baixo impacto atual; travar antes de virar feature.
- **Índice composto ausente em query quente de financeiro.** `inadimplencia-checker.ts:44` e `financeiro/summary/route.ts:102` filtram `AsaasPayment WHERE status='OVERDUE' AND dueDate<=today`. Existem índices separados de `status` e `dueDate`, mas não o composto `(status,dueDate)`. Volume baixo (~30 clientes) → otimização, não urgência.
- **`AlertType` sobrecarregado.** Enum único acumula alertas de sync, KPI, War Room, financeiro, checkin e antichurn (linhas 444–468), reusado também como `CriticalProtocol.trigger`. Acoplamento crescente; monitorar antes que vire enum gigante difícil de particionar por domínio.

**BAIXO**

- **Models órfãos (0 refs em `src/`).** `TaskSavedView`, `OperationalRoutine`, `TaskSLA`, `TaskAutomationRule`, `AsaasTransfer`, `TaskCustomFieldDefinition`. São scaffolding da Central Operacional / Asaas ainda não ligados. Não remover (roadmap), mas registrar como "reservado, não implementado".
- **`Client.tags`/`Task.tags` como `String[]`** sem índice GIN — busca por tag faz scan. Aceitável no volume atual.
- **Campos de status como `String` em vez de enum.** `AsaasSubscription.status`/`cycle`, `AsaasTransfer.status`, `FinancialCategory.type`, `Contract`/`Expense.source` (linhas 1391–1392, 1410, 1432, 1539) — perde validação no banco; comentários documentam valores esperados.
- **`AIMessage`, `ClientInsight`, `KnowledgeChunk`** sem índice na coluna de ordenação além do FK — leituras pequenas, ok.

### 🔒 Travas / Fluidez

**Índices aditivos seguros (aplicáveis agora, `CREATE INDEX IF NOT EXISTS`, risco baixo):**

- `AsaasPayment(status, dueDate)` — acelera régua de inadimplência (FIN-19), query já existente.
- `Task(status, dueDate)` composto — cockpit de tarefas atrasadas (hoje só índices simples).
- `Alert(clientId, type)` — filtros de alerta por tipo/cliente sem índice hoje.

**Travas (endereçar antes de virar feature):**

- Definir `onDelete` para `Task.leadId`/`Task.contractId` — via FK real com `SetNull` ou limpeza aplicativa documentada. Enquanto sem uso, é trava barata.

**Limpezas de baixo risco:**

- Anotar models órfãos como reservados (comentário no schema), não dropar.
- Migrar `String` → enum nos campos de status Asaas/Financeiro em migration aditiva futura (com backfill), quando houver janela.

> Nenhuma ação de escrita aplicada. Migrations já aplicadas NÃO devem ser reescritas.
