# AUDITORIA FASE 0 — Sistema de Tasks do Performli vs. Alvo ClickUp-Class

> Executor da FASE 0 sob A0-ORQUESTRADOR · PROMPT_MESTRE_TASKS.md (BLOCOS 0, 2, 3) · 2026-07-01
> Escopo: inventário e mapeamento. Nenhuma proposta de código. Âncoras em `arquivo:linha`.

---

## 1. Inventário do sistema de tasks EXISTENTE

### 1.1 Model `Task` (prisma/schema.prisma:745-833)

| Grupo | Campos (linha) |
|---|---|
| Núcleo | `id`, `title`, `description`, `status TaskStatus @default(A_FAZER)` (749), `priority TaskPriority @default(MEDIA)` (750), `dueDate?` (751), `clientId?` (752), `assignedTo String` — **único, obrigatório, FK User** (753, 825) |
| Central Operacional | `type TaskType @default(SIMPLES)` (758), `origin TaskOrigin @default(MANUAL)` (759), `areaId?→TaskArea` (761), `popId?→POPProcess` (763), `listId?→TaskList` (765), `leadId?`/`contractId?` — ids **sem FK** (768-769) |
| Ciclo de vida | `requesterId?`, `requestedAt?`, `startDate?`, `completedAt?`, `completedById?` (771-775), `slaHours?`, `slaBreached` (777-778) |
| Recorrência | `templateId?→TaskTemplate` (780), `recurrenceId?→TaskRecurrenceRule` (782), **`idempotencyKey? @unique`** (784) — chave anti-duplicação de todo o motor |
| Evidência/guard (FASE 5) | `evidence?`, `blockReason?`, `delayReason?` (786-788), `reviewerId?` (id sem FK, 791), `requiresEvidence`, `requiresReview` (792-793), `qualityScore?`, `riskScore?` (794-795), `completionNotes?`, `sourcePopCode?`, `isGeneratedByAgent`, `generatedByAgentName?` (796-799) |
| Tags | `tags String[] @default([])` (801) — **strings livres, sem entidade Tag** |
| Hub de Suporte | `isSupport @default(false)` (804), `supportDirection SupportDirection?` (805), `supportCategory SupportCategory?` (806) |
| Subtasks | `parentId?` self-relation "Subtasks" (808-810) — recursivo, já existe |
| Relações | `checklist TaskChecklistItem[]` (812), `comments TaskComment[]` (813), `attachments` (814), `activities TaskActivity[]` (815), `watchers TaskWatcher[]` (816), `approvals` (817), `customValues` (818), `auxAssignees TaskAuxAssignee[]` (819), `dependsOn`/`blocks TaskDependency[]` (821-822) |
| Índices | `@@index` simples: clientId, assignedTo, status, dueDate, areaId, popId (827-832) |

### 1.2 Models satélites

