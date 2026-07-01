# MAPA DE ARQUITETURA — Performli

> Documento de referência da arquitetura técnica do Performli, o sistema
> operacional interno da Arkza. Sintetiza as 10 seções de auditoria em
> `docs/_audit/*.md` e o estado real do código em `src/`.
> **Fonte da verdade da operação: PostgreSQL.** "Arkza em processo, não em memória."

---

## 1. Visão geral da arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Framework | **Next.js 16** (App Router) |
| UI | **React 19** (Server Components por padrão) + Radix/shadcn (`src/components/ui`) |
| Linguagem | **TypeScript** |
| ORM | **Prisma 7** |
| Banco | **PostgreSQL** (Neon) |
| Deploy | **Vercel** (functions + Vercel Cron) |
| Auth | **JWT** (`jose`, HS256) em cookie httpOnly `performli_session` |

Integrações externas: Meta Ads, Google Ads, GA4, Nuvemshop, Asaas, Z-API /
Evolution (WhatsApp), Windsor, base de conhecimento (RAG) e ClickUp. Chaves
dinâmicas vivem em `IntegrationSetting` (nunca hardcoded).

Princípios estruturantes já materializados no código:
- **Leitura via DAL** (`src/lib/dal.ts`, `import 'server-only'`).
- **Mutação via Server Actions** (`src/app/actions/*`) com `auth + papel + posse`.
- **Rotinas via crons** (`src/app/api/cron/*`) → serviços (`src/services/*`).
- **Estado canônico no PostgreSQL**; syncs escrevem `MetricSnapshot`/`CampaignSnapshot`.

---

## 2. Estrutura de diretórios (comentada)

```
performli-sistema-geral/
├── prisma/                       # schema.prisma + migrations (aditivas)
├── vercel.json                   # crons + maxDuration (sync/cron = 300s)
├── src/
│   ├── middleware.ts             # guarda de borda JWT por prefixo de rota
│   │
│   ├── app/
│   │   ├── (auth)/login/         # route group público — única tela sem sessão
│   │   ├── (dashboard)/          # route group protegido — ~30 telas operacionais
│   │   │                         #   layout.tsx compartilhado (navegação/sidebar)
│   │   ├── api/                  # 45 route handlers (backend HTTP)
│   │   │   ├── cron/             # daily · digest · recurrences · resultados
│   │   │   ├── sync/             # meta · google-ads · ga4 · nuvemshop · health · stream
│   │   │   ├── webhooks/         # whatsapp
│   │   │   ├── comercial/        # leads · activities (CRM)
│   │   │   ├── financeiro/       # cashflow · expenses · summary
│   │   │   ├── asaas/            # webhook + endpoints de cobrança
│   │   │   ├── nuvemshop/        # OAuth + webhooks e-commerce
│   │   │   ├── leads/ ai/ clients/ team/ settings/ admin/ whatsapp/ debug/ seed/
│   │   └── actions/              # 27 arquivos de Server Actions (mutações)
│   │                             #   clients, tasks, checkin, warRoom, contracts,
│   │                             #   antiChurn, goals, operacional, team, ...
│   │
│   ├── lib/                      # utilidades transversais
│   │   ├── dal.ts                # DAL de leitura (server-only, cache, unstable_cache)
│   │   ├── auth.ts session.ts    # emissão/verificação de JWT e sessão
│   │   ├── audit.ts              # assertClientMutationAccess + writeAuditLog
│   │   ├── prisma.ts             # singleton PrismaClient
│   │   ├── knowledge-search.ts   # RAG · whatsapp.ts · email.ts · pops-catalog.ts
│   │
│   ├── services/                 # ~30 serviços de integração/automação (chamados por crons)
│   │   ├── meta-ads/ google-ads/ ga4/ nuvemshop/ asaas/   # sync de plataformas
│   │   ├── zapi/ evolution/ notifications/ windsor/        # mensageria/dados
│   │   ├── health-scorer.ts churn-scorer.ts               # scoring
│   │   ├── recurrence-engine.ts resultado-engine.ts       # engines idempotentes
│   │   └── *-monitor.ts *-checker.ts *-escalation.ts       # monitores/escalações
│   │
│   └── components/               # componentes React por domínio de tela + ui/
│       └── cockpit/ comercial/ financeiro/ agency/ clients/ tasks/ ... ui/
```

