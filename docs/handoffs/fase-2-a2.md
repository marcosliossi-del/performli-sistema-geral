# HANDOFF — Fase 2 · A2-BACKEND-CORE

> Camada de mutação do módulo Tasks ClickUp-class (sem UI). Contrato 3.3.
> Decisões-base: D-003 (fractional), D-004 (espelho status/statusId), D-005
> (multi-assignee), D-006 (TZ America/Sao_Paulo), D-007 (tenancy), D-010
> (recurrenceRule na task). Ambiente: sem build local, npm bloqueado, Postgres 16
> local para validar SQL.

## 1. O QUE FOI FEITO

### Migration + schema (D-010)
- `prisma/migrations/20260702010000_task_recurrence_rule/migration.sql` —
  `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurrenceRule" JSONB;` (aditiva,
  idempotente). Validada no Postgres local (aplicada 2×, 2ª execução só emite
  NOTICE "already exists, skipping"). `tail` confere: sem lixo no fim do arquivo.
- `prisma/schema.prisma` — campo `recurrenceRule Json?` no model Task.

### Regras puras — `src/lib/tasks/` (sem prisma, testáveis)
- `statusMap.ts` — mapa ÚNICO enum `TaskStatus` ↔ id fixo `st_*` ↔ `StatusGroup`.
  Exporta `statusIdFor(status)`, `statusGroupFor(status)`, `isDoneStatus(status)`.
  Ids `st_*` vêm do backfill da Fase 1 (não renomear sem migração de dados).
- `recurrence.ts` — tipo `RecurrenceRule`, `computeNextOccurrence(rule, from, tz?)`
  (TZ padrão `America/Sao_Paulo`, sem lib nova; aritmética de calendário em
  pseudo-UTC + reconversão via `Intl.DateTimeFormat`), `parseRecurrenceRule(json)`
  (validação zod, retorna `null` se inválido). Bordas cobertas: domingo→segunda,
  virada de semana (sexta→segunda), virada de mês (clamp 31→28/30) e virada de ano.
- `fractional.ts` — `orderBetween(a, b)` base62 PURO (implementação própria,
  BigInt, interpretação por fração; trailing-zeros aparados; `BigInt(0)`/`BigInt(2)`
  em vez de literais `0n`/`2n` por causa do `target: ES2017`). NÃO adiciona a lib
  `fractional-indexing` (npm bloqueado — ver §2).
- `mentions.ts` — `extractMentions(body)` extrai @handles (dedupe + lowercase,
  ignora e-mails).

### Helper transacional
- `src/lib/tasks/mutate.ts` — `mutateTask(taskId, session, patch, activity)`:
  carrega task (clientId+status), `assertClientMutationAccess(allowCS:true)` quando
  há clientId, `update` + `TaskActivity` na MESMA `$transaction`, espelha `statusId`
  via statusMap sempre que `patch.status` presente, `writeAuditLog` best-effort.
  Retorno `{ ok:true } | { error }` — NUNCA lança para o cliente.

### Tenancy
- `src/lib/permissions.ts` — `assertCan(session, action, resource?)` para
  `task.read` | `task.write` | `workspace.admin`: valida `WorkspaceMember` em
  `ws_arkza` e delega a `assertClientMutationAccess` quando há clientId.

### Server actions — `src/app/actions/tasks.ts`
- `updateTaskFields(taskId, patch)` — zod; valida que `assignedTo` existe;
  `TaskActivity 'field_changed'` por campo alterado (from/to legíveis);
  revalida `/operacional /suporte /meu-dia`.
- `setTaskRecurrence(taskId, rule | null)` — grava `recurrenceRule` (null = não
  repetir), activity `'recurrence_changed'`.
- `reorderTask(taskId, beforeOrderIndex, afterOrderIndex)` — `orderBetween` + update.
- `assignTask` / `unassignTask` — M:N via `TaskAuxAssignee`; espelho `assignedTo`
  = responsável principal; `unassign` promove outro assignee a principal e nunca
  deixa `assignedTo` órfão (rejeita remover o único responsável).
