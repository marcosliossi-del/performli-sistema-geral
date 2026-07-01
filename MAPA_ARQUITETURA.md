# MAPA_ARQUITETURA.md — Performli (Arkza)

> Mapa de arquitetura do sistema operacional interno da Arkza.
> Base: `AUDITORIA_SISTEMA.md` + `docs/_audit/*.md` (arquitetura, backend, banco, integracoes, performance, seguranca, stack).
> Referência: 2026-07-01 · 34 páginas · 44 API routes · 27 arquivos de actions · 29 serviços · 64 models Prisma · 46 migrations · ~42k LOC.

---

## 1. Visão geral da arquitetura

O Performli é um monólito **Next.js 16 (App Router)** com renderização majoritariamente
server-side (RSC + Server Actions). A fonte única da verdade é o **PostgreSQL (Neon)**
acessado via **Prisma 7** (`@prisma/adapter-pg` + `pg`). O ClickUp está praticamente
desacoplado — o estado canônico vive no banco.

| Camada | Tecnologia |
|---|---|
| Framework | Next.js `16.2.1` (App Router, RSC, Server Actions) |
| UI | React `19.2.4` + TypeScript (`strict: true`) |
| Estilo | Tailwind CSS v4 (`@tailwindcss/postcss`) + design system em `src/app/globals.css` |
| ORM / DB | Prisma `^7.5.0` + `@prisma/adapter-pg` · PostgreSQL serverless (Neon) |
| Auth | JWT HS256 (`jose`) em cookie httpOnly `performli_session` (7 dias) |
| IA | `@anthropic-ai/sdk` (`claude-sonnet-4-6`, `claude-haiku-4-5`) |
| Deploy | Vercel (build: `prisma generate && migrate:deploy && next build`; crons via `vercel.json`) |

Regra de frescor: `(dashboard)/layout.tsx` usa `force-dynamic` (SSR a cada request) —
decisão de frescor operacional em vez de cache de rota.

---

## 2. Estrutura de diretórios (comentada)

```
performli-sistema-geral/
├── prisma/
│   ├── schema.prisma          # 64 models — fonte única da verdade
│   ├── migrations/            # 46 migrations (aditivas/idempotentes desde 2026-06-30)
│   └── seed.ts                # seed via tsx (protegido por SEED_SECRET)
│
├── src/
│   ├── middleware.ts          # protege PÁGINAS (PROTECTED_PREFIX); exclui /api do matcher
│   │
│   ├── app/
│   │   ├── layout.tsx         # root layout
│   │   ├── globals.css        # design system Arkza (tokens, glass, overrides de cor)
│   │   ├── page.tsx           # raiz → redirect
│   │   │
│   │   ├── (auth)/            # route group público
│   │   │   └── login/page.tsx
│   │   │
│   │   ├── (dashboard)/       # route group protegido — 33 page.tsx (+ login = 34)
│   │   │   ├── layout.tsx     # shell protegido + force-dynamic
│   │   │   ├── cockpit/       # tela-referência (6 perguntas de UX por card)
│   │   │   ├── clients/       # lista + [slug] (Client 360) + new
│   │   │   ├── financeiro/    # FIN (contas a receber/pagar) — ADMIN-only
│   │   │   ├── comercial/ pipeline/  # CRM / CAP
│   │   │   ├── operacional/ operations/ tasks/ processos/  # Central Operacional (OPE)
│   │   │   ├── anti-churn/ check-ins/ juridico/ reports/    # CSX / WAR
│   │   │   └── ...            # agency, alerts, managers, team, settings, etc.
│   │   │
│   │   ├── actions/           # 27 Server Actions — MUTAÇÃO (auth+papel+posse+AuditLog)
│   │   │   ├── operacional.ts # referência de ouro do padrão de mutação
│   │   │   ├── clients.ts updateClient.ts contracts.ts goals.ts warRoom.ts ...
│   │   │
│   │   └── api/               # 44 route.ts em 17 subdomínios (cron, sync, webhooks, ...)
│   │
│   ├── lib/                   # núcleo transversal
│   │   ├── dal.ts             # DAL de LEITURA (~3.5k linhas, 52 exports, guard de auth+posse)
│   │   ├── session.ts         # JWT httpOnly (jose), fail-closed sem SESSION_SECRET
│   │   ├── audit.ts           # writeAuditLog + assertClientMutationAccess (RBAC+posse)
│   │   ├── auth.ts prisma.ts  # helpers de auth · singleton Prisma
│   │   ├── health.ts benchmarks.ts knowledge-search.ts pops-catalog.ts
│   │   └── whatsapp.ts toast.ts utils.ts
│   │
│   ├── services/             # 29 serviços — INTEGRAÇÕES + AUTOMAÇÕES (crons)
│   │   ├── meta-ads/ google-ads/ ga4/ nuvemshop/ asaas/ windsor/ zapi/ evolution/ notifications/
│   │   ├── health-scorer.ts churn-scorer.ts antichurn-monitor.ts budget-monitor.ts
│   │   ├── warroom-monitor.ts inadimplencia-checker.ts contract-expiry-checker.ts
│   │   ├── weekly-report-generator.ts weekly-checklist-generator.ts recurrence-engine.ts
│   │   └── alert-dispatcher.ts campaign-insight-generator.ts resultado-engine.ts ...
│   │
│   └── components/           # 108 arquivos por domínio + ui/ + layout/
│       ├── layout/           # Sidebar (RBAC), CommandPalette, DashboardShell, TopNav
│       ├── ui/               # primitivos: Skeleton, ToastViewport, badge, button, card, input, progress
│       └── cockpit/ clients/ financeiro/ comercial/ operacional/ ...
│
└── vercel.json               # 4 crons + maxDuration por família de rota
```