---

## 3. Camadas e responsabilidades

```
┌─────────────────────────────────────────────────────────────────────┐
│ page.tsx / Server Component  (src/app/(dashboard)/**/page.tsx)       │
│   → só apresentação; NÃO fala com prisma direto                     │
├─────────────────────────────────────────────────────────────────────┤
│ LEITURA:  src/lib/dal.ts   (requireSession + filtro por papel/posse) │
│ MUTAÇÃO:  src/app/actions/*.ts  (auth + papel + posse + AuditLog)    │
├─────────────────────────────────────────────────────────────────────┤
│ Prisma (src/lib/prisma.ts)  → PostgreSQL/Neon  ← fonte da verdade    │
├─────────────────────────────────────────────────────────────────────┤
│ src/services/*  → integrações externas (Meta, GA4, Asaas, Z-API...)  │
└─────────────────────────────────────────────────────────────────────┘
```

- **`page.tsx` / Server Component** — busca dados chamando a DAL; renderiza.
- **DAL (`src/lib/dal.ts`)** — `requireSession()` (`cache()`, redirect `/login`);
  `canViewAll(role)` decide ADMIN/CS (tudo) vs MANAGER/ANALYST (só atribuídos via
  `ClientAssignment`); usa `unstable_cache` para leituras caras.
- **Server Actions (`src/app/actions/*`)** — toda mutação passa por
  `requireSession()` + `assertClientMutationAccess(session, clientId, {allowCS})`
  (`src/lib/audit.ts:17`) + `writeAuditLog(...)` (`audit.ts:44`, append-only).
  Retorno padronizado `{ ok: true } | { error }`. Referência de ouro:
  `actions/warRoom.ts:25` (`saveWarRoomPlan`).
- **Prisma → PostgreSQL** — estado canônico. Nenhuma tela lê de planilha/WhatsApp.
- **Serviços** — cada chamada externa deve ter timeout; escrevem snapshots/scores.

Regras inegociáveis materializadas: leitura pela DAL, mutação valida
`auth + papel + posse`, sem bypass, sem endpoint público desprotegido,
segredos em `IntegrationSetting`, `AuditLog` em automação crítica.

---

## 4. Fluxo de dados

### 4.1 Requisição de tela (leitura/mutação)

```
Browser
  │  GET /cockpit  (cookie performli_session)
  ▼
src/middleware.ts ── jwtVerify (jose, HS256) ── prefixo protegido?
  │  não autenticado → redirect /login?callbackUrl=...
  ▼ autenticado
src/app/(dashboard)/cockpit/page.tsx  (Server Component)
  │
  ├── leitura ──► src/lib/dal.ts  (requireSession + filtro papel/posse)
  │                    └──► prisma ──► PostgreSQL/Neon
  │
  └── mutação (form/action) ──► src/app/actions/*.ts
                                   ├── requireSession()
                                   ├── assertClientMutationAccess(...)
                                   ├── prisma.update(...)  ──► PostgreSQL
                                   └── writeAuditLog(...) + revalidate
```

`middleware.ts` protege todos os prefixos do dashboard (lista `PROTECTED_PREFIX`)
e **não** intercepta `/api/*` (matcher exclui `api`). Rotas `/api` fazem sua
própria autorização (sessão, `CRON_SECRET`, `SEED_SECRET`, assinatura de webhook).

### 4.2 Fluxo dos crons (Vercel Cron)

```
Vercel Cron (schedule em vercel.json)
  │  GET /api/cron/daily
  │  Authorization: Bearer <CRON_SECRET>   (ou x-cron-secret)
  ▼
src/app/api/cron/daily/route.ts ── isAuthorized() valida CRON_SECRET
  │   (env ausente → 401; nunca roda sem segredo)
  ▼
runDailySync() — orquestra ~20 passos, cada passo em try/catch isolado
  │   (falha de um passo NÃO derruba os demais; summary ok/error por passo)
  ▼
src/services/*  (syncAllMetaAccounts, recalculateAllClientsHealth,
  │              scoreAllClientsChurnRisk, checkInadimplencia, ...)
  ▼
prisma ──► PostgreSQL   +   Alert / AuditLog / AutomationLog / lastRunAt
```