- `toggleWatcher(taskId, userId)` — `TaskWatcher` existente.
- `addTaskDependency(blockingId, waitingId)` — cria `TaskDependency` + detecção de
  ciclo por DFS (rejeita com mensagem operacional).
- **`updateTaskStatus` REFATORADA** (assinatura e comportamento visível
  preservados): espelho `statusId` na mesma transação, `writeAuditLog` (antes
  faltava) e clone on-complete quando `recurrenceRule.mode === 'onComplete'`
  (`computeNextOccurrence`, dedupe `recur:{taskId}:{yyyy-mm-dd}`, recria
  checklist desmarcado + auxAssignees, activity `'recurred'`). Guard
  `checkTaskCompletion` continua ANTES; `throw` mantido para SupportBoard/
  SupportList/TaskDrawer/TaskList.

### Espelho `statusId` em TODAS as escritas de status (D-004)
Além do escopo literal (cron), estendi para eliminar QUALQUER divergência
enum↔FK — crítico para o kanban do A4 que posiciona cards por `statusId`:
- **Updates de status** (divergência perigosa): `updateTaskStatus`,
  `operacional.ts` (submit→AGUARDANDO_CS, decide→CONCLUIDO/AJUSTES_SOLICITADOS),
  `warRoom.ts` (fecho→CONCLUIDO/CANCELADO), `task-escalation.ts` markOverdue
  (→ATRASADO), `client-offboarding.ts` (updateMany→CANCELADO).
- **Creates** (statusId passaria a NULL): `tasks.ts` (createTask, clone, ONB-05),
  `suporte.ts`, `warRoom.ts`, `recurrence-engine.ts createTaskForClientRule`,
  `clients.ts` (ONB-04), `client-onboarding.ts`, `client-offboarding.ts`,
  `resultado-engine.ts`, `lead-followup-checker.ts`, `seed-suporte.ts`,
  `app/api/seed/route.ts`.

## 2. DECISÕES TOMADAS
- **Fractional próprio, sem lib** (contraria D-003 na escolha da lib, honra o
  algoritmo): npm bloqueado e sem build local → adicionar `fractional-indexing`
  ao package.json geraria um import não resolvível localmente e nenhum modo de
  provar. Implementação própria (~40 linhas, BigInt, fração base62) testada por
  node. Se o A0 preferir a lib canônica, trocar é 1 função com a mesma assinatura.
- **`statusId` em 100% das escritas de status, não só no cron.** O escopo literal
  do item 4 era `markOverdueTasks` + `createTaskForClientRule`; estendi para todos
  os creates/updates de status porque (a) D-004 diz "mutações escrevem nos dois",
  (b) o A1 handoff lista updateTaskStatus/suporte/warRoom como risco de
  divergência, (c) o A4 vai LER `statusId` no kanban — statusId NULL/obsoleto
  quebraria a coluna. Alternativa descartada: só o cron (deixaria ~10 caminhos
  divergindo).
- **`unassignTask` promove principal.** Como `assignedTo` é NOT NULL (D-005), ao
  remover o principal promovo outro assignee; se não houver, rejeito. Nunca órfão.
- **Clone reusa a regra parseada** (`rule as InputJsonValue`) em vez do
  `JsonValue` cru lido — evita a fricção de tipo Prisma `JsonValue → InputJsonValue`.
- **`recurrenceRule` limpo em WEEKLY-only.** `parseRecurrenceRule` descarta
  `byWeekday` quando `freq !== 'WEEKLY'` (normalização defensiva).

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)
- **Modo `schedule` da recorrência** (varredura diária por data): é do A5
  (Automação/cron). `computeNextOccurrence` já serve os dois modos; o A5 chama a
  mesma função pura na Fase 5. Aqui só o `onComplete` dispara clone.
- **Autowatch (criador/comentarista viram watcher)** e menções→notificação: A2
  entrega `extractMentions` puro; a criação de `Notification`/watcher a partir de
  menção fica com quem tocar comentários (fora do meu escopo de arquivos).
