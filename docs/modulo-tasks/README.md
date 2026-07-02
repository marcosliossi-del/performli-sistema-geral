# Módulo Tasks ClickUp-class — mapa vivo

> Documentação técnica do módulo (Fases 0-5 do `PROMPT_MESTRE_TASKS.md`, mergeadas
> na main). Guia de uso para o time: `docs/modulo-tasks/GUIA_ARKZA.md`.
> Plano de migração do ClickUp: `MIGRATION_CLICKUP.md` (raiz).
> Histórico e porquês: `DECISIONS.md` + `docs/handoffs/fase-*.md` + `docs/schema-diff.md`.

---

## 1. Schema (o que existe e como convive)

Todos os models em `prisma/schema.prisma`. O módulo NÃO criou tabelas paralelas ao
que já existia — estendeu (regra crítica do CLAUDE.md: nenhum model novo se um
existente serve). Âncoras de linha aproximadas na main atual.

### Models do módulo

| Model | Linha | Uma linha |
|---|---|---|
| `Task` | :822 | A tarefa. Núcleo: `title`, `status` (enum) **+ `statusId` FK espelho**, `priority`, `dueDate`/`startDate`, `assignedTo` (principal, NOT NULL), `clientId?`, `orderIndex?` (fractional), `recurrenceRule Json?`, `idempotencyKey? @unique` (coração do dedupe), evidência/guard (`requiresEvidence`, `requiresReview`, `evidence`), Hub de Suporte (`isSupport`, `supportDirection`, `supportCategory`), subtasks via `parentId` |
| `TaskList` | :803 | A "List" (1 lista = 1 cliente via `clientId?`); **`externalId? @unique` = id da lista no ClickUp**; `statusSetId?` → StatusSet |
| `TaskArea` | :755 | A "Space" da Arkza: 10 áreas operacionais (`code AreaCode`) |
| `TaskAuxAssignee` | :927 | M:N oficial de responsáveis (`@@unique([taskId,userId])`) — o "TaskAssignee" do alvo |
| `TaskWatcher` | :935 | M:N de seguidores (botão "Seguir" do painel) |
| `TaskChecklistItem` | :943 | Checklist flat na task: `label`, `done`, `required`, `order Int` |
| `TaskComment` | :953 | Comentário: `authorId`, `body`, `mentions String[]`, `internal` |
| `TaskActivity` | :974 | Trilha append-only por task: `actorId?`, `action String`, `fromValue?`, `toValue?` — alimenta o `ActivityFeed` |
| `TaskDependency` | :986 | Aresta `blockingId` → `dependentId` (`@@unique`); ciclo rejeitado por DFS na action |
| `TaskCustomFieldDefinition` / `Value` | :1006 / :1020 | Campos personalizados (definição global por `key`, valor `String?` por task) |
| `TaskSavedView` | :1129 | `ownerId?` + `config Json` — reservado p/ views salvas (ainda **sem action de escrita**; filtros hoje persistem em localStorage) |
| `TaskRecurrenceRule` | :1076 | Motor de recorrência **por template+cliente** (as 15 fixas): `frequency`, `dayOfWeek/dayOfMonth`, `anchorDate?` (quinzenal), `lastRunAt` |
| `TaskAutomationRule` | :1095 | Regra de automação: `trigger`, `actionType`, **`conditions Json?` (:1104)**, **`actionConfig Json?` (:1105)** — ver §6 |
| `AutomationLog` | — | Log de toda execução de motor (SUCESSO / DUPLICIDADE_EVITADA / FALHA) |
| `Workspace` / `WorkspaceMember` | :571 / :580 | Tenancy D-007: workspace único `ws_arkza`, membros backfillados de `User` |
| `StatusSet` / `Status` | :603 / :617 | Pipeline como dado: set default `sset_arkza` com 11 Status de ids fixos `st_*` (backfill Fase 1 — `docs/schema-diff.md §3`) |

### Enums do módulo

