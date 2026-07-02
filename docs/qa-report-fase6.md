# QA REPORT — Fase 6 (Qualidade) · A7-QA-VALIDATOR

> Gate adaptado (PROJECT_STATE §R3: ambiente sem npm/build). Verificação por:
> carga real no Postgres 16 local (`performli_test`), execução das funções puras
> em Node 22 e trace estático dos 8 fluxos críticos. **A7 não altera código do
> módulo** — apenas testa e reporta.
>
> Ambiente confirmado: Node v22.22.2 · tsc 6.0.2 · PostgreSQL 16.13 (`performli_test`).
> **Nota de ambiente:** ao iniciar, `performli_test` continha apenas a tabela
> `TaskAutomationRule` (migrations NÃO estavam aplicadas). Reconstruí o banco do
> zero aplicando as **56 migrations em ordem cronológica** (todas OK, 0 falhas) —
> só então o schema alvo (Task + índices Fase 1 + 24 models da Central) ficou
> disponível para a carga. `lint/build/test` não são executáveis localmente
> (`node_modules` vazio, registry npm bloqueado — R3): dependem do Vercel CI.

---

## 1. TESTE DE CARGA REAL — queries quentes (Postgres local)

### 1.1 Semeadura sintética (ids prefixo `qa_`)
| Entidade | Volume | Distribuição |
|---|---|---|
| User (fake) | 6 | 1 ADMIN · 1 CS · 4 MANAGER |
| Client (fake) | 30 | ACTIVE (maioria) + PAUSED/CHURNED; cada um com `ClientStatusStreak` (OTIMO/REGULAR/RUIM) e 1 `ClientAssignment` a um MANAGER |
| **Task** | **2.000** | status variados (30% A_FAZER, 20% EM_ANDAMENTO, resto AGUARDANDO_*/EM_VALIDACAO/CONCLUIDO/CANCELADO); `dueDate` -10..+10 dias e ~14% nulo; `isSupport` = **200 (10%)** espalhados por status; `assignedTo` alternando entre os 6 users; `orderIndex` **NULL em 1.900 (95%)**; `popId` OPE-06/OPE-07 em parte; `statusId` espelho preenchido |
| TaskChecklistItem | 4.000 | 2 por task |
| TaskActivity | 2.000 | 1 por task (1.900) + 100 concentradas em `qa_task_1` (teste do feed) |

`ANALYZE` rodado em todas as tabelas antes dos planos. **Só INSERTs — schema não tocado.**

### 1.2 Índices Fase 1 presentes em `Task` (conferidos via `\d`)
`Task_assignedTo_status_dueDate_idx` · `Task_status_dueDate_idx` ·
`Task_isSupport_status_idx` · `Task_updatedAt_idx` · `Task_clientId_status_idx` ·
`Task_statusId_idx` — **todos os 6 criados.**