> Dívida conhecida: pastas duplicadas `components/clientes/` (pt) vs `components/clients/` (en);
> áreas mistas `operacional/` vs `operations/`. Ver AUDITORIA §Arquitetura.

---

## 3. Camadas e responsabilidades

| Camada | Onde | Responsabilidade | Regra |
|---|---|---|---|
| **Middleware** | `src/middleware.ts` | Redireciona páginas não autenticadas p/ login. **Não** cobre `/api` (matcher exclui) nem checa papel. | Autenticação de página |
| **Leitura (DAL)** | `src/lib/dal.ts` | Toda leitura de tela. Guard `requireSession`, `canViewAll` (ADMIN/CS) e filtro por `ClientAssignment` (MANAGER/ANALYST). `cache()` por request; `unstable_cache` em 2 pontos. | Regra 1 |
| **Mutação (Actions)** | `src/app/actions/*.ts` | Server Actions. Padrão: `requireSession()` → `assertClientMutationAccess(session, clientId)` → mutação Prisma → `writeAuditLog(...)`. | Regra 2 (auth+papel+posse+log) |
| **RBAC / posse** | `src/lib/audit.ts` | `assertClientMutationAccess`: ADMIN livre · CS só com `allowCS` · MANAGER só cliente atribuído · ANALYST nunca muta. `writeAuditLog` append-only, nunca lança. | Regras 2, 3, 8 |
| **Sessão** | `src/lib/session.ts` | Emite/verifica JWT HS256 com `SESSION_SECRET`. Fail-closed se env ausente. | Regra 4 |
| **Persistência** | `src/lib/prisma.ts` → PostgreSQL/Neon | Singleton Prisma. Fonte da verdade canônica. | — |
| **Integrações / cron** | `src/services/*`, `src/app/api/cron/*` | Chamadas externas com timeout; try/catch por cliente; `SyncLog`/`lastRunAt`. Auth de cron via `CRON_SECRET`. | Regras 6, 7, 9 |

**Bordas de API** (não cobertas pelo middleware) protegem-se individualmente:
webhooks financeiros `asaas/webhook` e `nuvemshop/webhooks` são **fail-closed** (token / HMAC SHA-256, 503 sem secret);
crons exigem `CRON_SECRET` (Bearer ou `x-cron-secret`); financeiro/contratos são ADMIN-only.

---

## 4. Fluxo de dados