| Enum | Linha | Valores |
|---|---|---|
| `TaskStatus` | :638 | A_FAZER · EM_ANDAMENTO · AGUARDANDO_CLIENTE/GESTOR/CS · EM_VALIDACAO · AJUSTES_SOLICITADOS · BLOQUEADO · ATRASADO · CONCLUIDO · CANCELADO |
| `TaskPriority` | :652 | BAIXA · MEDIA · ALTA · CRITICA (UI: Baixa/Normal/Alta/Urgente) |
| `StatusGroup` | :596 | NOT_STARTED · ACTIVE · DONE · CLOSED (semântica dos relatórios/recorrência) |
| `WorkspaceRole` | :564 | OWNER · ADMIN · MEMBER · GUEST |
| `SupportCategory` | :690 | TRAFEGO · DEMANDA_DA_AGENCIA · SUCESSO_DO_CLIENTE |
| `TaskType` | :659 | 21 tipos (SIMPLES, RECORRENTE, REUNIAO, WAR_ROOM, ONBOARDING…) |

### As três decisões de convivência (ler antes de mexer em qualquer mutação)

- **D-004 — status enum ↔ `statusId` FK (espelho).** O enum `TaskStatus` continua
  sendo a fonte de leitura legada; `Task.statusId` aponta para o `Status` do set
  `sset_arkza`. **Toda escrita de status grava OS DOIS na mesma transação** — o mapa
  único está em `src/lib/tasks/statusMap.ts` (`statusIdFor`, `statusGroupFor`,
  `isDoneStatus`). Divergir o espelho quebra o Kanban (agrupa por `statusId`).
  Deprecar o enum é 2ª etapa, fora do MVP.
- **D-005 — multi-assignee com `assignedTo` espelho.** `TaskAuxAssignee` é o M:N
  oficial; `Task.assignedTo` (NOT NULL) permanece como **responsável principal** e
  é escrito em toda mutação. Leituras "minhas tarefas" = OR dos dois. `unassignTask`
  promove outro assignee a principal e **recusa remover o único responsável**.
- **D-010 — dois motores de recorrência, papéis distintos.**
  1. **Templates por cliente** (`TaskRecurrenceRule` + `recurrence-engine.ts`): as
     ~15 rotinas fixas de tráfego, fan-out por cliente ativo, dedupe
     `{tplId}:{clientId}:{wkey}`.
  2. **Regra individual por task** (`Task.recurrenceRule Json`): estilo ClickUp,
     shape `{ freq, interval, byWeekday?, mode: 'onComplete'|'schedule', skipWeekends? }`,
     dedupe `recur:{taskId}:{yyyy-mm-dd}`.
  Não confundir as chaves de dedupe; a montagem do clone é única
  (`src/lib/tasks/recurClone.ts createRecurrenceOccurrence`, on-complete herda a
  regra `carryRule:true`, ocorrência agendada é inerte `carryRule:false`).

### Camada pura / helpers (`src/lib/`)

| Arquivo | Papel |
|---|---|
| `lib/tasks/statusMap.ts` | Mapa único enum ↔ `st_*` ↔ StatusGroup (D-004) |
| `lib/tasks/recurrence.ts` | `RecurrenceRule` + `computeNextOccurrence(rule, from, tz)` + `parseRecurrenceRule` (TZ America/Sao_Paulo, D-006) |
| `lib/tasks/fractional.ts` | `orderBetween(a, b)` — fractional indexing base62 próprio (D-003) |
| `lib/tasks/mentions.ts` | `extractMentions(body)` — parser de @handles |
| `lib/tasks/mutate.ts` | `mutateTask(taskId, session, patch, activity)` — authz + update + TaskActivity na MESMA transação; espelha `statusId` |
| `lib/tasks/recurClone.ts` | `createRecurrenceOccurrence` + `occurrenceKey` + `recurIdempotencyKey` (clone compartilhado dos 2 caminhos) |
| `lib/tasks/panel.ts` | `loadTaskPanel(taskId, session)` — leitura completa do painel com recorte por papel/posse (retorno `null` uniforme, anti-enumeração) |
| `lib/permissions.ts` | `assertCan(session, action, resource?)` — membership em `ws_arkza` + delega posse a `assertClientMutationAccess` |
| `lib/task-completion-guard.ts` | Bloqueia CONCLUIDO sem evidência/checklist/validação (`requiresEvidence`/`requiresReview`) |

---

## 2. Server actions (assinatura × o que faz × authz)