### 1.3 EXPLAIN (ANALYZE, BUFFERS) — resumo por query quente
| # | Query (reconstruída do código) | Plano | Índice Fase 1 usado? | Seq scan em Task? | Tempo |
|---|---|---|---|---|---|
| Q1a | Board operacional ADMIN (`getOperacionalBoard`, sem WHERE) | Seq Scan + quicksort | n/a (sem filtro) | **Sim — ÓTIMO** (lê 100% das linhas de propósito) | **2,19 ms** |
| Q1b | Board MANAGER (escopo posse: `assignedTo` OR `clientId IN (assignments)`) | Seq Scan + hashed SubPlan | não (OR não-sargável) | Sim — aceitável (766/2000, filtro amplo) | **0,82 ms** |
| Q1c | Board — relação `checklist` (`taskId IN (...)`) | Hash Join (Seq×2) | n/a (carga em massa) | (join massivo, ótimo) | **1,64 ms** |
| Q2 | Suporte (`isSupport=true AND status<>CANCELADO ORDER BY updatedAt`) | **Bitmap Index Scan `Task_isSupport_status_idx`** | ✅ SIM | não | **0,08 ms** |
| Q3 | Meu-dia (`assignedTo` + `status NOT IN(...)` ORDER BY dueDate,priority) | Bitmap Index Scan `Task_assignedTo_idx` (single-col) + filtro | parcial¹ | não | **0,31 ms** |
| Q4a | Sidebar `meuDia` count | **Index Only Scan `Task_assignedTo_status_dueDate_idx`** | ✅ SIM (composite Fase 1) | não | **0,05 ms** |
| Q4b | Sidebar `abertas` count | **Index Only Scan `Task_clientId_status_idx`** | ✅ SIM (Fase 1) | não | **0,28 ms** |
| Q4c | Sidebar `checkins` count (open + POP OPE-06) | Nested Loop + Bitmap `Task_popId_idx` | pré-existente | não | **0,09 ms** |
| Q4d | Sidebar `validacoes` count (AGUARDANDO_CS/EM_VALIDACAO) | **Index Only Scan `Task_status_dueDate_idx`** | ✅ SIM (Fase 1) | não | **0,06 ms** |
| Q4e | Sidebar `suporte` count (isSupport + status IN) | **Index Only Scan `Task_isSupport_status_idx`** | ✅ SIM (Fase 1) | não | **0,03 ms** |
| Q5 | Feed activity por `taskId` (take 30, desc) | **Bitmap Index Scan `TaskActivity_taskId_idx`** + top-N heapsort | ✅ (índice próprio) | não | **0,08 ms** |

¹ Q3 usa o índice `Task_assignedTo_idx` (mono-coluna) em vez do composite porque o
filtro de status é `NOT IN` (negação, não-sargável) — o planner acerta ao filtrar
o status na re-checagem. Comportamento correto.

### 1.4 Leituras do teste
- **Todas as queries quentes < 50 ms** (na prática todas < 3 ms). Meta atingida com folga.
- **Os índices da Fase 1 são USADOS**: `Task_assignedTo_status_dueDate_idx` (Q4a),
  `Task_status_dueDate_idx` (Q4d), `Task_isSupport_status_idx` (Q2/Q4e),
  `Task_clientId_status_idx` (Q4b) aparecem nos planos como Index (Only) Scan.
  `Task_updatedAt_idx` e `Task_statusId_idx` não foram exercitados por estas 5
  queries (o planner preferiu `isSupport` por ser mais seletivo em Q2), mas
  existem e são válidos.
- **Prova de usabilidade:** com `SET enable_seqscan=off`, o board (Q1a) passa a usar
  `Task_dueDate_idx` (Incremental Sort, 1,79 ms) — confirma que os índices são
  utilizáveis; o Seq Scan natural é apenas a escolha ótima de custo em tabela de
  2.000 linhas (Seq Scan é mais barato que índice quando não há filtro seletivo —
  isso **não** indica índice faltante).
- `pg_stat_user_tables` pós-teste: `Task` idx_scan=6013 / seq_scan=34 (uso pesado
  de índice); os poucos seq scans são as queries sem filtro (board) / com OR amplo
  (escopo MANAGER), onde Seq Scan é o plano correto.

### 1.5 ACHADO DE PERFORMANCE (P2 — não bloqueante)
`TaskChecklistItem`, `TaskComment`, `TaskApproval`, `TaskAttachment` **não têm
índice em `taskId`** (só PK em `id`; a FK não cria índice no Postgres). Confirmado:
`pg_stat` mostra `TaskChecklistItem` idx_scan=**0** / seq_scan=6.

- Impacto real medido (P1 do probe): carregar o checklist de UMA task
  (`WHERE taskId=X`, feito a **cada abertura de painel** e em cada render de board
  por-task) faz **Seq Scan** varrendo 4.000 linhas (`Rows Removed by Filter: 3998`).
  A 4.000 linhas custa 0,33 ms — porém é **O(total de itens)** por lookup e cresce
  linearmente conforme o módulo ClickUp-class escala (objetivo do projeto).