```
request
  │
  ▼
middleware.ts ── página protegida? sem sessão → /login
  │ (rotas /api NÃO passam aqui — cada handler checa sessão/segredo)
  ▼
Server Component (page.tsx em (dashboard)/…)
  │
  ├── LEITURA ──► src/lib/dal.ts ──► requireSession + canViewAll/assignment ──► prisma ──► PostgreSQL/Neon
  │
  └── MUTAÇÃO ──► src/app/actions/*.ts ──► requireSession
                     └► assertClientMutationAccess (papel + posse)  [src/lib/audit.ts]
                     └► prisma.$transaction (mutação)
                     └► writeAuditLog  ──► AuditLog (append-only)
                     └► return { ok } | { error }

  cron / webhook / sync (fora do request de página)
      api/cron/* ──(CRON_SECRET)──► src/services/*  ──► integrações externas (timeout)
                                        └► prisma (MetricSnapshot, Alert, SyncLog, lastRunAt)
```

Direção geral: as **integrações externas escrevem no PostgreSQL** (fonte da verdade);
as **telas leem do PostgreSQL** via DAL. O ClickUp não é sistema central.

---

## 5. Mapa de rotas

### 5.1 Páginas (34) por área

| Área | Rotas (`src/app/(dashboard)/…` salvo login) |
|---|---|
| Auth | `(auth)/login` |
| Home / visão geral | `/` (redirect) · `dashboard` · `cockpit` · `agency` · `agency/metas` |
| Clientes (Client 360) | `clients` · `clients/[slug]` · `clients/new` |
| Comercial / CRM (CAP) | `comercial` · `comercial/dashboard` · `pipeline` |
| Operação de tráfego (OPE) | `operacional` · `operations` · `tasks` · `processos` · `canais` |
| Sucesso do cliente (CSX) | `anti-churn` · `check-ins` · `reports` |
| War Room / crítico (WAR) | `alerts` · `validacoes` · `aceite` |
| Financeiro (FIN) | `financeiro` · `juridico` |
| Time / gestão | `managers` · `managers/assignments` · `team` |
| Meu trabalho | `meu-dia` · `minha-semana` |
| IA / conhecimento | `ai-agents` · `knowledge` |
| Config | `settings` |

### 5.2 API routes (44) por grupo

| Grupo | Rotas | Proteção |
|---|---|---|
| `cron/*` | `daily`, `digest`, `recurrences`, `resultados` | `CRON_SECRET` (fail-closed) |
| `sync/*` | `ga4`, `google-ads`, `meta`, `nuvemshop`, `health`, `stream` | sessão ADMIN/MANAGER + posse, ou `x-cron-secret` |
| `webhooks/*` | `whatsapp`, `whatsapp/test` | `client-token` (⚠️ inbound fail-open — AUDITORIA §Integrações) |
| `asaas/*` | `sync`, `webhook` | webhook token `asaas-access-token` fail-closed (503) |
| `nuvemshop/*` | `auth`, `callback`, `install`, `webhooks`, `reconciliation` | webhooks HMAC-SHA256 fail-closed; ⚠️ `callback` state não assinado (IDOR) |
| `financeiro/*` | `summary`, `cashflow`, `expenses`, `expenses/[id]` | ADMIN-only |
| `comercial/*` | `leads`, `leads/[id]`, `leads/[id]/convert`, `activities` | sessão (⚠️ mutação sem checagem de papel) |
| `whatsapp/*` | `groups`, `test-digest` | sessão |
| `admin/*` | `contract-fee`, `knowledge`, `knowledge/[id]`, `knowledge/upload`, `seed-contracts`, `trigger-digest` | ADMIN / `x-seed-secret` |
| `ai/*` | `chat`, `clients`, `dashboard-chat` | sessão |
| `settings/*` | `asaas`, `whatsapp` | ADMIN (chave mascarada na resposta) |
| `clients/*` | `[clientId]/budget` | sessão + posse |
| `leads/*` | `capture` | público por design (⚠️ CORS `*`, sem rate-limit) |
| Outros | `team/members`, `seed` | sessão / `SEED_SECRET` |

---

## 6. Diagrama textual do fluxo (ASCII)