Contrato padrão: retorno `{ ok: true, ... } | { error: string }` — **exceto
`updateTaskStatus`, que é `void` + throw** (legado; call-sites otimistas dependem
do throw para rollback). Toda mutação grava `TaskActivity`; as críticas gravam
`AuditLog`. Assinaturas são contrato público — não mudar sem ADR em DECISIONS.md.

### `src/app/actions/tasks.ts`

| Action | O que faz | Authz |
|---|---|---|
| `createTask(input)` | Cria task (legado; usada por fluxos internos); espelha `statusId`; dispara hook de automação `task.created` | `assertClientMutationAccess` quando há cliente |
| `updateTaskStatus(taskId, status): Promise<void>` | Muda status (enum + `statusId` na mesma transação); roda `checkTaskCompletion` ANTES; ao entrar em CONCLUIDO com `recurrenceRule.mode='onComplete'` clona a próxima ocorrência (dedupe `recur:{id}:{data}`); dispara automações `task.status_changed`; AuditLog | posse via cliente; **lança** em negação/guard |
| `updateTaskFields(taskId, patch)` | Edição de campos: `title, description, assignedTo, dueDate, startDate, priority (null→MEDIA), supportCategory, tags` — grava/loga só o que mudou | `mutateTask` → `assertCan('task.write')` + posse |
| `setTaskRecurrence(taskId, rule \| null)` | Grava/limpa `recurrenceRule` (zod: freq enum, interval 1-365, byWeekday 0-6) | `mutateTask` |
| `reorderTask(taskId, beforeOrderIndex, afterOrderIndex)` | Calcula `orderBetween` no servidor e grava `orderIndex` | `mutateTask` |
| `assignTask(taskId, userId)` / `unassignTask(taskId, userId)` | M:N via `TaskAuxAssignee` + espelho `assignedTo`; unassign promove principal, nunca deixa órfão | `ownershipGuard` (ADMIN/CS; MANAGER com assignment; task interna: responsável) |
| `toggleWatcher(taskId, userId)` | Adiciona/remove seguidor | `ownershipGuard` |
| `addTaskDependency(blockingId, waitingId)` / `removeTaskDependency(...)` | Cria/desfaz aresta com detecção de ciclo (DFS, trava 500 nós); AuditLog | `assertCan('task.write')` nos DOIS lados |

### `src/app/actions/operacional.ts`

| Action | O que faz | Authz |
|---|---|---|
| `createOperacionalTask(input)` | Criação da Central (modal completo e quick-add); nasce em `A_FAZER` | ANALYST bloqueado; posse do cliente |
| `loadTaskDetail(taskId)` | Leitura do TaskDrawer legado (`?task=`). **Recorte por papel/posse aplicado** (operacional.ts:326-340, mesma regra do `loadTaskPanel`) — fecha o IDOR C1 do security-review | ADMIN/CS amplo; MANAGER exige `ClientAssignment`; task interna exige ser responsável/aux; sem acesso → `null` |
| `addTaskComment(taskId, body)` | Comenta; retorna `{ ok, comment: {id, body, authorId, authorName, createdAt} }` (`AddTaskCommentResult`) | posse (allowCS) |
| `toggleChecklistItem(itemId)` / `addChecklistItem(taskId, label)` / `removeChecklistItem(itemId)` | Checklist; remoção recusa item obrigatório ou já concluído (mensagem operacional) | posse (allowCS) |
| `submitTaskForValidation(taskId, evidence)` | Gestor envia p/ CS: exige checklist obrigatório + evidência ≥5 chars → `AGUARDANDO_CS` | só responsável ou ADMIN |
| `decideTaskValidation(taskId, decision, note?)` | CS aprova (→CONCLUIDO, reaplica o completion-guard) ou pede ajustes (→AJUSTES_SOLICITADOS, motivo obrigatório); `TaskApproval` + AuditLog | só CS/ADMIN |

### `src/app/actions/suporte.ts`

| Action | O que faz | Authz |
|---|---|---|
| `createSupportDemand(input)` | Cria demanda do Hub (`isSupport=true`, categoria/prioridade/vencimento) | zod + posse do cliente |
| `moveStage(...)` | Movimenta demanda entre estágios do Hub (espelha `statusId`) | posse |