- **`assertCan` nas actions antigas**: usei nas NOVAS; as antigas seguem com
  `assertClientMutationAccess` (instrução explícita de não refatorá-las além do
  listado). `assertCan` delega ao mesmo assert, então o comportamento é coerente.
- **Deprecação do enum `TaskStatus`**: 2ª etapa D-004, fora do MVP.

## 4. COMO VALIDAR

### Migration (Postgres local)
```
service postgresql start
su postgres -c "psql -v ON_ERROR_STOP=1 -d performli_test -f \
  prisma/migrations/20260702010000_task_recurrence_rule/migration.sql"   # 2×
su postgres -c "psql -d performli_test -c \"SELECT data_type FROM \
  information_schema.columns WHERE table_name='Task' AND column_name='recurrenceRule';\""
# → jsonb ; 2ª execução: NOTICE already exists, skipping (idempotente)
```

### Testes de mesa — `computeNextOccurrence` (TZ America/Sao_Paulo, VERIFICADOS)
| freq | regra | from (SP) | saída (SP) | borda |
|---|---|---|---|---|
| DAILY | interval 1 | 2026-07-01 09:00 | 2026-07-02 09:00 | hora local preservada |
| WEEKLY | interval 1 | 2026-07-01 09:00 | 2026-07-08 09:00 | +7 dias |
| WEEKLY | byWeekday[1] | 2026-07-05 10:00 **(dom)** | 2026-07-06 10:00 **(seg)** | domingo→segunda |
| WEEKLY | byWeekday[1] | 2026-07-03 10:00 **(sex)** | 2026-07-06 10:00 **(seg)** | virada de semana |
| MONTHLY | interval 1 | 2026-01-31 10:00 | 2026-02-28 10:00 | clamp fim de mês |
| MONTHLY | interval 1 | 2026-12-15 10:00 | 2027-01-15 10:00 | virada de ano |
| DAILY | skipWeekends | 2026-07-03 10:00 **(sex)** | 2026-07-06 10:00 **(seg)** | pula sáb/dom |
| WEEKLY | interval 2, byWeekday[1] | 2026-07-06 10:00 **(seg)** | 2026-07-20 10:00 | quinzenal |

### Testes de mesa — `orderBetween` (base62, VERIFICADOS + stress)
| a | b | saída | invariante a<r<b |
|---|---|---|---|
| null | null | `V` | ok (chave inicial) |
| `V` | null | `k` | ok (fim) |
| null | `V` | `F` | ok (início) |
| `V` | `l` | `d` | ok |
| `a` | `b` | `aV` | ok (adjacentes → estende) |
| `V` | `V1` | `V0V` | ok (b é extensão de a) |
| `0` | `1` | `0V` | ok |
| null | `0` | THROW | não há chave < valor mínimo (guarda anti-loop) |
Stress: 200 inserções no fim + 200 no início + 200 entre os dois primeiros →
ordenação monotônica preservada; chaves ≤ ~41 dígitos.

### Testes de mesa — `extractMentions` (VERIFICADOS)
| entrada | saída |
|---|---|
| `oi @pablo revisa` | `["pablo"]` |
| `@Ana e @ana` | `["ana"]` (dedupe+lowercase) |
| `fala com @maria.silva!` | `["maria.silva"]` |
| `email joao@arkza.com.br` | `[]` (não é menção) |
| `(@ze) [@lu]` | `["ze","lu"]` |

### Detecção de ciclo — `addTaskDependency` (mesa)
- A→B, B→C, depois add C→A ⇒ rejeitado ("criaria um ciclo"): DFS parte de C
  (blocking) sobre `dependsOn` e alcança A (waiting).
- A→B, depois add A→B de novo ⇒ "Essa dependência já existe".
- add A→A ⇒ "não pode depender de si mesma".

### Type-check
`npx tsc --noEmit` no ambiente reporta apenas *Cannot find module* de `zod`/
`@prisma/client`/`server-only` (node_modules ausente, prisma não gerado) e os
`implicitly any` que derivam disso — ZERO erro de tipo real nos arquivos novos.
Resolve no Vercel (install + `prisma generate`). BigInt-literal já corrigido para
`target: ES2017`.

