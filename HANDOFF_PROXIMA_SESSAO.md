# HANDOFF — Próxima Sessão (Performli / Arkza)

> Objetivo deste documento: permitir que outra sessão assuma o projeto
> **imediatamente**, sem re-descoberta. Leia junto com `AUDITORIA_SISTEMA.md`
> (travas priorizadas), `PROJECT_STATE.md` (log do maestro) e `CLAUDE.md`
> (regras inegociáveis). Data de referência: 2026-07-01.

---

## 1. Como iniciar

Scripts (`package.json`):

| Script | Comando | Uso |
|---|---|---|
| `dev` | `next dev` | Desenvolvimento local |
| `build` | `prisma generate && npm run migrate:deploy && next build` | Build de produção (Vercel) |
| `migrate:deploy` | `prisma migrate deploy` com **3 tentativas** (backoff 12s/25s) | Aplica migrations; retry cobre cold-start do Neon |
| `seed` | `tsx prisma/seed.ts` | Popula áreas/POPs/templates recorrentes |
| `start` | `next start` | Servir build |
| `lint` | `eslint` | Lint |

Passos: `npm install` → configurar `.env` → `npm run migrate:deploy` →
`npm run seed` (opcional) → `npm run dev`.

### Variáveis de ambiente necessárias

**Núcleo (sem elas o app não sobe / fail-closed):**
- `DATABASE_URL` — PostgreSQL (Neon). Datasource do Prisma.
- `SESSION_SECRET` — assinatura do JWT HS256 (cookie `performli_session`). `getSecretKey()` lança se ausente.
- `CRON_SECRET` — auth dos crons (`/api/cron/*`, Bearer ou `x-cron-secret`). Fail-closed se ausente.

**Integrações (por serviço; várias com fallback via `IntegrationSetting`):**
- Asaas: `ASAAS_API_KEY`, `ASAAS_SANDBOX`, `ASAAS_WEBHOOK_TOKEN` (webhook fail-closed 503 sem token). Preferir `IntegrationSetting` (`settings/asaas`).
- Nuvemshop: `NUVEMSHOP_APP_ID`, `NUVEMSHOP_APP_SECRET` (HMAC do webhook), demais `NUVEMSHOP_APP_*`. Token por loja vive no DB.
- WhatsApp Z-API: `ZAPI_*` (incl. `ZAPI_CLIENT_TOKEN` para o webhook inbound) — via `IntegrationSetting`, fallback env. Evolution: `EVOLUTION_*`.
- Meta Ads: `META_SYSTEM_TOKEN` (token por conta no DB).
- Google Ads / GA4: Service Account JWT (+ dev token do Google Ads); GA4 tem fallback OAuth. Windsor: `WINDSOR_API_KEY`.
- IA: `ANTHROPIC_API_KEY` — necessária em **runtime** (plano de ação, relatórios, chat IA). Não bloqueia o build.
- Outras: `SEED_SECRET` (rota de seed), `WHATSAPP_*` (digest diário), Resend (e-mail).

> Regra 5 do CLAUDE.md: nada de segredo hardcoded — chaves dinâmicas via `IntegrationSetting`.

---

## 2. Como o build/deploy funciona

- Deploy na **Vercel**. O build roda `prisma generate && migrate:deploy && next build`.
  Ou seja, **a migração de schema acontece dentro do build** (ponto único de falha
  aceitável porque migrations são aditivas — regra 13).
- `migrate:deploy` tem **retry com backoff** para o **cold-start do Neon** (Postgres serverless).
- `vercel.json`: 4 crons (`daily`, `digest`, `recurrences`, `resultados`) + `maxDuration`
  por família de rota (sync 300s, cron 300s, nuvemshop 60s, knowledge 120s).
- **Verificação SÓ via CI (Vercel).** No ambiente de dev remoto **não há `node_modules`
  nem build local** (registry npm retorna 403). Nunca conte com `npm install`/`next build`
  local para validar — **o gate é o CI da Vercel verde**.
- **Não há testes automatizados hoje.** A única defesa de código é o type-check do
  `next build` (`strict: true`). Esta é a maior fragilidade estrutural (ver §7).

---

## 3. Como testar manualmente os fluxos críticos

Sem suíte de testes, valide manualmente após cada fatia:

