# HANDOFF — Agente 3 (Enforcement de Backend) → Guardião / Agente 4

Projeto RBAC v2 do Performli. Fatia: **aplicação do policy engine (`src/lib/rbac`)
em todo o backend** — páginas server (gates), server actions, route handlers e DAL.
Deny-by-default, zero `any` novo. NÃO commitei/pushei.

Base usada: HANDOFF_AGENTE_1 (schema/roles) e HANDOFF_AGENTE_2 (engine:
`normalizeRole`, `can`, `scopeClients`, `scopeTasks`, `stripSensitive`,
`assertTaskPatchAllowed`).

## Princípios aplicados
- **Fronteira normaliza:** todo `session.role` (enum Prisma, ainda com legados
  MANAGER/ANALYST) passa por `normalizeRole()` antes de qualquer decisão.
- **Leitura ampla operacional = todos menos GESTOR.** Onde o legado usava
  `role==='ADMIN' || role==='CS'`, agora é `normalizeRole(role) !== 'GESTOR_TRAFEGO'`
  — SUPERVISOR_TRAFEGO e ANALISTA_TRAFEGO entram como staff amplo (visão total +
  mutação como CS/ADMIN).
- **GESTOR_TRAFEGO (ex-MANAGER) é o mais restrito:** carteira via `scopeClients`
  / `scopeTasks`; em tarefas **só muda status**.
- **Financeiro/receita da agência = SÓ ADMIN**, via `stripSensitive` ou omissão
  condicional (fee/contrato/Asaas/despesas/meta de faturamento). Budget de mídia
  permanece visível (performance).

## Compat (refatorados por dentro — assinaturas preservadas)
- `src/lib/audit.ts` → `assertClientMutationAccess` agora normaliza e delega a
  regra ao engine (ADMIN/SUP/ANA amplos; CS com `allowCS`; GESTOR por posse).
  Marcado `@deprecated` → usar `src/lib/rbac`.
- `src/lib/permissions.ts` → `assertCan('task.write')` sem cliente usa
  `can(role,'update'|'update_status_only','tarefas')` em vez de literal ANALYST.
- `src/lib/dal.ts` → `canViewAll(role)` = `normalizeRole(role) !== 'GESTOR_TRAFEGO'`.

## Tabela de enforcement (endpoint/página/action × papéis × escopo × campos removidos)

### Páginas server (gates)
| Rota | Papéis (view) | Escopo linha | Campos removidos p/ não-ADMIN |
|------|---------------|--------------|-------------------------------|
| `/dashboard` | todos | GESTOR→carteira (`getDashboardData`); managerStats só staff amplo | — |
| `/cockpit` (`getCockpitData`) | todos | GESTOR→carteira | bloco `faturasVencidas` (Asaas) só ADMIN |
| `/clients` | todos | GESTOR→`scopeClients` | `contractValue` + KPIs de receita + inadimplência só ADMIN |
| `/clients/[slug]` (`getClientDetail`) | todos (GESTOR só carteira) | ownership no `findFirst` | `contractValue/feeAmount/billingDueDay` (strip) + card de Contrato só ADMIN |
| `/operacional` | todos | GESTOR→carteira/próprias | `canEdit=can(update,tarefas)` (GESTOR=false) |
| `/suporte` | todos | GESTOR→carteira/próprias | — |
| `/alerts` | todos | GESTOR→carteira | — |
| `/anti-churn` (War Room) | todos | GESTOR→carteira | `canEditWarRoom=can(update,warRoom)` |
| `/managers` | todos | **GESTOR→só o próprio** (filtro por `userId`) | MRR = budget (visível) |
| `/agency/metas` | ADMIN, SUP, ANA, CS (GESTOR→redirect) | — | meta `FATURAMENTO` (receita) via `stripSensitive('Goal')` |
| `/agency` (CEO), `/agency/metas`(mutação), `/team`, `/settings`, `/recorrencias`, `/knowledge`, `/managers/assignments`, `/dev` | **SÓ ADMIN** | — | — |
| `/financeiro`, `/juridico` | **SÓ ADMIN** | — | — |
| `/comercial`, `/comercial/dashboard`, `/pipeline` | **SÓ ADMIN** (`can(view,comercial)`) | — | — |