| Model | Linha | Shape essencial |
|---|---|---|
| `TaskArea` | 680-693 | `code AreaCode @unique`, `name`, `order Int`, `active`; relaciona POPs, lists, templates, tasks |
| `POPProcess`/`POPStep`/`POPFriction` | 695-726 | POP com código (ex. OPE-06), steps ordenados, fricções |
| `TaskList` | 728-743 | **JÁ EXISTE**: `name`, `areaId?`, **`externalId? @unique` = id da lista no ClickUp** (733), **`clientId?` = lista-representa-cliente** (734, SetNull), `active`. É a semente do conceito List do alvo (1 List = 1 cliente), sem statusSet, sem folder/space, sem orderIndex |
| `TaskAuxAssignee` | 835-841 | M:N auxiliar `@@unique([taskId,userId])` — **já existe junção de co-responsáveis**, mas `assignedTo` continua sendo o dono único |
| `TaskWatcher` | 843-849 | M:N `@@unique([taskId,userId])` — igual ao alvo |
| `TaskChecklistItem` | 851-859 | nome real é este (não "ChecklistItem"): `label`, `done`, `required`, `order Int` — flat na task, sem entidade Checklist agrupadora, sem assignee por item, `order Int` (não fracionário) |
| `TaskComment` | 861-870 | `authorId`, `body`, `mentions String[]`, `internal Bool` — sem `editedAt`/soft delete |
| `TaskAttachment` | 872-880 | url/filename/uploadedById |
| `TaskActivity` | 882-892 | shape: **`actorId?`, `action String`, `fromValue String?`, `toValue String?`** — strings, não JSON before/after nem enum ActivityType; `@@index([taskId])` |
| `TaskDependency` | 894-901 | `dependentId`/`blockingId`, `@@unique` — **existe**, sem `type`, sem detecção de ciclo no código |
| `TaskApproval` | 903-912 | approver/approved/note/decidedAt — usado pelo fluxo de validação |
| `TaskCustomFieldDefinition` | 914-926 | `key @unique` **global** (não por List), `type CustomFieldType` (666-678: TEXT/NUMBER/CURRENCY/PERCENT/DATE/BOOLEAN/SELECT/MULTISELECT/URL/USER_REF/CLIENT_REF), `areaId?`/`popId?`, `options String[]` |
| `TaskCustomFieldValue` | 928-936 | `value String?` único — **sem colunas espelho** valueText/valueNumber/valueDate do alvo (3.1:343-353) |
| `TaskTemplate` | 938-962 | `code @unique`, defaults (type/priority/status/assigneeRole), `relativeDueDays`, `slaHours`, `evidenceRequired`, steps/fields/recurrence |
| `TaskRecurrenceRule` | 984-1001 | `frequency RecurrenceFrequency`, `dayOfWeek/dayOfMonth/hour/minute`, **`anchorDate?`** (âncora QUINZENAL, 993), `active`, **`lastRunAt`** (995) |
| `TaskAutomationRule` | 1003-1015 | trigger/condition/actionType strings + templateId — motor declarado, executor não encontrado no código |
| `AutomationLog` | 1017-1032 | ruleId?/recurrenceId?/clientId?/assigneeId?/createdTaskId?, `status AutomationLogStatus` {SUCESSO, FALHA, DUPLICIDADE_EVITADA} (660-664), `reason?` |
| `TaskSavedView` | 1034-1040 | `ownerId?`, `name`, `config Json` — equivalente embrionário de ViewPreference |
| `OperationalRoutine` | 1042-1049 | rotinas com cadência |
| `TaskSLA` | 1051-1057 | `scopeType`+`scopeKey`+`hours` |

### 1.3 Enums

| Enum | Linha | Valores |
|---|---|---|
| `TaskStatus` | 563-575 | **11 valores**: A_FAZER, EM_ANDAMENTO, AGUARDANDO_CLIENTE, AGUARDANDO_GESTOR, AGUARDANDO_CS, EM_VALIDACAO, AJUSTES_SOLICITADOS, BLOQUEADO, ATRASADO, CONCLUIDO, CANCELADO (nota de backfill dos enums antigos em 560-561) |
| `TaskPriority` | 577-582 | BAIXA, MEDIA, ALTA, CRITICA |
| `TaskType` | 584-607 | 21 valores (SIMPLES…GERADA_POR_IA) |
| `SupportDirection` | 610-613 | CLIENTE_PARA_NOS, NOS_PARA_CLIENTE |
| `SupportCategory` | 615-619 | TRAFEGO, DEMANDA_DA_AGENCIA, SUCESSO_DO_CLIENTE |
| `TaskOrigin` | 621-629 | MANUAL, TEMPLATE, RECORRENCIA, AUTOMACAO, ALERTA, IA, WHATSAPP |
| `AreaCode` | 631-642 | 10 áreas |
| `RecurrenceFrequency` | 644-658 | 13 valores (DIARIA…POR_CONDICAO — inclui frequências orientadas a evento) |