> **Estado do security-review** (`docs/security-review.md`): o único ❌ (C1,
> IDOR em `loadTaskDetail`) foi corrigido na main. Permanecem as recomendações
> R2-R6 (⚠️): guard unificado p/ task sem cliente em 5 superfícies legadas,
> `.max()` nos textos, whitelist do `TaskFieldPatch`, timing-safe compare do
> CRON_SECRET, rate limit fora do login.

---

## 3. Componentes (`src/components/tasks/` + `src/components/operacional/`)

### Vocabulário visual — Fase 3 (`src/components/tasks/`, playground em `/dev/components`)

Todos controlados por props (não consultam dados). Catálogo completo de props:
`docs/handoffs/fase-3-a3.md §CATÁLOGO`. Cores exclusivamente via `var(--ak-*)`
(zero hex novo) — mapa fonte em `tokens.ts`.

| Componente | O que é |
|---|---|
| `tokens.ts` | Labels/cores/grupos do enum legado (`LEGACY_STATUS`), meta de prioridade, cor determinística de avatar/tag |
| `StatusBadge` | Pílula de status (união `custom \| legacy`, resolvida por `resolveStatus`); variante interativa com dropdown |
| `PriorityFlag` | Bandeira Urgente/Alta/Normal/Baixa + variante dropdown |
| `AssigneeAvatars` | Stack de avatares (até 3 +N) + popover multi-select com busca |
| `DueDateChip` | Chip de prazo: futuro / "Hoje" / "Atrasada há N dias" / "Sem prazo" + ícone Repeat; dia calculado em America/Sao_Paulo |
| `TagChip` | Chip de tag com paleta por hash |
| `TaskRow` / `TaskCard` | Linha da Lista (display-only) / card do Kanban (contadores checklist+comentários, grip de drag) |
| `ChecklistBlock` | Itens marcáveis com toggle otimista + progresso + add inline |
| `CommentThread` | Thread texto-puro (sem HTML — XSS zero), menções @ realçadas |
| `ActivityFeed` | Timeline `action → frase pt-BR` com from→to |
| `CustomFieldInput` | Switch por `CustomFieldType` |
| `InlineEdit` / `ConfirmDialog` / `Popover` | Primitivos de edição/confirm/popover |
| `types.ts` | `TaskVM` — view-model de row/card |

### Painel da task — Fase 4a

| Componente | O que é |
|---|---|
| `TaskPanel.tsx` | Painel único com `variant: 'page' \| 'slideover'`. Seções: header editável (título/status/prioridade/assignees/datas/Seguir) → Recorrência → Descrição → Checklist → Dependências → abas Comentários\|Atividade → rodapé (origem, datas, flags de evidência/validação). Estado otimista + rollback em 100% das mutações |
| `RecurrenceEditor.tsx` | Editor ClickUp-like da regra por task (frequência, intervalo, dias da semana, "Ignorar dias não úteis", "Não repetir"). Exporta `describeRecurrence(rule)`. Modo fixo `onComplete` |

### Views da Central — Fase 4b (`src/components/operacional/`)

| Componente | O que é |
|---|---|
| `taskBoard.ts` | Motor compartilhado puro: `TaskFilters` + `applyFilters` (AND), persistência localStorage de view+filtros, `isOverdue`/`matchesDue` (TZ SP), `compareTasks` (orderIndex → dueDate), `toTaskVM`, contrato `BoardHandlers` |
| `TaskFiltersBar.tsx` | Barra única de filtros (status/responsável/prioridade multi, cliente, vencimento, busca, "Limpar (N)") |
| `TasksListView.tsx` + `TaskListRow.tsx` | View Lista: grupos por status colapsáveis, edição inline compondo os átomos interativos da Fase 3 |
| `TasksKanbanView.tsx` | View Kanban: colunas por status, DnD @hello-pangea/dnd (entre colunas = `updateTaskStatus`; dentro = `reorderTask`), encerradas limitadas a 20 |
| `DueDateEditor.tsx` / `QuickAddTask.tsx` | Prazo inline / criação rápida "+ Nova tarefa" (só em A fazer) |
| `OperacionalBoard.tsx` | Orquestração: toggle das 5 views (Lista·Kanban·Calendário·Por Cliente·Por Gestor), estado otimista D-001, preserva `?task=`/TaskDrawer legados |