**Ideal (regra nº 7):** cada loop por cliente tem `try/catch`, para que um
cliente com dado corrompido não quebre o lote. Regra nº 9/10: registrar
`lastRunAt` e mostrar "última atualização" na tela.

**Estado real (auditoria `docs/_audit/crons.md`):**
- ✅ Isolamento por passo no `daily`; `CRON_SECRET` em todas as 4 rotas.
- ✅ Idempotência: `recurrence-engine` (`idempotencyKey`), `resultado-engine`
  (`Client.resultadoWeek`); `digest` separado do sync.
- ⚠️ **Loops batch sem try/catch por cliente** em `health-scorer.ts:477`,
  `churn-scorer.ts:147`, `oscillation-detector.ts:199`, `budget-monitor.ts:36`,
  `critical-account-detector.ts:46`, `contract-expiry-checker.ts:25`,
  `weekly-report-generator.ts:945`, `weekly-checklist-generator.ts:57/149`.
- ⚠️ `lastRunAt`/SyncLog persistido só em recurrence/resultado; o `summary` do
  `daily` não é persistido (dificulta responder "qual rotina não rodou").

Schedules (`vercel.json`, UTC):

| Rota | Schedule | Função |
|------|----------|--------|
| `/api/cron/daily` | `0 11 * * *` (08:00 BRT) | ~20 passos: syncs, health, churn, anti-churn, check-ins, inadimplência, follow-up leads, escalações, budget, contas críticas, war room, contract expiry; domingo → weekly reports/checklists |
| `/api/cron/digest` | `30 11 * * *` | Digest diário via WhatsApp (Z-API) |
| `/api/cron/recurrences` | `0 10 * * *` | Gera tarefas recorrentes (idempotente) |
| `/api/cron/resultados` | `0 9 * * 1` (segunda) | Resultado semanal ROAS/GA4 + Etapa |

---

## 5. Mapa de rotas

### 5.1 Páginas do dashboard (`src/app/(dashboard)/**/page.tsx`)

| Área | Rota | Papel operacional |
|------|------|-------------------|
| Home operacional | `/meu-dia`, `/minha-semana` | O que preciso fazer hoje/na semana |
| Comando | `/cockpit`, `/dashboard`, `/` | Visão única da agência (saudável/atenção/crítico) |
| Tarefas | `/tasks`, `/operations`, `/processos` | Central de tarefas e POPs |
| Clientes | `/clients`, `/clients/[slug]`, `/clients/new` | Client 360 |
| Canais/Métricas | `/canais`, `/reports` | Meta/Google/GA4/Nuvemshop |
| CS / Anti-churn | `/anti-churn`, `/check-ins`, `/validacoes`, `/aceite` | Sucesso do cliente |
| War Room | via `/operacional` | Contas críticas |
| Comercial (CRM) | `/comercial`, `/comercial/dashboard`, `/pipeline` | Leads e funil |
| Financeiro | `/financeiro` | Contas a receber/pagar |
| Jurídico/Contratos | `/juridico` | Contratos e regularidade |
| Agência/Gestão | `/agency`, `/agency/metas`, `/managers`, `/managers/assignments`, `/team` | Metas e atribuições |
| IA / Conhecimento | `/ai-agents`, `/knowledge` | Copiloto + RAG |
| Alertas / Config | `/alerts`, `/settings` | Alertas e integrações |

### 5.2 API routes (`src/app/api/*`)

- **`cron/*`** — `daily`, `digest`, `recurrences`, `resultados` (CRON_SECRET).
- **`sync/*`** — `meta`, `google-ads`, `ga4`, `nuvemshop`, `health`, `stream`.
- **`webhooks/*`** — `whatsapp`. (Também `nuvemshop/webhooks`, `asaas/webhook` — HMAC).
- **`comercial/*`** — `leads`, `activities`. **`leads/*`** — captação (Zod).
- **`financeiro/*`** — `cashflow`, `expenses`, `summary`.
- **`asaas/*`**, **`nuvemshop/*`** — cobrança e e-commerce (OAuth + webhook).
- **`ai/*`**, **`clients/*`**, **`team/*`**, **`settings/*`**, **`admin/*`**,
  **`whatsapp/*`**, **`seed/*`** (SEED_SECRET), **`debug/*`**.