### 1.4 Mapeamento contra o alvo do BLOCO 3.1 (PROMPT_MESTRE_TASKS.md:200-399)

| Alvo (3.1) | Já existe? | Equivalente parcial | Lacuna |
|---|---|---|---|
| `Workspace`/`WorkspaceMember` | ❌ | Nada; sistema single-tenant (0 ocorrências de workspaceId) | Criar do zero; toda query terá de ganhar filtro |
| `Space` | ❌ | `TaskArea` (schema:680) cumpre papel de "área" (Operação/Comercial/CS) sem hierarquia | Decidir: TaskArea evolui p/ Space ou coexiste |
| `Folder` | ❌ | — | Criar (opcional por ideologia) |
| `List` | ⚠️ parcial | `TaskList` (schema:728) com `externalId` ClickUp e `clientId` (1 lista = 1 cliente) | Sem `statusSetId`, `folderId`, `orderIndex`, `description`, multi-list; `Task.listId` é **opcional** (alvo: obrigatório) |
| `StatusSet`/`Status` (FK) | ❌ | **enum `TaskStatus` 11 valores** (schema:563) hardcoded em dezenas de arquivos | Maior lacuna estrutural: enum→FK exige backfill + convivência |
| `StatusGroup` | ❌ | Semântica implícita espalhada (ex. `notIn [CONCLUIDO,CANCELADO]` em task-escalation.ts:15-53) | Criar grupos NOT_STARTED/ACTIVE/DONE/CLOSED |
| `Task.orderIndex` (fractional) | ❌ | **Nenhuma ordenação manual em Task** (só `order Int` em TaskChecklistItem:858, TaskTemplateStep:970, TaskArea:684) | Fractional indexing inexistente — confirmado; kanban atual muta status, nunca posição |
| `TaskAssignee` M:N | ⚠️ parcial | `assignedTo String` único obrigatório (schema:753) + `TaskAuxAssignee` M:N já existente (835) | Promover auxAssignees ou criar junção espelho; `assignedTo` usado em toda query quente |
| `TaskWatcher` M:N | ✅ | schema:843 | Autowatch (criador/comentarista) não implementado |
| `TaskList` (multi-list junção) | ❌ | O nome `TaskList` **já está ocupado** pelo model List-like | Colisão de nome com o alvo 3.1:322 — renomear conceito na convergência |
| `Tag`/`TaskTag` | ❌ | `Task.tags String[]` (schema:801); tag literal 'escalado' usada em task-escalation.ts:15-53 | Sem entidade, sem cor, sem escopo por Space |
| `Checklist`+`ChecklistItem` | ⚠️ parcial | `TaskChecklistItem` flat (schema:851), sem agrupador nem assignee por item | Agrupador Checklist + assigneeId + orderIndex fracionário |
| `CustomFieldDefinition/Value` | ⚠️ parcial | `TaskCustomFieldDefinition` global por key (914) / `Value.value String?` (928) | Escopo por List; colunas espelho p/ filtro SQL; tipos MONEY≈CURRENCY |
| `TaskDependency` | ⚠️ parcial | schema:894, `@@unique(dependentId,blockingId)` | Sem `type`, sem detecção de ciclo, sem UI |
| `Comment` | ⚠️ parcial | `TaskComment` (861) com mentions String[] | Sem editedAt/deletedAt; menções não geram watcher/notificação |
| `Activity` | ⚠️ parcial | `TaskActivity` action/fromValue/toValue strings (882) | Sem enum de tipo, sem JSON before/after; não é gravado em toda mutação |
| `Notification` | ❌ | `Alert` (schema:539) é por **cliente** (clientId obrigatório), não por usuário/atividade | Criar Notification userId+activityId+readAt |
| `ViewPreference` | ⚠️ parcial | `TaskSavedView` ownerId?+config Json (1034) | Sem @@unique(userId,listId), não usado por view alguma |
| `Automation` | ⚠️ parcial | `TaskAutomationRule` (1003) — schema pronto, **sem executor** | Motor trigger→condition→action a implementar (Fase 5) |
| Recorrência | ✅ forte | `TaskRecurrenceRule` (984) + recurrence-engine com idempotência + `lastRunAt` | Modo "recur on complete" só existe hardcoded p/ ONB (tasks.ts:111-147); alvo pede regra na task (`recurrenceRule Json`) |
| Subtasks recursivas | ✅ | `parentId` self-relation (808) | UI não expõe |
| Attachments (fase 2) | ✅ schema | `TaskAttachment` (872) | — |
| `Priority` enum | ⚠️ | BAIXA/MEDIA/ALTA/CRITICA (577) vs URGENT/HIGH/NORMAL/LOW do alvo | Mapeamento 1:1 possível (CRITICA↔URGENT), decidir se renomeia |
| `timeEstimateMin` | ❌ | `slaHours` é outra semântica | Fase 2 |
| `archived` | ❌ | `TaskList.active` existe; Task não tem archived | Aditivo simples |

