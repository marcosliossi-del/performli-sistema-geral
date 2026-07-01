## Backend & Server Actions

Auditoria das 27 Server Actions (`src/app/actions/*.ts`) e ~44 rotas
(`src/app/api/**/route.ts`). Foco: auth + papel + posse por mutação, AuditLog,
timeouts e retornos `{ok}|{error}`.

### (a) Padrão geral e exemplos bons

Existe uma boa infraestrutura de base:

- `requireSession()` (`src/lib/dal.ts:12`) — guard de autenticação com `redirect('/login')`.
- `assertClientMutationAccess(session, clientId, {allowCS})` (`src/lib/audit.ts:17`) —
  helper canônico que implementa exatamente a regra: ADMIN tudo, CS só com
  `allowCS`, MANAGER só clientes atribuídos via `ClientAssignment`, ANALYST nunca.
- `writeAuditLog(...)` (`src/lib/audit.ts:44`) — append-only, nunca derruba a mutação.

**Exemplos que seguem o padrão inteiro (auth + papel + posse + AuditLog + retorno tipado):**

- `warRoom.ts:25` `saveWarRoomPlan` — busca protocolo, `assertClientMutationAccess(..., {allowCS:true})`,
  valida evidência mínima, retorna `{ok:true}|{error}`. **Referência de ouro.**
- `checkin.ts`, `operacional.ts`, `antiChurn.ts`, `fichaCs.ts`, `platformAccounts.ts` —
  usam `assertClientMutationAccess` + `writeAuditLog` (7 checagens de posse em platformAccounts).
- `team.ts:18/49` — mutações de usuário exigem `role === 'ADMIN'` explicitamente.
- `settings/asaas/route.ts` — GET/POST/DELETE todos exigem `role === 'ADMIN'`; POST testa a chave.

### (b) Pontos fortes

- Camada de posse centralizada e correta em UM lugar — quando usada, funciona.
- Webhooks sensíveis validam assinatura: `nuvemshop/webhooks/route.ts:25` (HMAC SHA256),
  `asaas/webhook`. Crons validam `CRON_SECRET`.
- Retornos padronizados `{ok}|{error}` na maioria das actions; validação Zod em várias
  rotas (`leads/capture`, `comercial/leads`, `tasks.ts`).
- `seed/route.ts` protegido por `SEED_SECRET`; nenhum segredo hardcoded encontrado nas actions.

### (c) Riscos por severidade (arquivo:linha)

#### 🔴 CRÍTICO — mutação sem checagem de papel/posse

1. **`updateClient.ts:28` `updateClient` / `:63` `bulkSetBusinessType`** — só `requireSession()`.
   MANAGER/ANALYST/CS podem editar dados cadastrais e financeiros (`contractValue`) de
   QUALQUER cliente, atribuído ou não. Sem `assertClientMutationAccess`, sem AuditLog.
2. **`interactions.ts:31` `updatePipelineStage` / `:47` `updateClientCrmFields`** — só
   `requireSession()`. Alteram estágio de pipeline, status, e-mail, telefone, `contractValue`
   de qualquer cliente. `deleteInteraction:24` apaga interação de qualquer cliente sem posse.
3. **`contracts.ts:20` (create) / `:84`,`:143` (update/renovação)** — dados financeiros
   contratuais (feeValue, setupFee) criados/alterados com apenas `requireSession()`. Sem
   papel, sem posse, sem AuditLog. FIN é área sensível.
4. **`goals.ts:204` `createGoal`** — cria meta para qualquer `clientId` só com `requireSession()`
   (note: `upsertMonthlyGoals:108` exige ADMIN — inconsistente). `syncWeeklyGoalsFromMonthly:60`
   idem sem papel.
5. **`api/clients/[clientId]/budget/route.ts:11`** — aceita ADMIN/CS/**MANAGER** mas NÃO
   verifica se o MANAGER é dono do `clientId`. MANAGER define orçamento (SPEND) de qualquer cliente.
6. **`protocols.ts:8` `updateProtocolStatus` / `:36` `updateProtocolNotes`** — encerram/editam
   War Room de qualquer cliente só com `requireSession()` (enquanto `updateProtocolBriefing:22`
   ao menos filtra papel). Sem posse, sem AuditLog em processo crítico.

#### 🟠 ALTO

7. **`tasks.ts:17`/`:54`** — `createTask`/`updateTaskStatus` só `requireSession()`; qualquer
   papel conclui tarefa de qualquer cliente e dispara automação (ONB-05) sem checagem de posse.
   Automação crítica sem AuditLog.
8. **`api/comercial/leads/route.ts` e `activities`** — POST exige apenas sessão (qualquer papel,
   incl. ANALYST) para criar/editar leads comerciais. Sem restrição de papel comercial.
9. **Timeouts ausentes em chamadas externas** — só 1 de ~6 serviços usa `AbortSignal`
   (`grep` em `src/services`: 17 `await fetch(` vs 1 `AbortSignal`). Chamadas Meta/GA4/Windsor
   sem timeout podem pendurar rotas de sync e o cron (viola regra técnica #6).

#### 🟡 MÉDIO

10. **`api/leads/capture/route.ts:117`** — público (ok por design) mas CORS `*` reflete
    qualquer origin e não há rate-limit; risco de flood de leads falsos.
11. **`api/nuvemshop/webhooks/route.ts:25`** — HMAC só é verificado SE `NUVEMSHOP_APP_SECRET`
    estiver setado; sem o env var o webhook aceita qualquer payload (bypass silencioso).
12. **AuditLog ausente na maioria das mutações financeiras/cadastrais** (updateClient,
    contracts, goals, tasks) — viola regra técnica #8 para automação/dado crítico.

### 🔒 Travas / Fluidez

- **Trava real (segurança):** itens 1–6 são bypass de autorização — MANAGER/ANALYST/CS
  mutam clientes não atribuídos. É a violação direta da regra inegociável. Correção é mecânica
  (inserir `assertClientMutationAccess` já existente) e deve ser trava de merge.
- **Trava de resiliência:** falta de timeout (item 9) pode travar o cron diário — regra #6/#7.
- **Fluidez:** o helper de posse já existe e é barato de aplicar; não há necessidade de novo
  model nem migration. Padronizar retorno `{ok}|{error}` + `writeAuditLog` nas actions faltantes
  fecha itens 1–8 e 12 sem risco de regressão de schema.
- **Inconsistência a resolver:** `upsertMonthlyGoals` exige ADMIN mas `createGoal`/budget não —
  definir a política de papel para metas/orçamento e aplicar uniformemente.
