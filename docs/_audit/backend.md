# Auditoria — Backend & Server Actions

Escopo: 26 arquivos em `src/app/actions/*.ts` + 44 rotas em `src/app/api/**/route.ts`.
Regra inegociável avaliada: toda mutação valida **auth + papel + posse**
(`requireSession` + `assertClientMutationAccess`) e grava **`writeAuditLog`**;
toda chamada externa tem **timeout**.

## Backend & Server Actions

### (a) Padrão + exemplos

O padrão canônico está bem implementado na maioria das actions "novas":

```ts
const session = await requireSession()
try { await assertClientMutationAccess(session, clientId, { allowCS: true }) }
catch (e) { return { error: (e as Error).message } }
// ...mutação...
await writeAuditLog({ actorId, actorRole, action, entityType, entityId, clientId })
return { ok: true }
```

- **Referência de ouro:** `operacional.ts` (`createOperacionalTask`,
  `submitTaskForValidation`, `decideTaskValidation`) — auth + papel + posse +
  transação + `AuditLog` + retorno `{ok}|{error}`.
- Também corretos: `checkin.ts`, `fichaCs.ts`, `warRoom.ts`, `antiChurn.ts`,
  `updateClient.ts`, `protocols.ts` (posse via `assertProtocolAccess`).
- `assertClientMutationAccess` (`src/lib/audit.ts`) centraliza RBAC+posse
  corretamente: ADMIN livre, CS só com `allowCS`, MANAGER só cliente atribuído,
  ANALYST nunca muta.

### (b) Pontos fortes

- Webhooks bem protegidos e **fail-closed**: `asaas/webhook` (token +
  503 sem env), `nuvemshop/webhooks` (HMAC SHA-256 + 503 sem secret).
- Crons (`cron/daily`, etc.) exigem `CRON_SECRET` (Bearer ou header) e usam
  **try/catch por etapa** — falha de um passo não derruba a rotina (regra #7).
- Rotas admin/knowledge, settings, financeiro, comercial checam
  `getSession`/papel.
- Clients de integração têm timeout: `meta-ads` (25s), `ga4`, `google-ads`,
  `asaas`, `nuvemshop`, `windsor`, `zapi`, `evolution`.
- `writeAuditLog` é append-only e nunca lança (não derruba a mutação).

### (c) Riscos por severidade (arquivo:linha)

#### 🔴 Alto — mutação de recurso de cliente sem posse

- **`actions/tasks.ts:17` `createTask`** e **`:54` `updateTaskStatus`** — só
  `requireSession()`. Qualquer papel (inclusive ANALYST) cria/altera tarefas de
  **qualquer** `clientId`; sem `assertClientMutationAccess`, sem `AuditLog`.
  (Contraste: `operacional.ts` faz certo — `tasks.ts` é a versão legada.)
- **`actions/operations.ts:17` `createOperation`** — só `requireSession()`;
  cria `Operation` para qualquer `clientId` sem posse/papel e sem `AuditLog`.
- **`api/nuvemshop/callback/route.ts:12`** — `state.clientId` vem do parâmetro
  `state` (base64 controlado pelo cliente) e é usado direto para criar
  `PlatformAccount`/gravar `accessToken`. Não há `requireSession` nem verificação
  de posse do `clientId`. Vincula loja/token a cliente arbitrário.

#### 🟠 Médio — posse/papel parcial ou ausência de auditoria

- **`actions/alerts.ts:7` `markAlertRead`** — só `requireSession()`, sem escopo:
  MANAGER/ANALYST marca lido alerta de cliente não atribuído. (`markAllAlertsRead`
  já filtra por assignment — replicar no `markAlertRead`.)
- **`actions/operacional.ts:85` `addTaskComment`** e **`:104`
  `toggleChecklistItem`** — validam sessão e existência, mas **não** posse do
  cliente da tarefa; qualquer usuário comenta/altera checklist de qualquer tarefa.
- **`actions/chat.ts:58` `ensureClientChat`** — **sem `requireSession`**;
  faz `upsert` em `ClientChat` a partir de `clientId` sem qualquer auth.
- **`actions/weeklyChecklist.ts:16` `toggleChecklistItem`** — escopo pelo
  `managerId = session.userId` (ok), mas sem `AuditLog` de conclusão de item.
- **`api/leads/capture/route.ts:30`** — endpoint público **por design** (form de
  landing), mas `Access-Control-Allow-Origin` reflete qualquer `origin` e não há
  rate-limit; risco de flood de `AgencyLead`. Aceitável se documentado + throttle.

#### 🟡 Baixo — auditoria ausente em mutação com posse OK

- **`actions/interactions.ts`** (add/delete/updatePipelineStage/updateCrmFields) —
  posse OK, mas **sem `writeAuditLog`** (regra #8). Inclui mutação sensível de CRM.
- **`actions/protocols.ts`** (status/briefing/notes) — posse OK, **sem `AuditLog`**
  (War Room é processo crítico; deveria auditar).
- **`actions/goals.ts:36/121`** upsert weekly/monthly — papel ADMIN OK, sem audit.
- **Raw fetch sem timeout:** `services/meta-ads/client.ts:176` (`debug_token`) e
  `:200` (`me/adaccounts`) usam `fetch` sem `AbortSignal` (o loop principal em
  `:69` tem timeout). Baixo impacto, mas viola regra #6.

### 🔒 Travas / Fluidez

Travas (bloqueiam segurança/consistência — corrigir antes de novas fatias):

1. `tasks.ts` sem posse/papel — mutação de tarefa de cliente arbitrário.
2. `nuvemshop/callback` confia em `clientId` do `state` — vínculo forjado.
3. `operations.ts` sem posse/papel/audit.
4. `alerts.markAlertRead` sem escopo; `chat.ensureClientChat` sem auth;
   `operacional` comment/checklist sem posse.

Fluidez (dívida de rastreabilidade — não bloqueiam, mas violam regra #8):

- Padronizar `writeAuditLog` em interactions/protocols/goals.
- Timeout nos 2 `fetch` crus do Meta client.
- Rate-limit/allowlist de origin no `leads/capture`.