---

## 2. Superfícies de UI que consomem Task hoje (quebram se o model mudar)

### 2.1 Páginas

| Rota | O que faz | Campos de Task dependidos |
|---|---|---|
| `/operacional` | Board central via `getOperacionalBoard` (dal.ts:1114-1133) | status, priority, dueDate, assignedTo, areaId, popId, type, isSupport |
| `/suporte` | Hub de Suporte, `prisma.task.findMany` na page:27-34 (select :36-60) | **isSupport, supportDirection, supportCategory**, status, updatedAt |
| `/meu-dia` | `getMinhaSemana` (dal.ts:3078-3087) | assignedTo, dueDate, status |
| `/minha-semana`, `/tasks` | **redirects** (confirmado) | — |
| `/validacoes` | `getValidationQueue` (dal.ts:3308-3328) | requiresReview, reviewerId, status EM_VALIDACAO, updatedAt |
| `/aceite` | `getAceiteOperacional` (dal.ts:3439) | requesterId, status |
| `/cockpit` | counts + demandas atrasadas (dal.ts:1315-1321) | status, dueDate |
| `clients/[slug]` | `getClienteTarefas` (dal.ts:3233-3242) | clientId, status, dueDate |
| `/check-ins` | usa `WeeklyCheckin`, **não** Task; só badge via pop.code OPE-06 | — |
| `/recorrencias` | `groupBy` de tasks por recorrência (page:90) | recurrenceId, status |
| Sidebar | `getSidebarCounts` (dal.ts:3384-3392) — 5 counts paralelos, um filtra por pop.code | isSupport, status, requiresReview |
| CommandPalette | `search.ts:33` busca por title | title, status |

### 2.2 Componentes

OperacionalBoard (tipo OperacionalTask), TaskDrawer (`loadTaskDetail` — operacional.ts:164), NovaTarefaModal (`createOperacionalTask`), ValidationQueue (submit/decide), SupportViews / SupportList (`moveStage` :114/:317) / SupportBoard (`updateTaskStatus` :96), NewSupportDemand.

### 2.3 Server actions

| Arquivo | Pontos-chave |
|---|---|
| `app/actions/tasks.ts` | `createTask` :43; `updateTaskStatus` :62 — chama task-completion-guard e dispara **recorrência ONB-05 hardcoded** (:111-147, create best-effort fora de transação) |
| `app/actions/operacional.ts` | create :49, addTaskComment :97, toggleChecklistItem :121, loadTaskDetail :164, submitTaskForValidation :263, decideTaskValidation :322 (as duas últimas com $transaction :290-301/:362-384) |
| `app/actions/suporte.ts` | :63 — mutações do Hub de Suporte |
| `app/actions/warRoom.ts` | espelha task WAR_ROOM :140-177 e fecha :220-233 com `idempotencyKey warroom:{protocolId}` |
| `app/actions/clients.ts` | onboarding ONB-04 :77 |
| `app/actions/search.ts` :33 · `app/actions/recurrences.ts` :24/:32 | busca / gestão de regras |