---

## 4. Rotas

| Rota | Arquivo | O quê |
|---|---|---|
| `/t/[taskId]` | `src/app/(dashboard)/t/[taskId]/page.tsx` | Página cheia da task (deep-link/refresh). `requireSession` → `loadTaskPanel` → `notFound()` uniforme |
| `@modal/(.)t/[taskId]` | `src/app/(dashboard)/@modal/(.)t/[taskId]/page.tsx` (+ `@modal/default.tsx`) | Rota interceptada: slide-over sobre a view em navegação suave. Degrada graciosamente para a página cheia |
| `/operacional` | `src/app/(dashboard)/operacional/page.tsx` | Central de Tarefas: KPIs + 5 views + filtros + quick-add + deep-link `?task=` (TaskDrawer legado) |
| `/suporte` | `src/app/(dashboard)/suporte/page.tsx` | Hub de Suporte: tasks `isSupport=true` (ADMIN/CS tudo; MANAGER/ANALYST só clientes atribuídos) + `NewSupportDemand` |
| `/meu-dia` | `src/app/(dashboard)/meu-dia/page.tsx` | Tarefas do usuário por urgência + carga por gestor |
| `/validacoes` | `src/app/(dashboard)/validacoes/page.tsx` | Fila de validação da CS (AGUARDANDO_CS/EM_VALIDACAO) |
| `/dev/components` | `src/app/(dashboard)/dev/components/page.tsx` | Playground do vocabulário visual — **só ADMIN** (redirect `/` caso contrário); fora do Sidebar |

Contrato de navegação: **abrir o painel = `<Link href="/t/{id}">`**. O slot
`@modal` já está montado no layout do grupo `(dashboard)` — qualquer tela nova só
precisa linkar.

---

## 5. Crons (`vercel.json` + `src/app/api/cron/*`)

Todas as rotas exigem `CRON_SECRET` (Bearer ou `x-cron-secret`; fail-closed).
Horários em **UTC** no `vercel.json`.

| Cron | Schedule (UTC) | O que roda |
|---|---|---|
| `/api/cron/recurrences` | `0 10 * * *` (07:00 Brasília) | **Os 2 motores de recorrência, isolados por try/catch** (route.ts:33-40): ① `runTaskRecurrences` — templates por cliente (15 fixas; fan-out por cliente ativo, responsável resolvido por papel via `Client.gestorId/csId/...`, dedupe `{tpl}:{cliente}:{janela}`); ② `runScheduledTaskRecurrences` (`src/services/task-schedule-recurrence.ts`) — regras por task `mode:'schedule'` (âncora = `dueDate`, catch-up com CAP 60, ocorrência inerte, dedupe `recur:{id}:{data}`). Resposta: `{ ok, force, rulesProcessed, created, skipped, failed, scheduled:{verificadas, criadas, puladas, falhas} }`. `?force=1` só afeta os templates |
| `/api/cron/daily` | `0 11 * * *` (08:00 Brasília) | Rotina diária completa (sync de integrações + saúde + churn + …). Toques em Task: **`markOverdueTasks`** (daily/route.ts:226 → task-escalation.ts:63; vencidas em A_FAZER/AJUSTES_SOLICITADOS → ATRASADO) e **`escalateOverdueTasks`** (route.ts:234 → task-escalation.ts:16; atrasadas 2+ dias → prioridade ALTA + tag `escalado` + `delayReason`) |
| `/api/cron/digest` | `30 11 * * *` | Digest WhatsApp |
| `/api/cron/resultados` | `0 9 * * 1` (segunda) | Motor de resultado ROAS→etapa |

⚠️ **A ordem recurrences (10:00) ANTES do daily (11:00) importa**: o schedule
avança o `dueDate` da série antes do overdue rodar; inverter os horários faria
séries de recorrência serem marcadas ATRASADO indevidamente
(`docs/handoffs/fase-5-a5.md §5`).

Idempotência: `Task.idempotencyKey @unique` + tratamento de P2002 → rodar
qualquer cron N vezes no dia = zero duplicata (cenários A-E no handoff da Fase 5).

---

## 6. Motor de automação v0 — como criar uma regra