---

## 6. Diagrama textual do fluxo principal

```
                         ┌──────────────┐
                         │   Browser    │  cookie httpOnly: performli_session
                         └──────┬───────┘
                                │
                 ┌──────────────▼───────────────┐
                 │   src/middleware.ts (JWT)     │  jose HS256 · prefixos protegidos
                 └───────┬───────────────┬───────┘
        autenticado      │               │  não autenticado → /login
                         ▼               │
        ┌────────────────────────┐       │
        │ (dashboard)/**/page.tsx│       │
        │   Server Component     │       │
        └───────┬────────┬───────┘       │
       leitura  │        │ mutação       │
                ▼        ▼               │
        ┌───────────┐ ┌───────────────┐  │        ┌───────────────────────┐
        │ lib/dal.ts│ │ app/actions/* │  │        │  Vercel Cron          │
        │ (papel/   │ │ auth+papel+   │  │        │  → api/cron/* (SECRET) │
        │  posse)   │ │ posse+AuditLog│  │        │  → services/* (loops)  │
        └─────┬─────┘ └──────┬────────┘  │        └───────────┬───────────┘
              │              │           │                    │
              └──────────────┴───────────┴────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Prisma (lib/prisma.ts) │
                    └───────────┬────────────┘
                                ▼
                    ┌────────────────────────┐        ┌──────────────────────┐
                    │  PostgreSQL / Neon      │◄──────►│ Integrações externas │
                    │  ★ FONTE DA VERDADE ★   │  sync  │ Meta·Google·GA4·     │
                    │  snapshots·scores·audit │        │ Nuvemshop·Asaas·Z-API│
                    └────────────────────────┘        └──────────────────────┘
```

---

## 7. Fonte da verdade e desacoplamento do ClickUp

**A fonte única da verdade é o PostgreSQL (Neon).** Todo estado canônico
(clientes, tarefas, check-ins, war room, financeiro, leads, contratos, métricas)
vive no banco. Syncs de plataforma gravam `MetricSnapshot` e `CampaignSnapshot`;
automações registram em `Alert`, `AuditLog`, `AutomationLog`. Telas leem sempre
via DAL a partir do banco — nunca de memória, planilha ou WhatsApp.

**Direção estratégica (CLAUDE.md):** o Performli deve **substituir gradualmente
o ClickUp** nas rotinas críticas (tarefas recorrentes, check-ins, CRM, follow-ups,
onboarding, war room, financeiro, contratos, comissões, visão geral). O ClickUp
pode ser fonte de dados de origem numa fase de transição, mas o estado canônico
já é o Performli.

**Estado atual do desacoplamento:** os processos-núcleo já rodam dentro do
Performli com ownership no PostgreSQL:
- Tarefas recorrentes → `recurrence-engine.ts` (idempotente, `AutomationLog`).
- Check-ins semanais / validação CS → `actions/checkin.ts`, `checkin-monitor.ts`.
- CRM comercial / follow-up → `api/comercial/*`, `lead-followup-checker.ts`.
- War Room / contas críticas → `actions/warRoom.ts`, `warroom-*`, `critical-account-detector.ts`.
- Financeiro / contas a receber → `api/financeiro/*`, integração Asaas + `inadimplencia-checker.ts`.
- Contratos → `actions/contracts.ts`, `contract-expiry-checker.ts`.

Toda integração ClickUp deve ser classificada (`clickup→performli`,
`performli→clickup`, `bidirecional`) com o alvo de **reduzir** a dependência.
Não criar acoplamentos que dificultem o desligamento futuro do ClickUp.

---

> Referências de auditoria: `docs/_audit/{arquitetura,backend,crons,frontend,`
> `integracoes,banco,seguranca,performance,stack,testes-docs}.md`.
> Regras transversais: `CLAUDE.md` e `AGENTS.md`.