### 2.4 Services/lib

| Arquivo | Papel | Dependências críticas |
|---|---|---|
| `lib/dal.ts` | getTasks :1069, board :1114, contexto :1181, cockpit :1315, gestoresCarga :3160, minhaSemana :3078, clienteTarefas :3233, validationQueue :3308, sidebarCounts :3384, aceite :3439 | praticamente todos os campos |
| `lib/recurrence-engine.ts` | cria tasks recorrentes; `idempotencyKey {tplId}:{clientId}:{wkey}` :176, create :189, lastRunAt :284 | templateId, recurrenceId, idempotencyKey, origin |
| `lib/task-completion-guard.ts` :19 | bloqueia CONCLUIDO sem evidência/checklist/review | requiresEvidence, requiresReview, evidence, checklist |
| `lib/task-escalation.ts` | markOverdueTasks :62-72, escalateOverdueTasks :15-53 | status, dueDate, priority, tags ('escalado'), delayReason |
| `lib/client-onboarding.ts` :147 / `client-offboarding.ts` :104/:150 | geram/cancelam tasks com idempotencyKey | idempotencyKey, clientId, status |
| `lib/resultado-engine.ts` :144 | tasks `otimizacao:{id}:{window}` | idempotencyKey |
| `lib/lead-followup-checker.ts` :53/:68 | tasks de follow-up de lead | leadId, idempotencyKey |
| `lib/seed-operacao.ts` :250/:281/:289 · `lib/seed-suporte.ts` :114/:133/:147 | seeds das ~15 recorrentes por cliente e do Hub | templates, listas, idempotencyKey |

---

## 3. Crons e automações existentes

- **4 rotas cron**, todas protegidas por `CRON_SECRET` (Bearer ou `x-cron-secret`; comparação `===` simples, não timing-safe): `daily` (route.ts:35-42, GET :357-363, POST :366-372), `recurrences` (:10-17, `?force=1` :23 — **recorrência NÃO roda no daily**, é cron dedicado), `resultados` (:11-18), `digest` (:12-22).
- **Steps do `runDailySync`** (src/app/api/cron/daily/route.ts:44): Meta :69 · GA4 :80 · GoogleAds :90 · Nuvemshop :100 · weekly goals (segunda) :112 · health :125 · oscilações :141 · churn :156 · silenciosos :171 · check-ins :186 · Asaas :201 · inadimplência :209 · leads :217 · **markOverdueTasks :225** · **escalateOverdueTasks :233** · budget :241 · critical :256 · war room :271/:286 · weekly reports/checklists (domingo) :303/:318 · contract expiry :334 · renewExpiredContracts :342.
- **Toques em Task:** (1) markOverdueTasks — `updateMany` dueDate<now e status ∈ [A_FAZER, AJUSTES_SOLICITADOS] → **ATRASADO** (task-escalation.ts:62-72; nota: ATRASADO é um *status*, não flag derivada); (2) escalateOverdueTasks — bump para ALTA + tag 'escalado' + delayReason + activity + AutomationLog por task (task-escalation.ts:15-53); (3) runTaskRecurrences — dedupe por idempotencyKey (recurrence-engine.ts:177), create :189, logs SUCESSO/FALHA/DUPLICIDADE_EVITADA :214/:164/:179, lastRunAt :284.
- **Shapes:** AutomationLog (schema:1017-1032, escrito inline sem helper); AuditLog (schema:491-509) com helper `writeAuditLog` (lib/audit.ts:44-68, nunca lança). `lastRunAt` existe só em TaskRecurrenceRule (schema:995) — o daily não persiste última execução global.

---

## 4. Design system e padrões de UI