Executor: `src/services/task-automation.ts` (`runTaskAutomations`). Está pendurado
**apenas** em `createTask` (evento `task.created`) e `updateTaskStatus`
(`task.status_changed`), best-effort após a transação — mutações por
`updateTaskFields` ou criações via cron/onboarding NÃO disparam o motor (v0).

**Não existe UI/admin nem seed de regras** — regra se cria direto no banco
(`TaskAutomationRule`). Campos que o motor lê:

| Campo | Valores aceitos |
|---|---|
| `trigger` | exatamente `'task.created'` ou `'task.status_changed'` (match literal — task-automation.ts:101) |
| `conditions` (Json) | `{ "listId"?, "clientId"?, "status"? }` — AND entre os presentes; `status` = valor do enum `TaskStatus`. Fallback: `condition` legado (string JSON) |
| `actionType` | `'notify'` (cria `Alert` tipo `TASK_AUTOMATION` no cliente da task — **exige task com cliente**; dedupe por alerta não-lido idêntico) ou `'assign'` (troca `assignedTo` + TaskActivity + AuditLog; idempotente se já atribuída) |
| `actionConfig` (Json) | notify: `{ "alertTitle"?, "alertBody"? }` · assign: `{ "assignTo": "<userId>" }` (obrigatório) |
| `active` | só regras `true` são avaliadas |

### Exemplo 1 — notificar quando uma task do cliente entrar em "Aguardando CS"

```sql
INSERT INTO "TaskAutomationRule"
  (id, name, trigger, "actionType", conditions, "actionConfig", active, "createdAt", "updatedAt")
VALUES (
  'rule_aguardando_cs_bambola',
  'Avisar CS quando Bambola entrar em Aguardando CS',
  'task.status_changed',
  'notify',
  '{"clientId": "<id do Client Bambola>", "status": "AGUARDANDO_CS"}',
  '{"alertTitle": "Task da Bambola esperando a CS", "alertBody": "Uma tarefa entrou em Aguardando CS e precisa de validação."}',
  true, now(), now()
);
```

### Exemplo 2 — atribuir ao Pablo toda task criada numa lista

```sql
INSERT INTO "TaskAutomationRule"
  (id, name, trigger, "actionType", conditions, "actionConfig", active, "createdAt", "updatedAt")
VALUES (
  'rule_assign_pablo_lista_x',
  'Task nova na lista X vai para o Pablo',
  'task.created',
  'assign',
  '{"listId": "<id da TaskList>"}',
  '{"assignTo": "<userId do Pablo>"}',
  true, now(), now()
);
```

Depuração: toda execução gera `AutomationLog` (`ruleId`, status
SUCESSO/DUPLICIDADE_EVITADA/FALHA, `reason` legível). Se "a automação não
disparou", verifique nesta ordem: (1) a mutação passou por
`createTask`/`updateTaskStatus`? (2) `trigger` bate literalmente com o evento?
(3) `conditions` batem com a task? (4) `AutomationLog` registrou FALHA com motivo?

Limitações conhecidas do v0 (backlog): ações `sendWhatsApp`/`createSubtask`,
throttle temporal do dedupe de notify, hook nos demais pontos de criação, UI de
configuração.

---

## 7. Onde continuar

- **Handoffs por fase:** `docs/handoffs/` (1-a1 dados · 2-a2 backend · 3-a3 UI ·
  4a/4b views · 4b-actions · 5-a5 automação · 7-a8 docs). QA da Fase 6:
  `docs/qa-report-fase6.md` (APROVADO — 8/8 fluxos, 26/26 puras, carga 2.000
  tasks < 50 ms).
- **Riscos vivos:** convivência enum↔statusId (D-004) até a 2ª etapa;
  `orderIndex` majoritariamente NULL (reorder "sobe ao topo" até a coluna ganhar
  índices); recomendações R2-R6 do security-review; achado P2 do QA — faltam
  índices `taskId` em `TaskChecklistItem`/`TaskComment`/`TaskApproval`/
  `TaskAttachment` (migration aditiva pendente no A1).
- **Backlog estratégico (não implementar sem gate):** BLOCO 7.3 do
  `PROMPT_MESTRE_TASKS.md` — templates de List, POPs como checklist, portal do
  cliente, ação sendWhatsApp, ⌘K já existente evoluído, relatório semanal.