### Server actions
| Action | Papéis permitidos | Escopo/posse | Notas |
|--------|-------------------|--------------|-------|
| `tasks.createTask` | staff amplo (GESTOR bloqueado) | `assertClientMutationAccess` se cliente | `assertTaskStructuralMutation` |
| `tasks.updateTaskStatus` | todos (inclui GESTOR) | posse cliente/própria | única mutação do GESTOR |
| `tasks.updateTaskFields` / `setTaskRecurrence` / `reorderTask` | staff amplo | via `mutateTask`→`assertTaskPatchAllowed` | GESTOR bloqueado (patch ≠ status) |
| `tasks.assign/unassign/toggleWatcher/add/removeDependency` | staff amplo | `ownershipGuard` + `assertTaskStructuralMutation` | GESTOR bloqueado |
| `lib/tasks/mutate.mutateTask` | conforme campo | posse | GESTOR: só `status` (guard de campo) |
| `operacional.createOperacionalTask` | staff amplo | posse cliente | GESTOR bloqueado (`can(create,tarefas)`) |
| `operacional.getTaskDetail` (leitura) | todos | GESTOR→carteira/própria | — |
| `fichaCs.updateFichaCs` | ADMIN/CS/SUP/ANA; GESTOR carteira | `assertClientMutationAccess(allowCS)` | — |
| `chat.sendChatMessage` | staff amplo + GESTOR atribuído | posse | — |
| `planoAcao.generatePlanoAcao` | todos; GESTOR carteira | posse | contexto IA sem fee p/ não-ADMIN |
| `alerts.markAlertRead/markAllAlertsRead` | todos | GESTOR→carteira | — |
| `contracts.*` (create/update/renew/cancel) | **SÓ ADMIN** | — | — |
| `contracts.fetchAllContracts` | **SÓ ADMIN** (era ADMIN/CS) | — | contrato = fee |
| `clients.createClient`, `updateClient`, `assignments`, `platformAccounts`, `goals.setGoal`, `recurrences`, `team.*` | **SÓ ADMIN** | — | inalterados (já ADMIN) |
| `search.globalSearch` | todos | GESTOR→carteira | — |

### Route handlers (API)
| Rota | Método | Papéis | Escopo | Campos |
|------|--------|--------|--------|--------|
| `/api/clients/[clientId]/budget` | PATCH | staff amplo + GESTOR carteira (`can(update,clientes)`) | posse | budget de mídia (visível) |
| `/api/ai/clients` | GET | todos | `scopeClients` | — |
| `/api/ai/chat` | POST | todos; GESTOR só carteira | assignment check | contexto sem financeiro p/ não-ADMIN (`getClientAIContext(clientId, role)`) |
| `/api/asaas/sync` | POST | **SÓ ADMIN** (era ADMIN/MANAGER) | — | financeiro |
| `/api/comercial/leads/[id]` | PATCH/DELETE | **SÓ ADMIN** (era ADMIN/CS/MANAGER) | — | comercial |
| `/api/comercial/leads/[id]/convert` | POST | SÓ ADMIN (já era) | — | — |
| `/api/financeiro/*`, `/api/settings/*`, `/api/admin/*`, `/api/whatsapp/*`, `/api/sync/*`, `/api/nuvemshop/*` | — | SÓ ADMIN (já eram) | — | — |

### DAL — recortes
- `getClientDetail`: `stripSensitive('Client')` p/ não-ADMIN.
- `getCockpitData`: `faturasVencidas` só ADMIN (era `viewAll`).
- `getWarRoomResponsibleOptions`, `getGestoresCarga`, `getManagersOverview`,
  `getManagersMRR`, `getAssignmentsData`: listas de usuários passam a incluir os
  papéis novos (+ legados por compat) nos `role: { in: [...] }`.
- `getValidationQueue.canDecide`: mantido CS/ADMIN (domínio CS — deny-by-default).

### Contexto de IA (`src/lib/ai-client-context.ts`)
- `getClientAIContext(clientId, viewerRole?)`: linha de **valor do contrato**
  (fee) só entra se `normalizeRole(viewerRole)==='ADMIN'`. Sem role → omite
  (deny-by-default). Chamado com `session.role` em `ai/chat` e `planoAcao`.

## Seeds atualizados (gravam papéis novos)
- `src/services/seed-operacao.ts`: SUPERVISOR→`SUPERVISOR_TRAFEGO`,
  GESTOR/CRM→`GESTOR_TRAFEGO`, ACOMPANHAMENTO→`ANALISTA_TRAFEGO`.
- `prisma/seed.ts` e `src/app/api/seed/route.ts`: `MANAGER→GESTOR_TRAFEGO`,
  `ANALYST→ANALISTA_TRAFEGO`.

## Tipos ampliados
- `src/lib/session.ts` e `src/lib/auth.ts`: union de `role` inclui os 3 papéis v2.
- `src/lib/home.ts`: fallback de pouso cobre os papéis novos (SUP→/cockpit;
  GESTOR/ANALISTA→/meu-dia).

## Grep final (prova)
Nenhum `role === 'MANAGER'`/`'ANALYST'` de **autorização** restante em `src/`.
Ocorrências remanescentes são intencionais:
- `src/lib/rbac/roles.ts` + `selftest.ts` (o próprio `normalizeRole`).
- `src/lib/dal.ts`, `weekly-checklist-generator.ts`: `role: { in: [...] }` com
  novos **+ legados** (compat de dados durante transição).