1. **Login/auth** — `/login` gera cookie httpOnly; middleware redireciona rotas
   protegidas quando deslogado. Confirmar que rota protegida sem sessão → login.
2. **Posse nas mutações** — logar como MANAGER e tentar mutar cliente **não
   atribuído**: deve ser bloqueado por `assertClientMutationAccess` (auth+papel+posse).
   ANALYST nunca muta; CS só com `allowCS`.
3. **Sync Asaas (`/financeiro`)** — disparar sync; conferir entradas
   (payments→AsaasPayment) e saídas (DEBIT→Expense source=ASAAS) sem dupla contagem;
   fila de inadimplência (status=OVERDUE) coerente.
4. **Gerar relatório com check-in** — fluxo OPE-06: gestor preenche checklist +
   evidência (≥5 chars) → `submitTaskForValidation` (AGUARDANDO_CS) → CS aprova
   (`decideTaskValidation` → CONCLUIDO) ou solicita ajustes. Conferir TaskApproval +
   AuditLog + evidência obrigatória.
5. **resultado-engine** — rodar `/api/cron/resultados?force=1` (com CRON_SECRET):
   por cliente ECOMMERCE ativo, soma faturamento GA4 + investimento da semana
   DOM–SÁB → ROAS vs meta → Resultado/Etapa; RUIM/PÉSSIMO gera Alert + Task de
   plano de ação; idempotente por `resultadoWeek`. Ver surfacing em `/clients`.

---

## 4. O que NÃO alterar / cuidados

- **Migrations aditivas** — nunca reescrever migration já aplicada. Manter padrão
  idempotente novo (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  `DO $$ ... EXCEPTION WHEN duplicate_object`). Migrations antigas (mar–mai/2026)
  são cruas mas já aplicadas — deixar como estão.
- **Enum Prisma em filtros** — use `Prisma.TaskWhereInput['status']` (o tipo do
  campo), **não** `string[]`, ou o type-check do build quebra.
- **`import type { ReactNode }`** — importar tipos com `import type` (evita erro de
  type-only import sob `strict`).
- **`globals.css` (Tailwind v4)** — os **overrides não-layered** (fora de `@layer`)
  vencem as utilities do Tailwind de propósito (retematização central da paleta
  Arkza). Não mover para `@layer` nem "limpar" sem entender o efeito de cascata.
- **Cold-start Neon** — o retry no `migrate:deploy` existe por isso; não remover.
- **Modelo IA `claude-sonnet-4-6`** — é **válido e ativo**, não trocar. (`insights.ts`
  usa `claude-haiku-4-5-20251001`, também correto.)
- **Regra 11/12** — não quebrar deploy de produção; não remover funcionalidade sem
  justificativa registrada no `PROJECT_STATE.md`.

---

## 5. Fluxo de trabalho

- **Fatia vertical** (um POP / uma tela por vez) → **PR** → **CI (Vercel) verde** →
  **merge squash**.
- **Sempre branch a partir da `main` atualizada.** `main` = produção.
- Ordem de agentes (CLAUDE.md): auditoria + lacunas + arquitetura **aprovadas**
  antes de qualquer escrita; `guardiao` é o portão final (aprova/reprova, nunca conserta).
- **Nenhuma fatia é "concluída" sem evidência mínima** (regra 14): check-in
  preenchido, relatório gerado, mensagem enviada, ou AuditLog registrado.

---

## 6. Arquivos críticos

| Arquivo | Papel |
|---|---|
| `src/lib/dal.ts` | Camada de leitura (~3.5k linhas, 52 exports) com auth/ownership embutidos. Toda leitura de tela passa aqui. |
| `src/lib/audit.ts` | `assertClientMutationAccess` (RBAC+posse) + `writeAuditLog` (append-only, nunca lança). |
| `src/middleware.ts` | Protege **páginas** por prefixo (auth). **Exclui `/api`** — cada handler de API deve checar sessão/segredo por conta própria. |
| `prisma/schema.prisma` | 64 models. Fonte da verdade canônica (PostgreSQL). |
| `src/services/*` | 29 serviços: monitores/crons (health, churn, inadimplência, escalação…), geradores (weekly-report, weekly-checklist, recurrence-engine, resultado-engine), integrações (meta/google/ga4/asaas/nuvemshop/zapi…). |
| `src/services/report-prompts.ts` | Prompts de geração de relatório por IA. |
| `src/app/actions/*` | 27 arquivos de server actions (mutações; padrão auth+papel+posse+AuditLog). Ouro: `operacional.ts`. |

