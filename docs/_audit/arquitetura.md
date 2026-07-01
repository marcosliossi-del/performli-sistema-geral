# Auditoria — Arquitetura

## Arquitetura

### (a) Como está organizado

Next.js 16 App Router com dois route groups:

- `src/app/(auth)/login` — tela pública de login.
- `src/app/(dashboard)/*` — ~30 telas operacionais (cockpit, comercial, financeiro, anti-churn, juridico, war-room via operacional, etc). Layout compartilhado do grupo.
- `src/app/api/*` — 45 route handlers (`cron`, `sync`, `webhooks`, `asaas`, `nuvemshop`, `admin`, `debug`, `seed`, `whatsapp`...).
- `src/app/actions/*` — 27 arquivos de Server Actions (mutações), ~3.175 linhas.

Camadas de dados:

- **Leitura de tela:** `page.tsx` → `src/lib/dal.ts` (monólito de 3.477 linhas, `import 'server-only'`, `requireSession` via `cache()`, `unstable_cache`) → `prisma`.
- **Mutação:** `page/componente` → `src/app/actions/*.ts` → `prisma`. As actions usam `requireSession` (88 ocorrências) e há verificação de posse em ~15 arquivos.
- **Rotinas:** `src/app/api/cron/*` → `src/services/*` (~30 serviços) → `prisma`.
- **Serviços de integração:** `src/services/{meta-ads,google-ads,ga4,nuvemshop,asaas,evolution,zapi,windsor,notifications}` (subpastas) + monitores/engines soltos (`health-scorer.ts`, `churn-scorer.ts`, `recurrence-engine.ts`, etc). 29 serviços importam `prisma`.
- `src/lib/*` — utilidades transversais: `auth.ts`, `session.ts`, `dal.ts`, `audit.ts`, `prisma.ts`, `knowledge-search.ts`, `whatsapp.ts`, `email.ts`.
- `src/components/*` — por domínio de tela (agency, cockpit, comercial, financeiro, ...) + `ui/` (Radix/shadcn).
- `src/middleware.ts` — guarda de borda por prefixo de rota (JWT `jose`), protege todos os prefixos do dashboard.

**Fonte da verdade:** PostgreSQL, conforme diretriz. Sync de plataformas escreve em `MetricSnapshot`/`CampaignSnapshot`; estado canônico vive no banco.

### (b) Pontos fortes

- Separação clara leitura (DAL) × mutação (actions) × rotina (services), com `server-only` na DAL.
- Middleware cobre todos os prefixos do `(dashboard)`; nenhum endpoint de dashboard fica sem guarda de borda.
- ClickUp praticamente **desacoplado**: só aparece como rótulo de UI (`JuridicoPageTabs.tsx:77`) e num seed one-off (`api/admin/seed-contracts/route.ts`). Não há SDK/cliente ClickUp no runtime — alinhado à exit strategy.
- Serviços de integração isolados em subpastas por provedor (client + sync separados).
- Crons declarados em `vercel.json` com `maxDuration` e `CRON_SECRET` (Bearer + `x-cron-secret`) em `api/cron/daily/route.ts:35-40`.
- Seed e debug protegidos (`api/seed/route.ts:6` por `SEED_SECRET`; `api/debug/ga4/route.ts:11` por ADMIN).

### (c) Riscos / dívidas por severidade

**ALTO**

- **Loop de cron sem try/catch por cliente.** `src/services/health-scorer.ts:477` — `recalculateAllClientsHealth` faz `for (const client...) await recalculateClientHealth(...)` sem try/catch. Um cliente com dado corrompido derruba o passo inteiro (viola regra 7). O `cron/daily/route.ts` embrulha cada *passo*, não cada cliente. Verificar mesmo padrão nos demais `*-monitor`/`*-scorer`.
- **Página com Prisma direto e sem `requireSession`.** `src/app/(dashboard)/comercial/page.tsx:3,11` importa `@/lib/prisma` e consulta direto, sem chamada de sessão na page (depende só do middleware). Sem guarda em profundidade e fora da DAL; RBAC de posse não é aplicado a leads.

**MÉDIO**

- **Bypass da DAL em telas.** 9 páginas do `(dashboard)` importam `@/lib/prisma` direto (`juridico`, `anti-churn`, `financeiro` com 18 queries inline, `clients`, `alerts`, `agency/metas`, `comercial`x2). Viola regra 1 e espalha lógica de leitura/serialização fora da camada única.
- **DAL monolítica.** `src/lib/dal.ts` com 3.477 linhas concentra toda leitura — ponto de contenção de manutenção/merge e risco de import acidental de lógica de mutação.
- **`src/components/clientes/` vs `src/components/clients/`.** Duas pastas para o mesmo domínio (pt/en) — inconsistência de convenção que gera ambiguidade de import.
- **Nomenclatura de rotas mista pt/en** (`operacional` + `operations`, `check-ins` + telas em inglês, `comercial` + `pipeline`). Aumenta risco de telas duplicadas/órfãs.

**BAIXO**

- Endpoint `api/debug/ga4` marcado "remover após diagnóstico" ainda presente — dívida a limpar.
- `lastRunAt`/`SyncLog` referenciados em apenas ~5 serviços; verificar se todas as rotinas recorrentes registram última execução (regra 9).

### 🔒 Travas / Fluidez

- **Trava dura (bloqueia refactor):** DAL de 3.477 linhas e 9 telas com Prisma inline — mover leitura para a DAL exige tocar muitas telas ao mesmo tempo; fazer por fatia vertical.
- **Trava de segurança:** `comercial/page.tsx` sem `requireSession` e sem filtro de posse — qualquer papel autenticado vê todos os leads. Corrigir antes de novas features comerciais.
- **Trava de robustez:** ausência de try/catch por cliente nos loops de scoring — falha silenciosa exatamente no tipo de rotina que o Performli deveria blindar.
- **Fluidez (baixo atrito):** ClickUp já desacoplado; nenhum trabalho de "desligamento" pendente na camada de arquitetura. Serviços por provedor bem isolados facilitam adicionar/remover integrações.
- **Fluidez:** padrão de crons (secret + maxDuration + passos embrulhados) já estabelecido — novas rotinas seguem o molde sem redesenho.