- `TaskComment` idem: lido no board via `_count` e no painel (`take 30`).
- Tabelas de junção (`TaskWatcher`, `TaskAuxAssignee`, `TaskCustomFieldValue`)
  **estão cobertas** pelo índice único composto com `taskId` como coluna líder —
  sem problema. `TaskActivity` já tem `TaskActivity_taskId_idx` — sem problema.

**Recomendação (devolver ao A1-ARQUITETO-DADOS, migration ADITIVA):**
`CREATE INDEX "TaskChecklistItem_taskId_idx" ON "TaskChecklistItem"("taskId");`
e equivalentes para `TaskComment`, `TaskApproval`, `TaskAttachment`. É dívida de
performance preventiva — **não** reprova a Fase 6 (todas as queries hoje < 50 ms).

### 1.6 Limpeza
Todos os dados `qa_` removidos ao final. Antes → depois:
User 6→0 · Client 30→0 · ClientAssignment 30→0 · ClientStatusStreak 30→0 ·
Task 2000→0 · TaskChecklistItem 4000→0 · TaskActivity 2000→0. **Zero linhas `qa_`
remanescentes.**

---

## 2. VERIFICAÇÃO ESTÁTICA — 8 fluxos críticos (trace de código)

| # | Fluxo | Trace principal (arquivo:linha) | Veredito |
|---|---|---|---|
| 1 | **Criar task** → espelho statusId + activity | `operacional.ts:58` `createOperacionalTask` → authz ANALYST `:61` + `assertClientMutationAccess(allowCS)` `:68` → `status:'A_FAZER'` + `statusId: statusIdFor('A_FAZER')` `:85` → `activities.create 'created'` `:94` → `writeAuditLog` `:102`. (Form: `tasks.ts:35 createTask`, statusId `:65`, activity `:71`.) | ✅ |
| 2 | **Editar campos** → activity por campo | `tasks.ts:295 updateTaskFields` → zod `:298` → diff por campo com `activity 'field_changed'` (título/desc/resp/prazo/início/prioridade/categoria/tags) `:324–370` → `mutateTask` `:374` = transação `update`+`TaskActivity[]`+espelho `statusId`+`AuditLog` (`mutate.ts:36`, posse `:53`, statusId `:63`, AuditLog `:88`). No-op vira `{ok}` sem activity `:372`. | ✅ |
| 3 | **Mover status (kanban)** → guard → espelho → hook automação | `tasks.ts:93 updateTaskStatus` → posse `:114` → **guard** `checkTaskCompletion` `:122` (bloqueia crítica + grava `blockReason` + `throw` `:129`) → transação `update`+`statusId`+`activity 'status_changed'` `:134` → `writeAuditLog` `:150` → **hook** `runTaskAutomations('task.status_changed')` best-effort `:249`. Kanban DnD entre colunas chama `updateTaskStatus` (fase-4b). | ✅ |
| 4 | **Concluir com recorrência on-complete** (clone + dedupe) | `tasks.ts:164` (concluindoAgora) → `parseRecurrenceRule` `:165` → `mode==='onComplete'` `:166` → `computeNextOccurrence(rule, new Date())` `:171` (próxima no FUTURO) → `createRecurrenceOccurrence(carryRule:true)` `:172` (`recurClone.ts:76`: dedupe `recur:{id}:{yyyy-mm-dd}` `:85`, `findUnique`→skip `:87`, P2002→`skipped` `:134`, clona checklist desmarcado + auxAssignees + activity `recurred` + espelho statusId). Best-effort try/catch `:200`. | ✅ |
| 5 | **Recorrência agendada (cron)** → série avança → ocorrência inerte | `task-schedule-recurrence.ts:74 runScheduledTaskRecurrences` → `findMany recurrenceRule not DbNull AND status notIn(CANCELADO,CONCLUIDO)` `:82` → só `mode==='schedule'` `:97` → loop `occurrenceKey(anchor)<=hoje` **CAP 60** `:131` → `createRecurrenceOccurrence(carryRule:false)` (**inerte**, anti-explosão) `:133` → avança `dueDate` da série `:174` (=lastRunAt via updatedAt) → **try/catch POR task** `:100/:176` + **AutomationLog** SUCESSO/DUPLICIDADE_EVITADA/FALHA `:143–186`. | ✅ |
| 6 | **Comentar** → retorno real → substitui otimista | `operacional.ts:136 addTaskComment` → `assertTaskWrite` `:145` → cria comment e retorna `{id,body,authorId,authorName,createdAt(ISO)}` `:147/:156` + activity `commented` `:151`. UI: `TaskPanel.tsx:327 submitComment` cria `tmp-…` `:328`, chama action, **troca pelo registro real** `:338`, remove tmp em erro `:344`. | ✅ |
| 7 | **Dependência** (ciclo + authz dois lados; remover) | `tasks.ts:586 addTaskDependency` → auto-dep `:589` → **authz dos DOIS lados** `assertCan('task.write')` `:600–601` → dupe check `:606` → **detecção de ciclo DFS** sobre `dependsOn` com trava `MAX_GRAPH_NODES=500` `:616–631` → create+activity `:634` + AuditLog `:642`. `removeTaskDependency:654` (mesma authz dois lados `:665`, activity `dependency_removed`+AuditLog). | ✅ |
| 8 | **Filtros + reorder** (fractional + semeadura de coluna) | `tasks.ts:417 reorderTask` → `orderBetween(before,after)` `:426` (erro→`{error}` operacional `:427`) → `mutateTask{orderIndex}` `:431`. Filtros: motor client-side `applyFilters` (AND) em `taskBoard.ts` (fase-4b). ⚠️ Ver risco: `orderIndex` 95% NULL → drop entre dois NULL sobe ao topo do bloco (limitação herdada A2/A4b, documentada, não-bloqueante). | ✅ |