- **Tokens `--ak-*`** em `src/app/globals.css` :root L11-64 (superfícies s0-s3, hair, texto hi/mid/low, brand, status green/amber/red/orange/violet, glass/shadow/spring/radius). Utilitários semânticos no `@theme inline` L66-108: `--color-danger`→ak-red (L86), warning (L87), success (L88), info (L89), surface/surface-raised (L90-91), text-hi/mid/low (L92-94), otimo/regular/ruim + brand (L76-80); badges estáticos L194-196. **Allow-list de hex congelada**: comentário L198-207, overrides L209-291.
- **Optimistic UI existente:** padrão consistente `useState` + closure de rollback + `toast(msg,'err')` — PipelineBoard (L25/L66-68/L70-75/L77-82), SupportBoard (L50/L84-90/L103-106), SupportList (L107/L121-123/L134-137). **Não** usa `useOptimistic` nem `useTransition` nos boards. OperacionalBoard não tem mutação otimista própria (só filtros L266-273).
- **DnD — dois padrões coexistem:** HTML5 nativo (PipelineBoard L27/133/159/181; SupportBoard L52/129/159/183) e `@hello-pangea/dnd ^18.0.1` (package.json L18) usada **apenas** em `src/components/comercial/LeadKanban.tsx` (L4/L51/L183/L213/L223). `@dnd-kit` (preferência do BLOCO 0 §9) **não está instalado**. Nenhum drag persiste ordem — só muda status/etapa.
- **components/ui/:** badge, button, card, input, progress, Skeleton, EmptyState, ToastViewport.
- **useModalA11y:** `src/lib/useModalA11y.ts` L16-67 (Esc, focus-trap, retorno de foco, scroll-lock).
- **Radix instalados** (package.json L21-31): avatar, dialog, dropdown-menu, label, progress, scroll-area, select, separator, slot, tabs, toast.

---

## 5. Padrão de server actions e auth

