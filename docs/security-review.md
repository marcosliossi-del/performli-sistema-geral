# Security Review — Módulo Tasks ClickUp-class (A6-SECURITY)

> **Data:** 2026-07-02 · **Estado revisado:** main commitada em `a318e3b` (Fases 1–4 mergeadas, PRs #105–#109), árvore de trabalho limpa no momento da revisão.
> **Escopo:** actions de `src/app/actions/tasks.ts`, `operacional.ts`, `suporte.ts`; loaders (`src/lib/tasks/panel.ts`, `src/lib/dal.ts`); rotas `/t/[taskId]` e `@modal`; crons `api/cron/*`; rotas admin/seed.
> **Fora do escopo (em voo):** trabalho da Fase 5 (A5-AUTOMATION) em `src/services/` e cron — não existe `src/services/task-automation.ts` commitado; nada não-commitado foi encontrado. Esta revisão cobre apenas o estado commitado.

## Cheques aplicados (legenda das colunas)

| # | Cheque |
|---|--------|
| a | IDOR — todo ID validado contra papel + posse (mutação E leitura) |
| b | Validação de input — zod sem passthrough; limites de tamanho |
| c | XSS — texto renderizado sem HTML cru |
| d | Rate limiting nas escritas |
| e | Mass assignment — campos sensíveis fora do patch |
| f | Enumeração — vazamento de existência de recursos |
| g | CSRF — proteção nativa de server actions |

Células: ✅ ok · ⚠️ atenção · ❌ crítico · — não se aplica.

---

## Tabela 1 — Actions `src/app/actions/tasks.ts`

| Superfície | a | b | c | d | e | f | g | Status | Evidência |
|---|---|---|---|---|---|---|---|---|---|
| createTask | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | authz: tasks.ts:54–56 (`assertClientMutationAccess`); zod tasks.ts:26–32 **sem `.max()`** em title/description (N1) |
| updateTaskStatus | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | cliente: tasks.ts:106–108 ✅; **task sem cliente: nenhum guard de papel/posse** (N2, pré-existente — contraste com ownershipGuard tasks.ts:451–466); `status` sem zod (só tipo TS; enum rejeitado em runtime pelo Prisma); dedupe recorrência tasks.ts:164–167 ✅; AuditLog tasks.ts:142–150 ✅ |
| updateTaskFields | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | authz via `mutateTask` (mutate.ts:52–59); zod tasks.ts:265–277 sem passthrough, **sem `.max()`** (N1); patch construído campo a campo (whitelist) tasks.ts:321–370 ✅; tipo `TaskFieldPatch` latente (N4) |
| setTaskRecurrence | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | authz via `mutateTask` (tasks.ts:401–406); regra validada por zod com limites (recurrence.ts:28–34: freq enum, interval 1–365, byWeekday 0–6) |
| reorderTask | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | authz via `mutateTask` (tasks.ts:431–436); `orderBetween` valida a<b, rejeita entradas > 64 chars (fractional.ts: `MAX_LEN = 64` — loop nem executa com chave gigante) e só emite chaves do alfabeto base62 |
| assignTask | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | `ownershipGuard` tasks.ts:451–466 + 470–471; existência do usuário tasks.ts:473–474; AuditLog tasks.ts:491–494 |
| unassignTask | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | `ownershipGuard` tasks.ts:502–503; invariante "assignedTo nunca órfão" tasks.ts:509–521 |
| toggleWatcher | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | `ownershipGuard` tasks.ts:549–550; existência do usuário tasks.ts:552–553 (nota: com posse, pode adicionar OUTRO usuário como watcher — aceitável em workspace interno) |
| addTaskDependency | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | posse dos DOIS lados tasks.ts:599–604; anti-ciclo DFS c/ trava 500 nós tasks.ts:616–631; enumeração: "não encontrada" é retornada ANTES da authz (tasks.ts:595) — revela existência de IDs, mitigado por cuid não-sequencial (N6) |
| removeTaskDependency | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | mesma authz dupla tasks.ts:665–670; mesma nota N6 (tasks.ts:661) |

## Tabela 2 — Actions `src/app/actions/operacional.ts`

| Superfície | a | b | c | d | e | f | g | Status | Evidência |
|---|---|---|---|---|---|---|---|---|---|
| createOperacionalTask | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ANALYST bloqueado operacional.ts:33–35; posse operacional.ts:40–46; **validação manual sem zod, sem `.max()`** (N1); areaId/popId/assigneeId sem checagem de existência (erro FK mascarado pelo Next em produção — robustez, não vazamento) |
| **loadTaskDetail** | ❌ | — | ✅ | — | — | ⚠️ | ✅ | **❌** | **IDOR NA LEITURA:** operacional.ts:265–297 — só `requireSession`, **nenhum recorte por papel/posse**. Qualquer papel autenticado (MANAGER de outro cliente, ANALYST) lê descrição, evidência, comentários, aprovações e cliente de QUALQUER task via chamada direta da server action com id arbitrário. Viola o RBAC do CLAUDE.md (MANAGER vê apenas clientes atribuídos) e contrasta com o recorte correto de panel.ts:163–178. Origem pré-módulo (commit `e4049e1`, bloco 2), mas segue viva em produção via TaskDrawer (OperacionalBoard.tsx:483, deep-link `?task=`). Ver C1. |
| toggleChecklistItem | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | cliente: operacional.ts:150–152 ✅; **sem cliente: nenhum guard** (N2 — ANALYST pode marcar item de task interna alheia) |
| addChecklistItem | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | cliente: operacional.ts:172–174 ✅; sem cliente: N2; `label` sem `.max()` (N1) |
| removeChecklistItem | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | cliente: operacional.ts:207–209 ✅; sem cliente: N2; regra de evidência preservada (não remove obrigatório/concluído) operacional.ts:211–216 ✅ |
| addTaskComment | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | cliente: operacional.ts:116–118 ✅ (assert lança sem catch — erro mascarado em produção; contrato inconsistente, não vazamento); sem cliente: N2; `body` sem `.max()` (N1 — DoS de payload) |
| submitTaskForValidation | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | posse forte: só responsável ou ADMIN operacional.ts:378–380; gate de estado operacional.ts:381–383; checklist obrigatório operacional.ts:388–391; `evidence` min 5 **sem `.max()`** (N1); AuditLog operacional.ts:406–414 ✅ |
| decideTaskValidation | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | só CS/ADMIN operacional.ts:427–429; TaskCompletionGuard reaplicado na aprovação operacional.ts:454–460 ✅; `note` sem `.max()` (N1); AuditLog operacional.ts:489–497 ✅ |

## Tabela 3 — Actions `src/app/actions/suporte.ts`

| Superfície | a | b | c | d | e | f | g | Status | Evidência |
|---|---|---|---|---|---|---|---|---|---|
| createSupportDemand | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | zod sem passthrough suporte.ts:11–20; posse suporte.ts:51–55; title/description **sem `.max()`** (N1); assigneeId sem checagem de existência (erro FK mascarado) |

## Tabela 4 — Loaders e rotas de leitura

| Superfície | a (leitura) | f | Status | Evidência |
|---|---|---|---|---|
| loadTaskPanel (`src/lib/tasks/panel.ts`) | ✅ | ✅ | ✅ | Recorte por papel panel.ts:163–178: ADMIN/CS amplo; MANAGER/ANALYST só com `ClientAssignment` ou sendo responsável (principal/aux) em task interna. Retorna `null` uniforme p/ "não existe" E "sem acesso" — anti-enumeração ✅. Select explícito, sem include cego. |
| getOperacionalBoard (`src/lib/dal.ts`) | ✅ | ✅ | ✅ | dal.ts:1121–1125: `canViewAll(role)` (ADMIN/CS) ou `OR [assignedTo, client.assignments.some]` — MANAGER/ANALYST só veem o que possuem |
| Página `/t/[taskId]` | ✅ | ✅ | ✅ | (dashboard)/t/[taskId]/page.tsx:19–24 — `requireSession` + `loadTaskPanel` + `notFound()` uniforme |
| `@modal/(.)t/[taskId]` | ✅ | ✅ | ✅ | (dashboard)/@modal/(.)t/[taskId]/page.tsx:22–24 — mesmo loader; sem acesso → slot vazio |

## Tabela 5 — Crons e rotas admin

| Superfície | Auth | Status | Evidência |
|---|---|---|---|
| api/cron/daily | CRON_SECRET | ⚠️ | `isAuthorized()` fail-closed sem env; Bearer ou `x-cron-secret`; **comparação `===` não é timing-safe** (N5 — ⚠️ aceitável: HTTPS + segredo de alta entropia + jitter serverless tornam timing attack remoto impraticável; recomendação R5) |
| api/cron/digest | CRON_SECRET | ⚠️ | idem (fail-closed com log explícito); N5 |
| api/cron/recurrences | CRON_SECRET | ⚠️ | idem; `?force=1` só com auth ✅; N5 |
| api/cron/resultados | CRON_SECRET | ⚠️ | idem; N5. Nota (4 crons): `err.message` vai no JSON 500 — só visível a quem já porta o segredo, aceitável |
| api/admin/seed-operacao | sessão ADMIN | ✅ | route.ts:25–32 — 401 sem sessão, 403 se role ≠ ADMIN; não vaza `err.message` (route.ts:106–111) |
| api/seed | bloqueado em prod | ✅ | route.ts:7–14 — 404 se `VERCEL_ENV`/`NODE_ENV` = production; fora de prod exige `SEED_SECRET` fail-closed. Nota: senhas de exemplo fracas — aceitável por ser inacessível em produção |

## Cheques transversais

- **(c) XSS — ✅ em todo o módulo.** Zero `dangerouslySetInnerHTML` em `src/` (grep global). Nenhuma lib de markdown/HTML no bundle. Comentários: texto puro com `whitespace-pre-wrap`; menções realçadas por parser de texto que emite elementos React escapados (CommentThread.tsx:22–33, 89–91). ActivityFeed interpola `fromValue/toValue` como texto React (ActivityFeed.tsx:42–82). Descrição no painel: texto puro (TaskPanel.tsx:520–521). TaskDrawer legado idem (TaskDrawer.tsx:154, 238).
- **(d) Rate limiting — ⚠️ sistêmico.** Mecanismo existe e é sólido: `checkRateLimit` fixed-window persistido em Postgres (src/lib/rate-limit.ts, migration `20260701040000_rate_limit`), fail-open documentado. Porém é usado **apenas no login** (src/app/actions/auth.ts:24). Nenhuma action de escrita do módulo passa por ele. Superfície interna autenticada (~10 usuários) → risco baixo; ver R5.
- **(e) Mass assignment — ⚠️ latente, sem exposição atual.** `TaskFieldPatch = Omit<Prisma.TaskUncheckedUpdateInput, relações|'id'>` (mutate.ts:11–14) **permite por tipo** campos perigosos: `clientId`, `statusId`, `idempotencyKey`, `requesterId`, `isSupport`, `completedAt`, `riskScore` etc. Verificado que os 3 call-sites de `mutateTask` (todos em tasks.ts:374, 401, 431) constroem o patch campo a campo a partir de zod/valores do servidor — **nenhum repassa objeto do cliente**. O canal é latente: um caller futuro pode passar patch cru sem erro de compilação. Ver R4.
- **(f) Enumeração — aceitável, anotado.** As actions distinguem "Tarefa não encontrada." de "Sem permissão…" (existência revelada a usuário autenticado do workspace único). IDs são cuid não-sequenciais (inviável enumerar às cegas) e os loaders de leitura usam resposta uniforme (`null`/`notFound`). Padrão consciente — panel.ts e page.tsx documentam a escolha.
- **(g) CSRF — ✅ plataforma.** Server actions do Next 16 só aceitam POST com verificação nativa de Origin/Host; cookie de sessão `httpOnly` + `sameSite: 'lax'` + `secure` em produção (session.ts:36–42). JWT HS256 verificado com algoritmo fixado (session.ts:52–54).
- **Sessão (nota pré-existente):** o papel vive no JWT por 7 dias — rebaixamento/desativação de usuário só propaga no próximo login. Fora do escopo do módulo; registrado para o backlog de plataforma.

---

## ❌ CRÍTICOS

### C1 — `loadTaskDetail`: IDOR na leitura (sem recorte por papel/posse)

- **Onde:** `src/app/actions/operacional.ts:265–297` (server action exportada em arquivo `'use server'` → invocável diretamente por qualquer usuário autenticado com qualquer `taskId`).
- **O que vaza:** descrição, **evidência**, checklist, 30 comentários, atividades, aprovações, nome/slug do cliente, nomes de watchers/solicitante — de tarefas de clientes **não atribuídos** ao papel MANAGER e a ANALYST.
- **Por que é ❌:** viola diretamente a matriz RBAC do CLAUDE.md ("MANAGER vê apenas clientes atribuídos") e a regra inegociável #1 (leitura pela camada com escopo). O próprio módulo reconheceu o requisito e o implementou corretamente no loader novo (`panel.ts:163–178`) — manter a superfície antiga sem o mesmo recorte é uma porta lateral que anula o recorte do painel.
- **Atenuantes (por que não é pior):** origem pré-módulo (commit `e4049e1`, bloco 2 — as Fases 1–4 não a introduziram); workspace único interno (~10 funcionários Arkza); IDs cuid não adivinháveis às cegas (mas visíveis em URLs/links compartilhados).
- **Correção proposta (pequena e localizada):** aplicar em `loadTaskDetail` o mesmo bloco de escopo de `loadTaskPanel` (ADMIN/CS amplo; senão exigir `ClientAssignment` no cliente da task, ou ser responsável principal/aux em task interna; sem acesso → `return null`). Alternativa melhor a médio prazo: fazer o TaskDrawer legado consumir `loadTaskPanel` e aposentar `loadTaskDetail` (D-009 já prevê o redirecionamento de `?task=` para `/t/[taskId]`).
- **Gate:** pelo PROMPT_MESTRE A6, "todas as ❌ corrigidas antes do gate da Fase 5" — corrigível dentro da Fase 5 em andamento.

---

## ⚠️ RECOMENDAÇÕES (priorizadas)

Notas sistêmicas referenciadas na tabela: **N1** = string sem `.max()` · **N2** = task sem cliente sem guard · **N4** = tipo TaskFieldPatch amplo · **N5** = comparação de segredo não timing-safe · **N6** = existência revelada antes da authz.

1. **R1 (deriva do C1) — Fechar a leitura do `loadTaskDetail`.** Única correção obrigatória para o gate. Reusar o recorte de `panel.ts:163–178`.
2. **R2 (N2) — Unificar o guard de tasks SEM cliente.** `updateTaskStatus` (tasks.ts:106–108 só cobre `clientId`), `addTaskComment`, `toggleChecklistItem`, `addChecklistItem` e `removeChecklistItem` não validam papel/posse quando `clientId` é nulo — qualquer papel (inclusive ANALYST) muta task interna alheia. O módulo já tem o padrão correto (`ownershipGuard` tasks.ts:451–466 e `mutateTask` mutate.ts:52–59): basta rotear essas cinco superfícies por ele. Pré-existente ("comportamento preservado" na refatoração da Fase 2), por isso ⚠️ e não ❌ — mas é a inconsistência de authz mais visível do módulo.
3. **R3 (N1) — Limites de tamanho nos textos.** `title`, `description`, `body` (comentário), `evidence`, `label` (checklist), `note` (validação) não têm `.max()` — payload de MBs vira linha de banco, infla `getOperacionalBoard`/painel e degrada todo mundo (DoS de payload barato por usuário autenticado). Sugestão: `.max(500)` para títulos/labels, `.max(10_000)` para descrição/comentário/evidência, aplicado nos schemas zod existentes (e zod + max em `createOperacionalTask`, que hoje valida à mão).
4. **R4 (N4) — Estreitar `TaskFieldPatch` para whitelist.** Trocar o `Omit<TaskUncheckedUpdateInput, …>` (mutate.ts:11–14) por um `Pick<>` explícito dos campos editáveis (title, description, assignedTo, dueDate, startDate, priority, supportCategory, tags, orderIndex, recurrenceRule, status). Elimina em tempo de compilação o canal latente de mass assignment (`clientId`, `idempotencyKey`, `requesterId`, `statusId` desacoplado do enum).
5. **R5 (N5 + d) — Endurecer segredos e abuso.** (i) Comparar `CRON_SECRET`/`SEED_SECRET` com `crypto.timingSafeEqual` (helper único; ⚠️ aceitável hoje, correção de 5 linhas). (ii) Aplicar `checkRateLimit` (já existente) nas escritas mais baratas de abusar — `addTaskComment` e `createOperacionalTask` (ex.: 30/min por usuário) — hoje só o login é limitado.
6. **R6 (nota) — Contrato de erro consistente.** `addTaskComment`/`toggleChecklistItem` deixam o `assertClientMutationAccess` lançar (erro mascarado em produção) em vez de retornar `{ error }` como o resto do módulo — padronizar melhora UX de negação sem impacto de segurança.

---

## Contagem e veredito do gate

| Status | Quantidade | Superfícies |
|---|---|---|
| ✅ | 13 | setTaskRecurrence, reorderTask, assignTask, unassignTask, toggleWatcher, addTaskDependency, removeTaskDependency, loadTaskPanel, getOperacionalBoard, página /t/[taskId], @modal /t/[taskId], api/admin/seed-operacao, api/seed |
| ⚠️ | 15 | createTask, updateTaskStatus, updateTaskFields, createOperacionalTask, toggleChecklistItem, addChecklistItem, removeChecklistItem, addTaskComment, submitTaskForValidation, decideTaskValidation, createSupportDemand, cron/daily, cron/digest, cron/recurrences, cron/resultados |
| ❌ | 1 | **loadTaskDetail (IDOR na leitura)** |

**Veredito (gate BLOCO 5 — zero ❌ para passar): REPROVADO até a correção do C1.**

A fundação de segurança do módulo é boa — authz centralizada (`mutateTask`/`ownershipGuard`/`assertCan`), leitura escopada nos loaders novos, XSS zero, CSRF de plataforma, auditoria consistente. O único ❌ é uma superfície legada que o módulo deixou para trás com correção pequena e localizada; corrigido o C1 (e idealmente o R2 na mesma fatia), o gate passa.