## 5. RISCOS ATIVOS
- **`recurrenceRule` em produção só existe após deploy da migration nova.** O
  clone on-complete só dispara para tasks que tenham a regra gravada via
  `setTaskRecurrence` (nada retroativo).
- **`computeNextOccurrence` assume offset fixo estável de America/Sao_Paulo** (o
  Brasil não tem DST desde 2019). O cálculo usa `Intl` real, então se o DST voltar
  o comportamento acompanha o runtime; só revalidar as bordas no gate do A5.
- **Ordem manual (`orderIndex`) ainda é majoritariamente NULL** (só preenchida
  on-write por `reorderTask`). Leituras devem cair para `dueDate` como fallback
  (contrato do A1). O A4 precisa semear `orderIndex` ao renderizar/arrastar.
- **`assertCan` é MVP** (checa membership + delega posse). Não cobre Space/List
  ainda porque esses models não existem no schema (adiados na Fase 1).
- **Dois motores de recorrência coexistem** (D-010): templates por cliente
  (`TaskRecurrenceRule`, cron) e regra por task (`Task.recurrenceRule`, on-complete
  aqui / schedule no A5). Não confundir dedupe keys: `{tpl}:{cliente}:{janela}`
  (templates) vs `recur:{taskId}:{data}` (por task).

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (A3-UI-SYSTEM / A4-VIEWS)

**Ler antes:** este handoff, `docs/handoffs/fase-1-a1.md`, DECISIONS.md D-003/004/005/010.

**Contratos de action (assinaturas — não quebrar sem ADR):**
```ts
// src/app/actions/tasks.ts  — todas retornam { ok:true } | { error:string }
//                              EXCETO updateTaskStatus (void + throw, legado)
updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>   // throw no guard
updateTaskFields(taskId: string, patch: {                              // { ok } | { error }
  title?: string; description?: string | null; assignedTo?: string;
  dueDate?: string | null; startDate?: string | null;
  priority?: TaskPriority; supportCategory?: SupportCategory | null; tags?: string[]
}): Promise<{ ok: true } | { error: string }>
setTaskRecurrence(taskId: string, rule: RecurrenceRule | null): Promise<...>
reorderTask(taskId: string, beforeOrderIndex: string|null, afterOrderIndex: string|null): Promise<...>
assignTask(taskId: string, userId: string): Promise<...>
unassignTask(taskId: string, userId: string): Promise<...>
toggleWatcher(taskId: string, userId: string): Promise<...>
addTaskDependency(blockingId: string, waitingId: string): Promise<...>
```
`RecurrenceRule` (de `@/lib/tasks/recurrence`):
```ts
{ freq: 'DAILY'|'WEEKLY'|'MONTHLY'; interval: number;
  byWeekday?: number[] /* 0=Dom..6=Sáb, só WEEKLY */;
  mode: 'onComplete'|'schedule'; skipWeekends?: boolean }
```

**Armadilhas conhecidas:**
- `updateTaskStatus` ainda LANÇA (não retorna `{error}`) — os call-sites atuais
  dependem disso para o rollback otimista. Mantenha o `try/catch` no cliente.
- Para o kanban: agrupe por `statusId` (agora sempre populado) OU pelo enum
  `status`; ambos são coerentes. Grupos semânticos via `statusGroupFor`.
- `reorderTask` calcula a chave no SERVIDOR; passe os `orderIndex` dos vizinhos
  (before/after). Quando a coluna ainda não tem `orderIndex`, use `null` nas bordas.
- Espelho `assignedTo` = primeiro responsável; a lista completa vem de
  `assignedTo` ∪ `TaskAuxAssignee`. "Minhas tarefas" = OR dos dois (D-005).
- `updateTaskFields` só grava e loga campos REALMENTE alterados; enviar o objeto
  inteiro é seguro (no-op vira `{ ok:true }` sem activity).