---

## 7. Estado atual e principais dívidas (o que fazer a seguir)

**Estado geral: saudável e maduro.** Camadas bem definidas, migrations 100%
aditivas/idempotentes, ClickUp praticamente desacoplado (fonte da verdade no
PostgreSQL), webhooks Asaas/Nuvemshop fail-closed, financeiro/contratos ADMIN-only,
GA4 sem dupla contagem. A maioria dos crons isola falha por cliente.

Resumo da **tabela de travas priorizada** (`AUDITORIA_SISTEMA.md`), em ordem de
prioridade — todas "aplicar agora" e baixo risco, salvo indicado:

### 🔴 Crítico / Alto — próximos alvos
1. **Testes/CI de código** — zero testes, sem pipeline; única defesa é o type-check
   do build. **Maior fragilidade estrutural.** Criar `.github/workflows/` + smoke tests.
2. **Posse residual** (mutações legadas sem auth+papel+posse+AuditLog):
   - `actions/tasks.ts` (`createTask`, `updateTaskStatus`) — qualquer papel muta qualquer clientId.
   - `actions/operations.ts` (`createOperation`).
   - `actions/alerts.ts` (`markAlertRead`), `actions/chat.ts` (`ensureClientChat`, **sem `requireSession`**),
     `actions/operacional.ts` (`addTaskComment`, `toggleChecklistItem` — sem posse).
   > Contraste correto: `operacional.ts` (create/submit/decide). Replicar o padrão.
3. **Webhook WhatsApp inbound fail-OPEN** (`api/webhooks/whatsapp/route.ts:18`) —
   token só validado se o header vier. Tornar **fail-closed** (padrão Asaas/Nuvemshop),
   exigindo `ZAPI_CLIENT_TOKEN`. Validar env antes do deploy p/ não derrubar recebimento.
4. **OAuth Nuvemshop** (`api/nuvemshop/callback/route.ts:12`) — `state` base64 **não
   assinado** + `clientId` arbitrário (IDOR: vincula loja/token a cliente alheio).
   Assinar/verificar `state` e exigir sessão+posse. (Risco de regressão: médio — testar fluxo OAuth.)
5. **Resiliência dos geradores semanais** — `weekly-report-generator.ts:852` e
   `weekly-checklist-generator.ts:149` **não** têm try/catch por cliente/manager
   (regra 7): um item quebra a rodada de domingo inteira. Isolar falha por cliente.
6. **Sem error boundary** — nenhuma `error.tsx` no App Router; qualquer exceção de
   RSC/DAL cai na tela técnica do Next. Criar `error.tsx` (dashboard) com copy
   operacional + "tentar de novo".

### 🟡 Médio (selecionados)
- `getClientChat` faz `upsert` (escrita) dentro de `cache()` — leitura vira escrita a cada request (`dal.ts:2233`).
- Mutação de lead sem papel (`api/comercial/leads/[id]`), `leads/capture` público sem rate-limit / CORS `*`.
- Credenciais GA4/Google/Meta/Windsor só em env (regra 5 — migrar p/ `IntegrationSetting`, aditivo).
- AuditLog ausente em automações de status (health/churn) e em interactions/protocols/goals.
- `lastRunAt`/SyncLog só em ~5 de 29 serviços (regras 9/10).
- 2 fetches Meta sem timeout (`meta-ads/client.ts:176,200`).

### 🟢 Baixo (organização, sem impacto no usuário)
- `dal.ts` monolítico (fatiar por domínio); 9 telas com Prisma inline fora da DAL
  (pior: `financeiro/page.tsx`); pastas duplicadas `clientes/`↔`clients/`;
  índices compostos úteis (`AsaasPayment(status,dueDate)`, `Task(status,dueDate)`,
  `Alert(clientId,type)`); remover `next-auth` (0 imports); pinar `@anthropic-ai/sdk`.

> Ordem sugerida de ataque: (1) CI + smoke tests → (2) posse residual + webhook
> WhatsApp + OAuth Nuvemshop (segurança) → (3) resiliência dos geradores semanais +
> error boundary → (4) dívidas médias/organização conforme houver janela.