**Segurança transversal (checklist do gate):** toda mutação passa por
`requireSession` + (`assertCan`/`assertClientMutationAccess`/`ownershipGuard`) →
**auth + papel + posse** presentes em 100% dos fluxos. `assertClientMutationAccess`
(`audit.ts:17`): ADMIN livre, CS livre só com `allowCS`, MANAGER exige
`ClientAssignment`, ANALYST barrado. Mutações sensíveis gravam `AuditLog`. Crons
protegidos por `CRON_SECRET` (A5/A6). Sem endpoint público novo, sem segredo
hardcoded, automação v0 sem chamada externa. Nenhuma ❌ de segurança introduzida.

---

## 3. FUNÇÕES PURAS — executadas de verdade (Node 22, `--experimental-strip-types`)

Fontes copiadas de `src/lib/tasks/{fractional,mentions}.ts` (verbatim) e
`recurrence.ts` (`computeNextOccurrence` + helpers, byte-a-byte; zod/`parseRecurrenceRule`
omitidos por não estarem sob teste). **Resultado: 26 PASS / 0 FAIL.**

### recurrence — `computeNextOccurrence` (TZ America/Sao_Paulo)
| Caso | Entrada | Saída (SP) | PASS |
|---|---|---|---|
| domingo→segunda (WEEKLY seg) | 2026-07-05 10:00 (dom) | 2026-07-06 10:00 | ✅ |
| sexta→segunda (vira semana) | 2026-07-03 10:00 (sex) | 2026-07-06 10:00 | ✅ |
| 31/jan→fev (clamp) | 2026-01-31 10:00 | 2026-02-28 10:00 | ✅ |
| dezembro→janeiro (vira ano) | 2026-12-15 10:00 | 2027-01-15 10:00 | ✅ |
| skipWeekends DAILY | 2026-07-03 10:00 (sex) | 2026-07-06 10:00 | ✅ |
| interval>1 WEEKLY quinzenal | 2026-07-06 10:00 (seg) | 2026-07-20 10:00 | ✅ |
| interval>1 DAILY +3 | 2026-07-01 09:00 | 2026-07-04 09:00 | ✅ |
| MONTHLY 31/jan +2m (mês 31d) | 2026-01-31 10:00 | 2026-03-31 10:00 | ✅ |

