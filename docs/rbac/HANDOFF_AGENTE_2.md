# HANDOFF — Agente 2 (Policy Engine) → Agente 3

Projeto RBAC v2 do Performli. Fatia: **motor de políticas puro** em `src/lib/rbac/`.
NÃO toquei em rotas, actions, UI, DAL, schema nem nos helpers legados
(`src/lib/permissions.ts`, `src/lib/audit.ts`). Tudo aqui é função pura, zero
`any`, deny-by-default. O Agente 3 faz a transição das rotas para este engine.

## Arquivos criados
- `src/lib/rbac/roles.ts` — `Role5`, `ROLE5_ALL`, `normalizeRole`, `isRole5`.
- `src/lib/rbac/permissions.ts` — `Module`, `Action`, `PERMISSION_MATRIX`, `can`.
- `src/lib/rbac/scope.ts` — `scopeClients`, `scopeTasks`.
- `src/lib/rbac/sensitiveFields.ts` — `SENSITIVE_FIELDS`, `REVENUE_METRICS`, helpers.
- `src/lib/rbac/serialize.ts` — `stripSensitive`, `stripSensitiveMany`.
- `src/lib/rbac/taskFieldGuard.ts` — `assertTaskPatchAllowed`, `isTaskPatchAllowed`.
- `src/lib/rbac/index.ts` — barrel de re-exports.
- `src/lib/rbac/selftest.ts` — `runRbacSelfTest()` (evidência; sem runner novo).
- `docs/rbac/HANDOFF_AGENTE_2.md` — este arquivo.

## API do engine

### roles.ts
- `type Role5` = ADMIN | SUPERVISOR_TRAFEGO | ANALISTA_TRAFEGO | CS | GESTOR_TRAFEGO.
- `normalizeRole(role: Role | string): Role5` — MANAGER→GESTOR_TRAFEGO,
  ANALYST→ANALISTA_TRAFEGO, ADMIN/CS/SUPERVISOR_TRAFEGO inalterados. Papel
  desconhecido **lança** (erro de dados, não silenciar).
- **Toda entrada no engine deve normalizar primeiro.** O enum Prisma ainda tem
  os legados (D-011); o restante do engine só aceita `Role5`.

### permissions.ts — `can(role, action, module): boolean`
- Ações: `view | create | update | delete | update_status_only`.
- Módulos: `tarefas, cockpit, clientes, operacao, warRoom, comercial,
  financeiro, juridico, gestaoEquipeVisaoGestor, gestaoEquipeMetas,
  gestaoEquipeEquipe, inteligencia`.
- Deny-by-default: só retorna true se a matriz listar a ação. `can()` responde
  APENAS "pode a ação neste módulo?" — não decide escopo (linhas) nem campo.
- GESTOR em `tarefas`: `view` + `update_status_only` (não `update`).

### scope.ts (Prisma where puro)
- `scopeClients(role, userId): Prisma.ClientWhereInput` — GESTOR →
  `{ assignments: { some: { userId } } }`; demais → `{}` (leitura ampla).
- `scopeTasks(role, userId): Prisma.TaskWhereInput` — GESTOR → OR de: task de
  cliente da carteira; task interna própria (`assignedTo`); task interna onde é
  `auxAssignees`. Espelha o recorte de `src/lib/tasks/panel.ts`.
- `{}` = SEM filtro (intencional para leitura ampla). NÃO é barreira de
  mutação — ownership de escrita continua exigindo `can` + checagem de posse.

### serialize.ts — `stripSensitive(role, model, data)` / `stripSensitiveMany`
- ADMIN → objeto intacto. Não-ADMIN → remove campos de `SENSITIVE_FIELDS`.
- Model `'*'` (Contract/AsaasPayment/AsaasSubscription/Expense) → retorna `{}`.
- Goal: remove `targetValue` só quando `data.metric` é métrica de receita
  (FATURAMENTO/TICKET_MEDIO/SALES/CAC); metas operacionais mantêm o valor.
- Tipado com generics → retorna `Partial<T>`.

### taskFieldGuard.ts — `assertTaskPatchAllowed(role, patchKeys)`
- GESTOR: qualquer chave ≠ `status` → **throw** com mensagem operacional.
- Demais papéis: passam (a ação já foi validada por `can`).
- `isTaskPatchAllowed` = versão booleana p/ UI.

## Mapa de campos sensíveis (regra crítica: budget vs fee)
| Model | Campos removidos p/ não-ADMIN | Racional |
|-------|-------------------------------|----------|
| Client | `contractValue`, `feeAmount`, `billingDueDay` | receita/cobrança da AGÊNCIA |
| Client (VISÍVEIS) | `investimentoMeta/Google/Tiktok`, `roasMinimo`, `cpaMaximo`, `faturamentoEsperado` | **budget de mídia + performance** — gestor precisa operar |
| Contract | `*` (tudo) | jurídico/financeiro — SÓ ADMIN |
| Goal | `targetValue` **se metric de receita** | meta de faturamento invisível; meta operacional visível |
| AsaasPayment | `*` | financeiro |
| AsaasSubscription | `*` | financeiro |
| Expense | `*` | financeiro |

> Distinção-chave documentada em `sensitiveFields.ts`: **budget de mídia
> (verba/investimento) é VISÍVEL** (dado de performance); **fee / valor de
> contrato é INVISÍVEL** (receita da agência).

## Decisões — ambiguidades resolvidas por NEGAR
1. **GESTOR em clientes/operação/war-room**: recebe CRUD na MATRIZ, mas restrito
   à carteira via `scopeClients`. A ação "delete cliente" existe na matriz do
   gestor; o Agente 3 deve, na rota, aplicar scope + ownership. Se o produto
   quiser negar delete de cliente ao gestor, é uma restrição adicional na rota
   (a matriz não o impede, o scope sim limita a carteira).