```
                         ┌──────────────────────────────────────────────┐
                         │                  NAVEGADOR                     │
                         └───────────────┬──────────────────────────────┘
                                         │ HTTP
                    ┌────────────────────▼─────────────────────┐
                    │            middleware.ts                  │
                    │  (só páginas; /api excluído do matcher)   │
                    └───────┬──────────────────────┬────────────┘
                            │ página               │ /api/*
                            ▼                      ▼
              ┌──────────────────────┐   ┌───────────────────────────┐
              │  Server Component     │   │  route.ts handler          │
              │  (dashboard)/*/page   │   │  getSession()/CRON_SECRET/ │
              │                       │   │  webhook token/HMAC        │
              └───┬──────────────┬────┘   └───────────┬───────────────┘
                  │ leitura      │ mutação            │
                  ▼              ▼                    ▼
          ┌────────────┐  ┌──────────────┐   ┌──────────────────────┐
          │  lib/dal.ts│  │ app/actions/*│   │  services/* (cron/    │
          │  auth+posse│  │ auth+papel+  │   │  sync/webhook)        │
          │            │  │ posse+audit  │   │  timeout+try/catch    │
          └─────┬──────┘  └──────┬───────┘   └──────────┬───────────┘
                │                │                       │  ▲
                │                │  writeAuditLog        │  │ integrações externas
                ▼                ▼         │             ▼  │ (Meta/Google/GA4/
          ┌─────────────────────────────────────────────┐  │  Nuvemshop/Asaas/
          │        prisma  (lib/prisma.ts, singleton)     │  │  Z-API/Evolution/
          │              PostgreSQL / Neon                │──┘  Windsor/Anthropic)
          │           FONTE ÚNICA DA VERDADE              │
          └───────────────────────────────────────────────┘
```

---

## 7. Camada de integrações e direção de sync

Todas as chamadas externas têm **timeout** (`AbortSignal.timeout`, 25–30s). Config via
`IntegrationSetting` (chaves dinâmicas) onde já migrado; caso contrário env var.

| Integração | Finalidade | Arquivos | Config | Direção |
|---|---|---|---|---|
| **Meta Ads** | Insights conta/campanha → `MetricSnapshot` | `services/meta-ads/*`, `api/sync/meta` | env (`META_SYSTEM_TOKEN`) | externa → Performli |
| **Google Ads** | Métricas por campanha → `MetricSnapshot` | `services/google-ads/*`, `api/sync/google-ads` | env (SA JWT + dev token) | externa → Performli |
| **GA4** | Métricas diárias → `MetricSnapshot` (`purchaseRevenue`) | `services/ga4/*`, `api/sync/ga4` | env (Service Account JWT) | externa → Performli |
| **Nuvemshop** | Pedidos e-commerce → `NuvemshopOrder` + `MetricSnapshot` | `services/nuvemshop/*`, `api/nuvemshop/*`, `api/sync/nuvemshop` | env (OAuth por loja) | externa → Performli (webhook HMAC) |
| **Asaas** | Financeiro: entradas → `AsaasPayment`; saídas DEBIT → `Expense` | `services/asaas/*`, `api/asaas/*` | IntegrationSetting (fallback env) | externa → Performli (webhook token) |
| **Z-API** | WhatsApp: envio, QR, status + inbound → lead | `services/zapi/*`, `lib/whatsapp.ts`, `api/webhooks/whatsapp` | IntegrationSetting (`ZAPI_*`) | bidirecional |
| **Evolution** | WhatsApp alternativo (envio/QR/webhook) | `services/evolution/*` | IntegrationSetting (`EVOLUTION_*`) | bidirecional |
| **Windsor** | GA4 legado (connector) | `services/windsor/*` | env (`WINDSOR_API_KEY`) | externa → Performli |
| **Anthropic (Claude)** | Relatórios, insights, copiloto, RAG | `services/*-generator.ts`, `actions/planoAcao.ts`, `api/ai/*` | env (`ANTHROPIC_API_KEY`) | Performli → LLM |
| **ClickUp** | Referência residual (transição) | 2 refs incidentais | — | desacoplado (exit strategy quase completa) |

Resiliência: sync por conta grava `SyncLog RUNNING→SUCCESS/FAILED`, cria alerta `SYNC_FAILED`
e auto-dismiss em sucesso; falha de uma conta não derruba as demais (`Promise.allSettled` no Asaas).

---

> Este mapa reflete o estado auditado em 2026-07-01. Travas conhecidas (webhook WhatsApp fail-open,
> callback Nuvemshop com state não assinado, mutações legadas sem posse em `tasks.ts`/`operations.ts`,
> ausência de testes/CI e de `error.tsx`) estão detalhadas em `AUDITORIA_SISTEMA.md`.