### fractional — `orderBetween`
- Byte-a-byte: `(null,null)="V"` · `("V",null)="k"` · `(null,"V")="F"` ·
  `("0","1")="0V"` · `("a","b")="aV"` · `("V","V1")="V0V"` — ✅ (6/6)
- Bordas inválidas (a≥b) **lançam** — ✅
- **500 inserções monotônicas** (250 fim + 250 início): ordenação preservada +
  chaves únicas + tamanho máx **51 dígitos** — ✅
- **Saturação lança erro operacional**: martelar o MESMO gap satura após **318**
  inserções → `throw "…posição saturada. Mova o item para outro ponto da lista."` — ✅
  (esperado; `MAX_LEN=64`; ninguém solta 300+ itens no mesmíssimo ponto).

### mentions — `extractMentions`
`"oi @pablo revisa"→["pablo"]` · `"@Ana e @ana"→["ana"]` (dedupe+lowercase) ·
`"fala com @maria.silva!"→["maria.silva"]` · `"email joao@arkza.com.br"→[]`
(e-mail NÃO é menção) · `"(@ze) [@lu]"→["ze","lu"]` · `"@a @b @a"→["a","b"]` ·
`"sem mencao"→[]` — ✅ (7/7)

> Nota de método: uma sub-verificação inicial (500 inserts no MESMO gap) "falhou"
> por design do teste — o esquema de precisão finita satura qualquer gap
> martelado (~318), exatamente o comportamento correto já coberto pelo caso de
> saturação. Sub-teste redundante removido; os dois casos exigidos
> (500 monotônicas + saturação) passam.

---

## 4. BUGS / ACHADOS (com severidade — NÃO corrigidos)

| Sev | Achado | Onde | Recomendação / dono |
|---|---|---|---|
| **P2** | `TaskChecklistItem`/`TaskComment`/`TaskApproval`/`TaskAttachment` sem índice em `taskId` → Seq Scan por lookup de task (painel/board). Rápido hoje (<1 ms @ 4k linhas), degrada linear com a escala. | schema/migrations | Migration **aditiva** de índices `*_taskId_idx` → **a1-arquiteto-dados**. Não bloqueia Fase 6. |
| Obs | `orderIndex` 95% NULL em produção; reorder entre dois itens sem índice sobe o card ao topo do bloco (auto-corrige on-write). Limitação já documentada (A2 §Riscos, A4b §5). | fractional/board | Backfill de `orderIndex` por coluna (fatia futura, exige action). Não-bloqueante. |
| Obs | `lint/build/tsc` não verificáveis localmente (R3). | ambiente | Confirmar **Vercel CI verde** antes do merge (gate padrão do repo). |

**Nenhum bug P0/P1 aberto.** Nenhuma regressão detectada nos fluxos críticos.

---

## 5. VEREDITO DO GATE — Fase 6 (Qualidade)

- Fluxos críticos (8/8): **VERDES** ✅
- Funções puras: **26 PASS / 0 FAIL** ✅
- Carga 2.000 tasks: queries quentes **< 50 ms**, índices Fase 1 **presentes e usados**, sem seq scan problemático em `Task` ✅
- Segurança (auth+papel+posse, AuditLog, cron protegido, sem segredo/endpoint público): **sem ❌** ✅
- P0/P1 abertos: **nenhum** ✅ (único achado é **P2** de performance preventiva)

```json
{ "veredito": "APROVADO", "motivos": ["8/8 fluxos críticos verdes no trace estático (auth+papel+posse+AuditLog+idempotência)", "26/26 casos de funções puras PASS em Node 22", "queries quentes <50ms com índices Fase 1 presentes e usados; sem seq scan problemático em Task", "nenhum P0/P1 aberto"], "devolver_para": "a1-arquiteto-dados (apenas recomendação P2 não-bloqueante: migration aditiva de índices *_taskId_idx em TaskChecklistItem/TaskComment/TaskApproval/TaskAttachment)" }
```

*Ressalva operacional do gate do repo:* `lint/build/test` dependem do **Vercel CI**
(R3) — confirmar verde antes do merge. Não é bloqueio da Fase 6 de QA.