2. **Comercial/Financeiro/Jurídico**: SÓ ADMIN, inclusive leitura. Todos os
   demais 🔒 — nem `view`.
3. **gestaoEquipeMetas p/ GESTOR**: 🔒 total (nem leitura), conforme matriz.
4. **gestaoEquipeMetas p/ SUP/ANA/CS**: `view` liberado, mas campos de receita
   removidos por `stripSensitive` (Goal + metric de receita). O Agente 3 deve
   chamar `stripSensitive` ao servir metas a esses papéis.
5. **gestaoEquipeVisaoGestor p/ GESTOR**: `view` liberado na matriz, mas o
   recorte "só o próprio desempenho" é self-scope por `userId` na DAL (não há
   where genérico aqui — Agente 3 filtra `gestorId === session.userId`).
6. **inteligencia**: todos `view`; o contexto de clientes montado para o LLM
   deve usar `scopeClients` e **nunca** incluir dados financeiros para não-ADMIN
   (rodar o payload por `stripSensitive` antes de enviar ao modelo). Agente 3
   implementa a montagem do contexto.
7. **normalizeRole desconhecido lança** (não faz fallback silencioso) — papel
   fora do enum é erro de dados.

## Evidência (regra #14)
`runRbacSelfTest()` cobre a matriz célula a célula (5 papéis × 12 módulos × 5
ações) + normalizeRole + scope + serialize + fieldGuard, contra um oráculo
independente. Executado nesta fatia via type-stripping do Node 22:
**`{ passed: 324, failed: 0, failures: [] }`**.
Não há runner de testes no `package.json` (sem jest/vitest). **Pendência p/
Agente 5**: plugar a execução (script `tsx src/lib/rbac/selftest.ts` ou rota
admin-only) no CI/gate. Zero dependência nova foi adicionada.

## Pendências para o Agente 3 (varredura + transição de rotas)
Substituir a lógica ad-hoc de papéis pelo engine. Pontos que ainda comparam
literais `MANAGER`/`ANALYST` (herdado do HANDOFF_AGENTE_1 — devem passar por
`normalizeRole` + `can`/`scope`/`serialize`):

Autorização / lógica (CRÍTICO):
- `src/lib/permissions.ts:65` (`session.role === 'ANALYST'`)
- `src/lib/audit.ts:27` (`role === 'MANAGER'`)
- `src/lib/dal.ts:1313, 1738, 2176, 2893, 3228`
- `src/lib/tasks/panel.ts:276` (`canEdit = role !== 'ANALYST'`) e o recorte de
  leitura em `panel.ts:164-178` — trocar por `scopeTasks`.
- `src/lib/home.ts:35-36`
- `src/app/actions/fichaCs.ts:27`, `chat.ts:41`, `planoAcao.ts:26-27`,
  `operacional.ts:62`, `tasks.ts` (assertCan)
- `src/app/(dashboard)/comercial/dashboard/page.tsx:41`, `comercial/page.tsx:47`,
  `clients/[slug]/page.tsx:182,185`
- `src/app/(dashboard)/operacional/page.tsx:17`, `anti-churn/page.tsx:93`
- `src/components/anti-churn/ProtocolCard.tsx:79`
- `src/services/weekly-checklist-generator.ts:143`
- `src/services/recurrence-engine.ts:24,110` (cuidado: `OperationalRole`, não
  `Role` — não confundir com o RBAC)
- API routes: `asaas/sync/route.ts:11`, `comercial/leads/[id]/route.ts:27`,
  `clients/[clientId]/budget/route.ts:12`, `ai/clients/route.ts:15`,
  `ai/chat/route.ts:128`, `sync/health|meta|ga4|nuvemshop`

Tipos/enums TS a ampliar p/ os novos literais:
- `src/lib/auth.ts:7`, `src/lib/session.ts:10` (union de role)
- `src/components/layout/Sidebar.tsx:39,87,95,181`

UI/labels (cosmético):
- `TeamMemberRow.tsx`, `InviteUserForm.tsx`, `layout/TopNav.tsx`,
  `recorrencias/page.tsx`, `team/page.tsx`, `managers/ManagersClient.tsx`,
  `ai-agents/AIAgentsClient.tsx`

Seeds que gravam papéis legados (atualizar p/ nomes novos):
- `src/services/seed-operacao.ts:32-36`, `prisma/seed.ts:64,70,76`,
  `src/app/api/seed/route.ts:32,38,44`

Notas de integração:
- **SUPERVISOR_TRAFEGO** é papel novo — no engine já é staff de leitura ampla
  (mesmo nível de CS/ANALISTA em quase tudo). Onde o código legado tratava só
  ADMIN/MANAGER/ANALYST/CS, o Agente 3 precisa incluir SUPERVISOR_TRAFEGO.
- `budget/route.ts` mexe em investimento de mídia (VISÍVEL) — não confundir com
  fee. O engine permite budget para gestor da carteira (clientes.update).

## Status
Fatia pronta para revisão do **guardiao**. NÃO commitei/pushei (instrução).
```json
{ "rota":"(engine puro — sem rotas)", "metodo":"—", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS","GESTOR_TRAFEGO"], "validacao_posse":true, "log":true }
```
> O engine não expõe endpoint; a checklist de autorização por rota será
> preenchida pelo Agente 3 ao ligar `can/scope/serialize/taskFieldGuard` em
> cada rota. Ownership e AuditLog permanecem responsabilidade da rota/DAL.