- `src/lib/auth.ts` / `session.ts` / `home.ts`: unions/switch cobrindo legados.
- `src/services/recurrence-engine.ts`: `OperationalRole` (enum diferente do RBAC).

## Pendências para o Agente 4 (UI/client components)
Refletir `can()` nos elementos abaixo (backend já barra; é só UX):
1. `src/components/anti-churn/ProtocolCard.tsx:79` — `canEdit` usa literal
   `'MANAGER'`; trocar por prop derivada de `can(role,'update','warRoom')` (senão
   o GESTOR_TRAFEGO perde o botão de editar War Room da carteira).
2. `src/components/layout/Sidebar.tsx` — `type Role` local e `roles: [...]`
   ainda em `'MANAGER'`; `viewMode` mapeia ADMIN→'MANAGER'. Atualizar para os
   papéis v2 e usar `can()`/`normalizeRole` para itens de menu
   (Validação/Aceite/Financeiro/Gestão etc.).
3. `src/components/managers/ManagersClient.tsx:106`, `team/TeamMemberRow.tsx`,
   `InviteUserForm.tsx`, `layout/TopNav.tsx`, `recorrencias/page.tsx`,
   `ai-agents/AIAgentsClient.tsx` — labels/opções de papel (cosmético).
4. Painel de tarefas: consumir os novos flags do loader
   `loadTaskPanel` → `canEdit` e **`canEditStatusOnly`** (GESTOR) para exibir só
   o mover-de-coluna e esconder edição de campos/atribuição/dependências.
5. `OperacionalBoard` recebe `canEdit` já correto; adicionar modo status-only p/
   GESTOR conforme item 4.

## Arquivos alterados (agrupados)
**Engine/compat/tipos**
- `src/lib/audit.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`,
  `src/lib/auth.ts`, `src/lib/home.ts`, `src/lib/ai-client-context.ts`

**DAL / tasks**
- `src/lib/dal.ts`, `src/lib/tasks/panel.ts`, `src/lib/tasks/mutate.ts`

**Server actions**
- `src/app/actions/tasks.ts`, `operacional.ts`, `fichaCs.ts`, `chat.ts`,
  `planoAcao.ts`, `alerts.ts`, `contracts.ts`, `search.ts`

**Páginas server**
- `src/app/(dashboard)/dashboard/page.tsx`, `clients/page.tsx`,
  `clients/[slug]/page.tsx`, `operacional/page.tsx`, `suporte/page.tsx`,
  `alerts/page.tsx`, `anti-churn/page.tsx`, `comercial/page.tsx`,
  `comercial/dashboard/page.tsx`, `pipeline/page.tsx`, `managers/page.tsx`,
  `agency/metas/page.tsx`, `team/page.tsx`

**Route handlers**
- `src/app/api/clients/[clientId]/budget/route.ts`, `api/ai/clients/route.ts`,
  `api/ai/chat/route.ts`, `api/asaas/sync/route.ts`,
  `api/comercial/leads/[id]/route.ts`

**Seeds**
- `src/services/seed-operacao.ts`, `prisma/seed.ts`, `src/app/api/seed/route.ts`,
  `src/services/weekly-checklist-generator.ts`

## Evidência / validação
- Dependências NÃO instaladas no ambiente (`node_modules/react` e
  `@prisma/client` ausentes) → `tsc --noEmit` não executável de forma útil.
  Recomendo ao guardião rodar `npm ci && npx tsc --noEmit` + `npm run lint`.
- Grep de autorização (`role === 'MANAGER'|'ANALYST'`) limpo em código de decisão
  (ver seção "Grep final").

## Checklist de autorização (amostra — endpoints que mudaram comportamento)
```json
[
  { "rota":"/api/asaas/sync", "metodo":"POST", "papeis_permitidos":["ADMIN"], "validacao_posse":false, "log":true },
  { "rota":"/api/comercial/leads/[id]", "metodo":"PATCH", "papeis_permitidos":["ADMIN"], "validacao_posse":false, "log":true },
  { "rota":"/api/clients/[clientId]/budget", "metodo":"PATCH", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS","GESTOR_TRAFEGO"], "validacao_posse":true, "log":false },
  { "rota":"/api/ai/chat", "metodo":"POST", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS","GESTOR_TRAFEGO"], "validacao_posse":true, "log":false },
  { "rota":"action:tasks.createTask", "metodo":"-", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS"], "validacao_posse":true, "log":true },
  { "rota":"action:tasks.updateTaskStatus", "metodo":"-", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS","GESTOR_TRAFEGO"], "validacao_posse":true, "log":true }
]
```

## Status
Fatia pronta para revisão do **guardião**. NÃO commitei/pushei (instrução).
