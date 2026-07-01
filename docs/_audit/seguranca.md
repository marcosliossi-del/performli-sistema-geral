# Auditoria — Segurança

> Escopo: autenticação, RBAC, proteção de endpoints, segredos, exposição de dados.
> Método: read-only sobre `src/`. Data: 2026-07-01.

## (a) Modelo de auth / RBAC

- **Auth:** JWT HS256 assinado com `SESSION_SECRET`, armazenado em cookie
  `performli_session` httpOnly, `secure` em produção, `sameSite=lax`, 7 dias
  (`src/lib/session.ts`). `getSecretKey()` lança se `SESSION_SECRET` ausente —
  fail-closed correto.
- **Middleware (`src/middleware.ts`):** protege **páginas** por `PROTECTED_PREFIX`
  (redireciona p/ login se não autenticado). O matcher **exclui `/api`**
  (`(?!api|...)`), então a proteção das rotas de API depende inteiramente de
  cada handler chamar `getSession()` / checar segredo. Não há verificação de
  papel no middleware (só autenticação).
- **RBAC:** `ADMIN`/`CS` = `canViewAll` (leitura ampla). `MANAGER`/`ANALYST`
  = escopo por `assignments` (posse) na DAL (`src/lib/dal.ts`). Mutações
  sensíveis fazem checagem de papel no handler; posse via
  `assertClientMutationAccess` (`src/lib/audit.ts`).

## (b) Pontos fortes

- **Segredos:** nenhum hardcoded encontrado (grep de padrões). Chaves de
  integração via `IntegrationSetting` (ex.: `settings/asaas`) ou env.
- **Webhooks fail-closed corretos:** `asaas/webhook` (token
  `asaas-access-token`, 503 sem env) e `nuvemshop/webhooks` (HMAC SHA256,
  503 sem `NUVEMSHOP_APP_SECRET`).
- **Crons protegidos:** `cron/daily|digest|recurrences|resultados` exigem
  `CRON_SECRET` (Bearer ou `x-cron-secret`), fail-closed quando env ausente.
- **Seed protegido:** `api/seed` e `admin/seed-contracts` exigem
  `x-seed-secret`/sessão ADMIN.
- **Financeiro/contratos ADMIN-only:** `financeiro/summary`,
  `financeiro/expenses`, `financeiro/cashflow`, `admin/contract-fee`,
  `settings/asaas` checam `role !== 'ADMIN'`. Cockpit e DAL financeira
  (`getOverdueInvoices`, `getCockpitData`) só retornam dados p/ `canViewAll`.
- **Chave Asaas mascarada** na resposta do GET (`settings/asaas`).
- **Todas as ~45 rotas** de API têm `getSession()` ou checagem de segredo —
  nenhuma rota autenticada ficou totalmente aberta.

## (c) VULNERABILIDADES por severidade

### ALTA
1. **`nuvemshop/callback` sem autenticação + `clientId` controlado pelo
   chamador** — `src/app/api/nuvemshop/callback/route.ts:12-28`. O `state` é
   apenas base64 (não assinado/HMAC) e traz `clientId`. Quem obtiver um `code`
   OAuth válido pode vincular uma loja Nuvemshop a **qualquer** `clientId`
   arbitrário (IDOR / falta de verificação de posse + state não assinado).
   Fluxo OAuth deveria validar sessão e assinar/verificar o `state`.

### MÉDIA
2. **Webhook WhatsApp fail-OPEN** —
   `src/app/api/webhooks/whatsapp/route.ts:18-24`. A validação do
   `client-token` só ocorre **se o header estiver presente**. Sem header,
   qualquer um pode criar `AgencyLead`/`AgencyActivity` (spam/poluição de CRM).
   Deveria exigir o token (fail-closed) como os demais webhooks.
3. **`leads/capture` público sem rate-limit / CORS `*`** —
   `src/app/api/leads/capture/route.ts:32,117-122`. Endpoint público (esperado
   p/ landing pages) mas `Access-Control-Allow-Origin` reflete qualquer origin
   e não há rate-limit → abuso/inundação de leads. Mitigar com throttle/captcha.
4. **Mutação de lead sem checagem de papel/posse** —
   `src/app/api/comercial/leads/[id]/route.ts:25-26` (PATCH) e
   `comercial/leads/route.ts:41` (POST): exigem apenas sessão (qualquer papel,
   incl. ANALYST). CS deveria ser leitura ampla "sem mutações indevidas"
   (CLAUDE.md). DELETE já restringe a ADMIN/CS. Confirmar regra de negócio.

### BAIXA
5. **Senhas default no seed** — `src/app/api/seed/route.ts:13-15`
   (`admin123`/`gestor123`/`analista123`). Protegido por `SEED_SECRET`, mas se
   rodado em produção cria contas com senhas triviais. Restringir a dev /
   forçar troca.
6. **Erro cru exposto** — `api/seed/route.ts:121` retorna `String(err)` no
   corpo; vazamento menor de detalhes internos. Idem `settings/asaas`.
7. **`team/members` expõe lista de usuários a qualquer papel autenticado**
   (`route.ts:7`) — apenas id/name/role/avatar; baixo risco, aceitável.

## (d) 🔒 Travas / Fluidez

- **Trava real (ALTA):** assinar/verificar `state` e exigir sessão+posse no
  `nuvemshop/callback`. Sem isso, dados de loja podem ser injetados em clientes
  alheios. Aplicável agora, baixo risco de regressão.
- **Trava (MÉDIA):** tornar webhook WhatsApp fail-closed exigindo
  `ZAPI_CLIENT_TOKEN`. Aplicável agora; validar env antes do deploy p/ não
  derrubar recebimento.
- **Fluidez:** middleware não cobre `/api` por design (Next). Aceitável desde
  que todo handler continue checando sessão — recomenda-se um helper único
  (`requireApiSession(role)`) para evitar rota futura esquecer a checagem.
- **Fluidez:** centralizar checagem de papel de mutação em comercial/leads
  para alinhar com "CS sem mutações indevidas".