- **Sessão:** `requireSession` (lib/dal.ts:12-16, React.cache, redirect /login); session = {userId, role, operationalRole?} (session.ts:10).
- **Ownership:** `assertClientMutationAccess` (lib/audit.ts:17-37): ADMIN passa; CS só com `allowCS`; MANAGER exige ClientAssignment; ANALYST lança. **Lança exceção** (não retorna erro).
- **Auditoria:** `writeAuditLog` (lib/audit.ts:44-68) nunca lança.
- **Divergências vs. contrato 3.3 (7 passos):**
  - Retorno: `tasks.ts` mistura throw/void (`createTask` :33 throw / :59 `{ok,id}`; `updateTaskStatus` void + throw :70/:88, **sem writeAuditLog**); `suporte.ts` e `operacional.ts` usam `{ok}|{error}` — contrato alvo (retorno tipado, nunca exceção crua) só parcialmente atendido.
  - Em operacional.ts, `addTaskComment` :94 e `toggleChecklistItem` :117 deixam o assert escapar sem try/catch.
  - Zod: tasks.ts e suporte.ts (nativeEnum+safeParse); operacional.ts validação manual.
  - `$transaction`: só em submitTaskForValidation :290-301 e decideTaskValidation :362-384; o gatilho ONB-05 em updateTaskStatus (tasks.ts:111-147) é create best-effort **fora** de transação.
  - Activity: não é gravada em toda mutação (viola regra de ouro #7 do alvo).
- **RBAC:** `enum Role {ADMIN, MANAGER, ANALYST, CS}` (schema:11-16); `OperationalRole` 6 valores (schema:70-77) — **não governa autorização**. `canViewAll` = ADMIN||CS (dal.ts:23-25). Checagens ad-hoc espalhadas (operacional.ts:32/:212/:324, dal.ts:3302). Sem módulo central tipo `assertCan`.
- **Tenancy:** single-tenant. **0 ocorrências** de workspaceId/tenantId/orgId. Isolamento é por Client + ClientAssignment (`assignments some userId` — dal.ts:68, 343, 1067, 1112).

---

## 6. As 5 queries mais quentes hoje

| # | Query | Local | Filtros/ordem | Cobertura de índice |
|---|---|---|---|---|
| 1 | Board operacional | dal.ts:1114-1133 | OR assignedTo / client.assignments | índices simples assignedTo/status (827-829); sem composto |
| 2 | Hub de Suporte | app/suporte/page.tsx:27-34 | `isSupport` + status not CANCELADO, orderBy `updatedAt desc` | **isSupport sem índice; updatedAt sem índice** |
| 3 | Meu Dia | dal.ts:3078-3087 | assignedTo + dueDate + status | sem composto (assignedTo,status,dueDate) |
| 4 | Sidebar counts | dal.ts:3384-3392 | 5 counts paralelos (um via pop.code) | idem #2 para o count de suporte |
| 5 | Cockpit / validações | dal.ts:1315-1321 · 3308-3328 | status+dueDate / EM_VALIDACAO orderBy updatedAt | sem composto (status,dueDate) |

Extra: `getGestoresCarga` (dal.ts:3160-3171) agrega em memória **sem filtro de status no banco**.

---

## 7. Riscos de convergência identificados

1. **Enum `TaskStatus` → Status FK é a migração mais invasiva.** 11 valores usados em dezenas de pontos (actions, dal.ts, crons, guards, seeds, componentes). Exige estratégia de convivência (coluna nova `statusId` + backfill + espelhamento bidirecional durante a transição), migrations em 2 etapas (BLOCO 0 §2). Agravante: **ATRASADO e BLOQUEADO são status**, não flags — no alvo, overdue é derivado de dueDate e bloqueio vem de TaskDependency; markOverdueTasks (task-escalation.ts:62-72) reescreve status e perderia o status "real" da task.
2. **`assignedTo String` único e obrigatório → M:N.** FK obrigatória com onDelete Cascade (schema:753/825), usada em todas as queries quentes e no RBAC implícito. Migração exige junção espelho (TaskAuxAssignee já existe como base) mantendo `assignedTo` como "primeiro assignee" até o corte.
3. **`idempotencyKey` é o coração de 8 motores** (recorrência, ONB-04/05, offboarding, warroom, otimização, followup de lead, import ClickUp). Qualquer refatoração de criação de task (ex. duplicateTask, recur-on-complete) tem de preservar o formato das chaves (`{tplId}:{clientId}:{wkey}`, `warroom:{protocolId}`, `otimizacao:{id}:{window}`) ou o dedupe quebra silenciosamente.
4. **Contratos que NÃO podem quebrar:** Hub de Suporte recém-lançado (isSupport/supportDirection/supportCategory + moveStage/updateTaskStatus otimistas), ~15 tasks recorrentes por cliente via seed-operacao + recurrence-engine, task-completion-guard (requiresEvidence/requiresReview bloqueando CONCLUIDO), fluxo de validação (EM_VALIDACAO/TaskApproval), e o espelho War Room.
5. **Colisão de nomes com o alvo 3.1:** `TaskList` atual é a "List" (com externalId ClickUp e clientId); o alvo usa `TaskList` como junção multi-lista (3.1:322). `TaskActivity` (strings) vs `Activity` (JSON). `TaskCustomFieldValue.value String` vs colunas espelho. Renomeações exigem duas migrations cada.
6. **Zero ordenação manual + dois padrões de DnD.** Nenhum orderIndex em Task; fractional indexing inexistente (decisão travada 3.2); DnD nativo nos boards + @hello-pangea/dnd só no LeadKanban; @dnd-kit não instalado — decisão de lib e de padrão otimista (useState+rollback vs useOptimistic) precisa ir para DECISIONS.md.
7. **Tenancy inexistente.** Multi-tenant "desde o dia zero" (regra de ouro #6) vs sistema 100% single-tenant — introduzir Workspace exige default backfilled em toda tabela nova e decisão explícita sobre quais tabelas legadas ganham workspaceId.
8. **Divergências do contrato de actions** (§5) precisam ser normalizadas antes da Fase 2, ou o A2 herdará três estilos de retorno/erro.
