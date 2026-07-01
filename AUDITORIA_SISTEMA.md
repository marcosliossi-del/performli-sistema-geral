# Auditoria do Sistema — Performli

> Auditoria técnica completa gerada como **corretor de travas** (fan-out por 10 dimensões, read-only).
> Data: 2026-07-01 · Escopo: 34 páginas, ~44 API routes, 27 arquivos de actions, ~30 serviços, 64 models Prisma, ~41k LOC.
> As seções detalhadas por dimensão estão no fim deste documento. Detalhamento por arquivo em `docs/_audit/*.md`.

---

## Sumário executivo

O Performli é um sistema robusto e coeso: arquitetura em camadas clara (page → DAL/actions → Prisma → integrações),
design system iOS consistente, crons novos (recurrence/resultado) idempotentes e exemplares, e **ClickUp já praticamente
desacoplado** (só rótulo de UI + seed one-off) — não há dívida de arquitetura para o desligamento futuro.

Os riscos concentram-se em quatro frentes, todas endereçáveis por fatias verticais pequenas:

1. **Posse (ownership) em mutações** — o helper `assertClientMutationAccess` existe e é correto, mas várias mutações
   client-scoped usam apenas `requireSession()`, sem checar papel/posse (viola a regra inegociável nº 2).
2. **Bordas externas** — vários clients de integração sem timeout (regra nº 6) e webhooks *fail-open*
   (só validam assinatura se o segredo estiver setado).
3. **Resiliência de cron** — loops "all" em vários scorers/monitores sem `try/catch` por cliente (regra nº 7).
4. **Fluidez percebida** — `force-dynamic` global + 25 rotas sem `loading.tsx` + `unstable_cache` subutilizado
   fazem o cold-start do Neon aparecer como tela travada.

## Travas priorizadas (consolidado das 10 dimensões)

Legenda risco = risco de regressão ao aplicar a correção.

### 🔴 Crítico / Alto — segurança e regras inegociáveis

| # | Trava | Arquivo(s) | Correção | Risco |
|---|-------|-----------|----------|-------|
| 1 | Mutações client-scoped sem papel/posse | `actions/updateClient.ts`, `interactions.ts`, `contracts.ts`, `protocols.ts`, `tasks.ts`, `goals.ts`, `api/clients/[clientId]/budget/route.ts` | inserir `assertClientMutationAccess(session, clientId)` + `writeAuditLog` | médio-alto |
| 2 | Webhooks *fail-open* (validam só se secret existe) | `api/asaas/webhook`, `api/webhooks/whatsapp`, `api/nuvemshop/webhooks` | *fail-closed*: rejeitar 401 quando o segredo de produção estiver ausente | baixo-médio |
| 3 | Timeout ausente em clients externos | `services/{evolution,zapi,ga4,google-ads,nuvemshop,meta-ads}/client.ts` | envolver `fetch` em `AbortSignal.timeout()` (padrão já usado em asaas/meta/windsor) | baixo-médio |
| 4 | Loops de cron sem `try/catch` por cliente | `services/health-scorer.ts` (+churn-scorer, oscillation-detector, budget-monitor, critical-account-detector, contract-expiry-checker, weekly-report-generator, weekly-checklist-generator) | envolver corpo do loop por item, acumulando erros no summary sem abortar | médio |
| 5 | Página `/comercial` sem `requireSession`/posse | `app/(dashboard)/comercial/page.tsx` | mover leitura para DAL com `requireSession` + filtro RBAC | alto |
| 6 | `nuvemshop/install` público cria Client sem sessão | `api/nuvemshop/install/route.ts` | exigir auth ou validar `state` assinado | alto |
| 7 | `force-dynamic` global força cold-start em todo request | `app/(dashboard)/layout.tsx` | remover do layout; aplicar seletivo / `unstable_cache` | alto |

### 🟠 Médio — robustez e observabilidade

| # | Trava | Arquivo(s) | Correção | Risco |
|---|-------|-----------|----------|-------|
| 8 | Model IDs de IA possivelmente inválidos | `api/ai/chat/route.ts`, `services/weekly-report-generator.ts` | validar/atualizar para aliases suportados; centralizar cliente Anthropic | baixo |
| 9 | Anthropic sem timeout central | `services/weekly-report-generator.ts`, `actions/insights.ts` | `src/lib/anthropic.ts` com `timeout`+`maxRetries` | baixo |
| 10 | Alertas criados sem AuditLog | `services/{critical-account-detector,budget-monitor,contract-expiry-checker}.ts` | `writeAuditLog` junto da criação do Alert | baixo |
| 11 | `daily` não persiste `lastRunAt`/SyncLog | `api/cron/daily/route.ts` | gravar SyncLog/AutomationLog com `lastRunAt` | baixo |
| 12 | `getClientChat` faz upsert no render | `lib/dal.ts` | criar canal on-demand fora do fetch da página | baixo |
| 13 | `unstable_cache` subutilizado nas queries quentes | `lib/dal.ts` | envolver `getClientKPIs`/history/pace/managerStats com revalidate ~60s | médio |
| 14 | `Task.assignedTo` onDelete Cascade apaga histórico | `prisma/schema.prisma` | Cascade→SetNull (coluna nullable) | médio |

### 🟢 Baixo — fluidez segura (aplicar sem cerimônia)

| # | Trava | Arquivo(s) | Correção | Risco |
|---|-------|-----------|----------|-------|
| 15 | 25 rotas sem `loading.tsx` | `app/(dashboard)/*/` | plugar `PageSkeleton` existente | baixo |
| 16 | Índices de DB faltando (aditivos) | `prisma/schema.prisma` (SyncLog, Client.status/pipelineStage, AgencyLead.status+deletedAt) | `@@index` via migration `CREATE INDEX IF NOT EXISTS` | baixo |
| 17 | Estados vazios sem CTA de próxima ação | `managers`, `team`, `operations` pages | componente `EmptyState` (título + porquê + ação) | baixo |
| 18 | Erros técnicos crus na UI | `components/operacional/TaskDrawer.tsx` | `humanizeError()` → mensagem operacional | baixo |
| 19 | `seed`/`debug` expostos em produção | `api/seed/route.ts`, `api/debug/ga4/route.ts` | guard `NODE_ENV !== 'production'` → 404 | baixo |
| 20 | Acessibilidade: aria-label/aria-live ausentes | `components/**`, `ToastViewport.tsx` | adicionar `aria-label` em botões ícone-only e `aria-live=polite` no toast | baixo |
| 21 | `LastUpdatedBadge` só no Cockpit (regra 10) | `components/cockpit/LastUpdatedBadge.tsx` | generalizar para client 360/reports/financeiro | baixo |
| 22 | Sem testes nem CI | `package.json`, `.github/workflows` | Vitest + 1 teste de fumaça de auth/posse + workflow `lint+build+test` | baixo |
| 23 | README de setup ausente | `README.md`, `PROJECT_STATE.md` | seção "Rodar o app" (env, migrate, seed, dev) | baixo |
| 24 | Pastas duplicadas `clientes/` vs `clients/` | `components/` | consolidar convenção `clients` | baixo |

---

## Seções detalhadas por dimensão


## Stack & Dependências

Auditoria read-only da dimensão Stack & Dependências do PERFORMLI. Data: 2026-07-01.

### (a) O que existe e como funciona

- **`package.json`** — App Next.js 16 (`next@16.2.1`, `react@19.2.4`), Prisma 7 (`prisma`/`@prisma/client`/`@prisma/adapter-pg@^7.5.0`, driver `pg@^8.20.0`), Tailwind v4 (`tailwindcss@^4`, `@tailwindcss/postcss@^4`), auth JWT via `jose@^6.2.2` + `bcryptjs@^3.0.3`, IA via `@anthropic-ai/sdk@^0.80.0`, e-mail via `resend@^6.9.4`, UI Radix + `lucide-react` + `recharts@^3.8.0` + `@hello-pangea/dnd`. PDF via `pdf-parse@^2.4.5`.
- **Build script** (`package.json:7`): `prisma generate && npm run migrate:deploy && next build`. `migrate:deploy` (`package.json:8`) roda `prisma migrate deploy` com 2 retries (12s / 25s) para cold-start do banco Neon — resiliência boa.
- **`next.config.ts`** — `compress`, `poweredByHeader:false`, e `optimizePackageImports` para `lucide-react` e `@anthropic-ai/sdk`. Minimalista.
- **`tsconfig.json`** — `strict:true`, `moduleResolution:"bundler"`, `target:ES2017`, path alias `@/*`. Correto para Next 16.
- **`vercel.json`** — 4 crons (daily 11h, digest 11h30, recurrences 10h, resultados seg 9h) e `maxDuration` por rota (sync/cron 300s, nuvemshop 60s, knowledge 120s). Alinhado à regra de cron do CLAUDE.md.
- **`prisma.config.ts`** — schema/migrations/seed padrão, datasource via `DATABASE_URL`.
- **`eslint.config.mjs`** — flat config com `eslint-config-next` core-web-vitals + typescript.
- **`postcss.config.mjs`** — apenas `@tailwindcss/postcss` (padrão Tailwind v4, sem `autoprefixer` explícito, correto na v4).
- **`@anthropic-ai/sdk`** — instanciado em 7 pontos (`src/app/api/ai/chat/route.ts:8`, `dashboard-chat/route.ts:5`, `knowledge/upload/route.ts:9`, `src/services/weekly-report-generator.ts:16`, `campaign-insight-generator.ts:18`, `src/app/actions/planoAcao.ts:8`, `insights.ts:7`).

### (b) Pontos fortes

- Versões modernas e coerentes entre si (Next 16 + React 19 + eslint-config-next 16.2.1 casados).
- `prisma generate` no build evita client desatualizado no deploy; retries de migrate mitigam cold-start Neon.
- `maxDuration` por rota respeita limites de serverless para syncs/crons longos.
- `strict` TS ligado; `server-only` presente para proteger código server.
- `next.config.ts` enxuto, sem `ignoreBuildErrors`/`eslint.ignoreDuringBuilds` (build falha de verdade se houver erro — bom para o gate CI Vercel).

### (c) Riscos / Dívidas

**Crítico**
- **Model ID de IA provavelmente inválido — quebra em runtime.** `model: 'claude-sonnet-4-6'` em `src/app/api/ai/chat/route.ts:158` e `src/services/weekly-report-generator.ts:325,555,786,916`. Não existe modelo `claude-sonnet-4-6` no catálogo Anthropic (os válidos são `claude-sonnet-4-5` / `claude-sonnet-4-20250514` etc.). Toda chamada a esses fluxos (chat IA, relatório semanal) retorna 404 `not_found_error` da API. Falha silenciosa que só aparece quando o usuário aciona a feature. Verificar também `claude-haiku-4-5-20251001` (data-suffix suspeito; o alias estável é `claude-haiku-4-5`).

**Alto**
- **Clientes Anthropic sem `timeout` — viola regra técnica 6 do CLAUDE.md.** Todas as 7 instâncias (`new Anthropic()` / `new Anthropic({ apiKey })`) não passam `timeout` nem `maxRetries`. "Toda chamada externa tem timeout" é inegociável. Uma chamada travada pode consumir os 300s de `maxDuration` do cron e derrubar a rotina.
- **`apiKey` inconsistente entre instâncias.** Algumas usam `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` (chat/dashboard/upload) e outras `new Anthropic()` sem apiKey explícita (`weekly-report-generator.ts:16`, `campaign-insight-generator.ts:18`, `planoAcao.ts:8`, `insights.ts:7`), dependendo do fallback implícito para `ANTHROPIC_API_KEY`. Funciona, mas frágil — se a env mudar de nome, metade quebra e metade não.

**Médio**
- **`next-auth@^5.0.0-beta.30` como dependência de produção, aparentemente não usado.** `next-auth` só aparece em `package.json`; a auth real usa `jose` (`src/middleware.ts`, `src/lib/session.ts`). Dependência beta pesada e sem uso aumenta superfície de risco/tamanho de bundle. Confirmar e remover se órfã.
- **Dependência em versão beta em produção.** `next-auth@5.0.0-beta.30` é beta; se de fato for usada em algum ponto, é risco de breaking change num `beta`.
- **`@types/*` como dependencies (não devDependencies).** `@types/bcryptjs`, `@types/pg`, `@types/pdf-parse` estão em `dependencies` (`package.json:32-33,55` — pdf-parse está em dev). Types não são runtime; pertencem a devDependencies. Impacto baixo (Vercel instala tudo), mas polui o grafo de produção.

**Baixo**
- **Ranges `^` em libs críticas.** `next` e `react` estão pinados exatos (bom), mas Prisma/pg/anthropic usam `^`. Com build que roda `prisma generate` + `migrate deploy` sem lockfile determinístico garantido, um minor de Prisma pode alterar comportamento. Existe `package-lock.json` — verificar se Vercel usa `npm ci` (respeita lock) e não `npm install`.
- **`@anthropic-ai/sdk@^0.80.0`** — SDK pré-1.0, minors podem trazer breaking changes; range `^` só protege até o próximo major (não existe major aqui). Pinar.
- **Sem `engines` no `package.json`.** Node do Vercel não está fixado; um bump de Node default do Vercel pode mudar comportamento sem aviso.
- **Sem `autoprefixer` / browserslist explícito** — aceitável no Tailwind v4, mas documentar alvo de browsers seria bom.

### 🔒 Travas / Fluidez

Melhorias concretas de baixo risco (ordenadas por retorno):

1. **Corrigir os model IDs de IA** (`chat/route.ts:158`, `weekly-report-generator.ts:325,555,786,916`): trocar `claude-sonnet-4-6` por um alias válido (`claude-sonnet-4-5`) e validar `claude-haiku-4-5-20251001`. Trava contra quebra silenciosa das features de IA. Baixo risco, alto impacto.
2. **Centralizar a criação do cliente Anthropic** num único módulo `src/lib/anthropic.ts` que exporte `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 })`, e importar nos 7 pontos. Elimina a inconsistência de apiKey e cumpre a regra de timeout de uma vez.
3. **Adicionar `engines.node`** ao `package.json` (ex.: `"node": ">=20"`) para travar a versão de runtime no Vercel.
4. **Remover `next-auth`** se confirmado órfão (grep mostra uso zero fora do package.json) — reduz bundle e superfície beta.
5. **Mover `@types/*` para `devDependencies`** — higiene do grafo de produção.
6. **Pinar `@anthropic-ai/sdk`** em versão exata (SDK <1.0) e garantir `npm ci` no deploy (respeita `package-lock.json`).


---

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


---

## Frontend & UX

Auditoria read-only da dimensão Frontend & UX do PERFORMLI. Foco: 34 páginas em
`src/app/(dashboard)`, componentes em `src/components`, design system em
`globals.css`, Sidebar, CommandPalette, toasts, skeletons, estados vazios,
aderência às 6 perguntas de UX e acessibilidade básica.

### (a) O que existe

- **Design system coeso (`src/app/globals.css`).** Tokens Arkza (ciano-petróleo,
  vidro/glass, sombras, molas). Layer de OVERRIDES remapeia dezenas de cores hex
  legadas (`#95BBE2`, `#38435C`, etc.) para a nova paleta sem editar cada tela —
  retematização central inteligente. Classes utilitárias `.card`, `.ak-glass`,
  `.ak-lift`, `.ak-skeleton`, `.ak-drawer`, badges de status.
- **Cockpit exemplar (`src/app/(dashboard)/cockpit/page.tsx`).** Cada
  `OperationalCard` responde às 6 perguntas: título (o que/o que está errado),
  `why`, `responsible`, `deadline`, `impact` ("Se não agir: …"), `action` (CTA).
  Blocos pendentes mostrados com transparência ("aguardando ONB-04").
- **`OperationalCard` (`src/components/cockpit/OperationalCard.tsx`)** — padrão
  reutilizável das 6 perguntas com severidade (critical/warning/ok/neutral) e
  borda esquerda colorida.
- **`LastUpdatedBadge` (`src/components/cockpit/LastUpdatedBadge.tsx`)** —
  cumpre a regra 10 (data/hora da última atualização; fica vermelho se stale).
- **Sidebar (`src/components/layout/Sidebar.tsx`)** — nav-tree com RBAC por
  seção/item, badges de pendência (contadores), grupos expansíveis, indicador
  de item ativo, "Sistema online".
- **CommandPalette (`src/components/layout/CommandPalette.tsx`)** — busca global
  com debounce, navegação por teclado (↑↓/Enter/Esc), agrupamento, foco no
  input ao abrir.
- **Toasts (`src/lib/toast.ts` + `ToastViewport.tsx`)** — pub/sub sem lib,
  3 tons (ok/err/info), auto-dismiss 3.2s.
- **Skeletons (`src/components/ui/Skeleton.tsx`)** — `PageSkeleton` (título +
  KPIs + tabela) reutilizável; shimmer via `.ak-skeleton`.
- **Foco visível global** — `a/button/[role=button]:focus-visible` com outline
  ciano em `globals.css:301`; `prefers-reduced-motion` respeitado (`:136`).

### (b) Pontos fortes

1. **Cockpit e `OperationalCard` são referência de UX operacional** — 6 perguntas
   respondidas por card, linguagem de negócio, CTA com destino.
2. **Retematização central via overrides** — mudar paleta em 1 arquivo, sem
   tocar 105 componentes.
3. **Freshness tratada como cidadã de primeira classe** no Cockpit
   (`LastUpdatedBadge`), inclusive estado "Sem registro de sincronização".
4. **Estados vazios majoritariamente operacionais** — ex.: "Nenhum processo
   crítico quebrando agora." (verde), "Nenhum cliente em status Ruim esta
   semana.", "Nenhuma mensagem ainda — abra o canal para iniciar o alinhamento."
5. **RBAC no próprio menu** — itens/seções filtrados por papel, sem vazar rota.
6. **`prefers-reduced-motion` e foco-visível** já contemplados no CSS base.

### (c) Riscos / inconsistências por severidade

**ALTA**
- **Cobertura de `loading.tsx` baixíssima: 6 de ~34 rotas.** 25 rotas sem
  skeleton (`aceite`, `alerts`, `anti-churn`, `check-ins`, `clients/[slug]`,
  `pipeline`, `processos`, `reports`, `tasks`, `validacoes`, `agency`, …). Como
  as páginas são `force-dynamic`/server async, o usuário vê tela em branco
  durante o fetch. `PageSkeleton` já existe — falta plugar.
- **Modais/drawers sem `role="dialog"`, sem focus-trap e (na maioria) sem Esc.**
  `grep` por `role="dialog"`/focus-trap = 0 resultados. `TaskDrawer.tsx`,
  `TaskFormModal.tsx`, `ClientChatPanel`, drawers de anti-churn abrem sem
  aprisionar o foco nem devolver o foco ao fechar; leitor de tela e teclado
  ficam presos no fundo. (CommandPalette é a exceção que trata Esc.)

**MÉDIA**
- **Aria/roles quase ausentes:** apenas ~6 arquivos em todo `src/` usam `aria-*`
  ou `role=`. Botões ícone-only (X de fechar, chevrons, ações de linha) sem
  `aria-label` — só `InteractionTimeline.tsx` usa. Impacto de acessibilidade em
  ações críticas (fechar drawer, aprovar/reprovar).
- **Estados vazios sem CTA de próxima ação.** Muitos são frases corretas mas
  "becos sem saída": `managers/page.tsx:109` "Nenhum gestor com clientes
  ativos", `team/page.tsx:49` "Nenhum membro cadastrado",
  `operations/page.tsx:83` "Nenhuma operação encontrada" — não dizem *o que
  fazer agora* (pergunta 3 das 6). Contraste: canais faz certo.
- **Mensagens de erro técnicas expostas ao usuário.** `TaskDrawer.tsx` e
  vários componentes fazem `setActionError(r.error)` + `toast(r.error,'err')`,
  renderizando a string crua do backend (`actionError` em vermelho). Viola
  "linguagem operacional, nunca técnica" — precisa mapear para mensagem com
  porquê/ação.
- **Badge "Sem dados" genérico** em `clients/[slug]/page.tsx:546,606` e
  `MetricsChartsGrid` — sem explicar o porquê (sincronizar? plataforma
  desconectada?). Em `:414` a versão boa existe ("Sincronize as plataformas
  para ver os KPIs") e deveria ser o padrão.
- **`LastUpdatedBadge` só no Cockpit.** Regra 10 (toda tela com dado crítico
  mostra última atualização) não é seguida em `clients/[slug]`, `reports`,
  `financeiro`, `anti-churn`, `dashboard` de forma consistente (freshness
  aparece ad-hoc em ~5 páginas).

**BAIXA**
- **Toast usado em só 4 arquivos** — mutações em muitas telas não dão feedback
  de sucesso/erro visível (só o `actionError` inline). Inconsistência de padrão.
- **Cores hex hardcoded nas telas** (`text-[#EBEBEB]`, `text-[#87919E]`) em vez
  de tokens semânticos (`text-foreground`/`text-muted`). Funciona pelos
  overrides, mas qualquer cor nova exige adicionar override — dívida de token.
- **Toasts sem `aria-live`** — mudanças não anunciadas a leitores de tela.
- **`animate-pulse` no dot "Sistema online"** (Sidebar:199) é decorativo e
  compete com o pulso do crítico (`.ak-pulse`) — ruído visual.

### 🔒 Travas / Fluidez

Melhorias concretas de fluidez, ordenadas por impacto/esforço:

1. **Plugar `loading.tsx` nas ~25 rotas sem skeleton.** Reutilizar
   `PageSkeleton` (variar `kpis`/`rows`). Elimina flash de tela branca em
   páginas server async. Baixo risco, alto ganho percebido.
2. **Componente `EmptyState` com CTA obrigatório.** Props: ícone, título
   operacional, subtítulo (o porquê), ação (label+href). Substituir os "Nenhum
   X" secos por versões acionáveis (ex.: "Nenhum gestor com clientes ativos →
   Atribuir clientes"). Fecha a pergunta 3 nas telas de lista.
3. **Mapear erros de backend para mensagem operacional.** Criar
   `humanizeError(code)` e trocar `toast(r.error,'err')`/`setActionError(r.error)`
   por texto com porquê + próximo passo. Remove strings técnicas da UI.
4. **Acessibilidade de modais/drawers.** Wrapper `Dialog` com `role="dialog"`,
   `aria-modal`, focus-trap, Esc para fechar e devolução de foco ao gatilho.
   Aplicar em `TaskDrawer`, `TaskFormModal`, `ClientChatPanel`, drawers de
   anti-churn.
5. **`aria-label` em botões ícone-only** (fechar, chevrons, aprovar/reprovar) e
   `aria-live="polite"` no `ToastViewport`.
6. **Generalizar `LastUpdatedBadge`** para toda tela com dado sincronizado
   (client 360, reports, financeiro, anti-churn) — padroniza a regra 10.
7. **Padronizar "Sem dados" → "Sincronize as plataformas para ver…"** com link
   para a tela de integrações, em vez do badge mudo.
8. **Migrar hex → tokens semânticos** (`text-foreground`, `text-muted`,
   `border-hair`) gradualmente, reduzindo a dependência do layer de overrides.


---

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


---

## Banco de Dados

Auditoria da dimensão de dados do PERFORMLI. Base: `prisma/schema.prisma` (1582 linhas, 64 models) e 44 migrations em `prisma/migrations/`.

### (a) Visão dos domínios de models

- **Auth/Team:** `User`, enum `Role` (ADMIN/MANAGER/ANALYST/CS).
- **Clientes:** `Client`, `ClientAssignment`, `ClientInteraction`, `ClientStatusStreak`, `ClientInsight`, `ClientChat`/`ClientChatMessage`. Client acumula muitos campos derivados (resultado, etapa, ficha CS).
- **Plataformas/Métricas:** `PlatformAccount`, `MetricSnapshot`, `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Central Operacional (Task hub):** `Task` + 20 satélites (`TaskArea`, `POPProcess`, `POPStep`, `TaskTemplate`, `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskChecklistItem`, `TaskDependency`, `TaskCustomField*`, etc.). É o maior domínio, alinhado à estratégia de substituir o ClickUp.
- **War Room:** `CriticalProtocol` (+ `AuditLog` transversal).
- **CSX/Relatórios:** `WeeklyChecklist`, `ClientWeeklyCheckin`, `WeeklyReport`, `MonthlyReport`.
- **Integrações:** `NuvemshopStore`/`NuvemshopOrder`, `IntegrationSetting`, `AIConversation`/`AIMessage`, `KnowledgeDocument`/`KnowledgeChunk`.
- **Financeiro:** `AsaasCustomer/Payment/Subscription/Transfer`, `FinancialCategory`, `Expense`, `Contract`.
- **CRM comercial:** `AgencyLead`, `AgencyActivity`.

### (b) Pontos fortes

- Migrations recentes (a partir de `20260630*`) são fortemente idempotentes: `ADD COLUMN IF NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, `CREATE TYPE ... EXCEPTION WHEN duplicate_object` (ex.: `20260630170000_central_operacional_bloco1` com 101 guardas, `20260630140000_inadimplencia_alerts`).
- `AuditLog` append-only bem indexado (4 índices compostos por entidade/cliente/ator/ação) — atende regra técnica #8.
- Índices compostos consistentes em snapshots e relatórios (`@@unique([platformAccountId, date])`, `@@unique([clientId, weekStart])`), garantindo idempotência de sync/cron.
- Uso disciplinado de `onDelete: Cascade` nos filhos de `Client`/`Task` e `SetNull` em referências fracas (`AuditLog.actor`, `CriticalProtocol.responsible`, `Contract.responsible`).
- Truque anti-NULL em unique: `CampaignSnapshot.adSetId @default("")` evita furos de unicidade com NULL.
- `idempotencyKey @unique` em `Task` e `lastRunAt` em `TaskRecurrenceRule` atendem regras #7/#9.

### (c) Riscos por severidade

**ALTO**
- **`AgencyLead` sem índice em `phone` apesar de lookup por telefone em hot path.** `src/app/api/webhooks/whatsapp/route.ts:47` e `leads/capture/route.ts:60` fazem `where: { phone: { contains: phone.slice(-9) }, deletedAt: null }` a cada mensagem recebida. `AgencyLead` (schema:1444) só tem `@@index([status])` e `@@index([createdAt])`. `contains` não usa índice B-tree comum, mas a ausência de qualquer índice de suporte + varredura em webhook é risco de latência. Mitigável parcialmente; ver Travas.
- **Migrations antigas com `ALTER TYPE ADD VALUE` sem `IF NOT EXISTS`** (ex.: `20260324230442_add_cac_metric_type/migration.sql`: `ALTER TYPE "MetricType" ADD VALUE 'CAC';`). Se reaplicadas em banco já migrado, falham. Não corrigir migrations já aplicadas em produção (histórico imutável), mas é risco caso se recrie o banco do zero por replay — registrar.

**MÉDIO**
- **`Task.leadId` e `Task.contractId` são FKs lógicas sem constraint** (schema:678-679, comentado "sem FK"). Referências a `AgencyLead`/`Contract` podem ficar órfãs após exclusão. Usado em `src/app/actions/contracts.ts` e serviços de lead. Sem `onDelete`, deleção de lead/contrato deixa Task apontando para id inexistente.
- **`Task.assignedTo` com `onDelete: Cascade` (schema:719):** deletar um `User` apaga TODAS as tasks atribuídas a ele — perda de histórico operacional. Regra técnica #12 (não remover funcionalidade/histórico) sugere `SetNull` ou bloqueio de exclusão.
- **`AsaasSubscription.status`, `AsaasTransfer.status`, `Contract` usam `String` cru** onde enum caberia (`AsaasSubscription.status` schema:1382 "ACTIVE/INACTIVE/EXPIRED"; `FinancialCategory.type` "REVENUE|EXPENSE"). Sem enum, dados inconsistentes entram sem validação no banco.
- **`SyncLog` sem índices** (schema:1181): consultado por serviços de sync e DAL, mas não tem `@@index` em `platformAccountId`/`status`/`startedAt`. Tabela cresce por sync diário de ~30 clientes × plataformas.
- **`ClientResultado` e `ClientRelacionamento` são enums quase idênticos** (OTIMO/BOM/REGULAR/RUIM/PESSIMO) — duplicação semântica. Não é bug, mas gera confusão; documentar diferença de propósito (resultado automatizado vs. relacionamento manual).

**BAIXO**
- **Models potencialmente órfãos/subutilizados:** `OperationalRoutine` (schema:935), `TaskSavedView` (927), `TaskSLA` (944), `TaskAutomationRule` — verificar se têm consumo real ou são scaffolding do bloco Central Operacional ainda não ligado.
- **`Alert.triggeredBy` (User) sem `onDelete`** (schema:479) — default `Restrict` pode bloquear exclusão de usuário; provavelmente intencional, mas inconsistente com o resto (que usa SetNull para refs fracas).
- **`NuvemshopOrder.rawData`/`MetricSnapshot.rawData` Json sem limite** — crescimento de armazenamento; monitorar.

### 🔒 Travas / Fluidez

Foco em índices aditivos seguros e limpezas de baixo risco (todos aplicáveis via migration aditiva idempotente, sem alterar dados):

1. **Índice em `SyncLog(platformAccountId, startedAt)` e `SyncLog(status)`** — suporta telas de "última sincronização" (regra UX #10) e diagnóstico de sync falho. `CREATE INDEX IF NOT EXISTS`. Risco baixo.
2. **Índice em `AgencyLead(createdAt)` já existe; adicionar `@@index([status, deletedAt])`** — o filtro recorrente `status IN (...) AND deletedAt IS NULL` (lead-followup e CRM) se beneficia de índice parcial `WHERE deletedAt IS NULL`. Aditivo, risco baixo.
3. **Índice em `Client(status)` e `Client(pipelineStage)`** — 31 queries filtram Client por status/pipeline/businessType; nenhum índice em Client hoje além do PK/slug unique. Aditivo, risco baixo.
4. **Trocar `Task.assignedTo` onDelete Cascade → SetNull** (requer tornar `assignedTo` nullable) — preserva histórico. NÃO puramente aditivo (altera coluna); risco médio, deixar para arquiteto-dados.
5. **Formalizar FK em `Task.leadId`/`contractId` com `onDelete: SetNull`** — evita órfãos; requer backfill/validação de ids existentes antes. Risco médio.


---

## Integrações

Auditoria da dimensão **Integrações** do Performli — serviços em `src/services` e rotas em `src/app/api`. Read-only.

### (a) Integrações mapeadas

| Integração | Finalidade | Credenciais | Arquivos principais |
|---|---|---|---|
| **Asaas** | Financeiro: cobranças, assinaturas, saldo, transferências, webhook de pagamento | `IntegrationSetting` (`ASAAS_API_KEY`, `ASAAS_SANDBOX`) com fallback `process.env`; webhook via `ASAAS_WEBHOOK_TOKEN` (env) | `src/services/asaas/{client,sync,types}.ts`, `src/app/api/asaas/{sync,webhook}/route.ts` |
| **Evolution API** (WhatsApp) | Envio/QR/status/webhook de instância WhatsApp (Baileys) | `IntegrationSetting` (`EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE`) | `src/services/evolution/client.ts` |
| **Z-API** (WhatsApp) | Envio de texto, QR, status; recebe leads via webhook | `IntegrationSetting` (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`) | `src/services/zapi/client.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| **Meta Ads** | Insights de conta/campanha (Graph API v22) | `PlatformAccount.accessToken` ou `META_SYSTEM_TOKEN` (env); `META_APP_ID/SECRET` p/ debug_token | `src/services/meta-ads/{client,sync,transformers}.ts` |
| **Google Ads** | Relatório diário por campanha (v17, Service Account JWT) | `GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (env) | `src/services/google-ads/{client,sync,transformers}.ts` |
| **GA4** | Relatório diário + itens (Data API v1beta, Service Account ou OAuth refresh) | `GOOGLE_SERVICE_ACCOUNT_*` ou `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` (env) | `src/services/ga4/{client,sync,transformers}.ts` |
| **Windsor.ai** | Fonte alternativa GA4 (connector) | `WINDSOR_API_KEY` (env) | `src/services/windsor/{client,transformers}.ts` |
| **Nuvemshop** | E-commerce: pedidos, OAuth, webhooks de pedido | `NUVEMSHOP_APP_ID/SECRET/USER_AGENT` (env); access_token por loja em DB | `src/services/nuvemshop/{client,sync,reconciliation,transformers}.ts`, `src/app/api/nuvemshop/*` |
| **Leads capture** | Endpoint público de captura de leads (landing pages, UTM) | — (público) | `src/app/api/leads/capture/route.ts` |
| **Notifications** | Digest diário via WhatsApp | — (usa Evolution/Z-API) | `src/services/notifications/daily-digest.ts` |

### (b) Pontos fortes

- **Zero segredo hardcoded** — grep por padrões de chave/token literais não retornou nada. Todas as credenciais vêm de `IntegrationSetting` ou `process.env`.
- **Asaas, Meta e Windsor têm timeout explícito** (`AbortSignal.timeout(30s)` / `AbortController` 25s) com mensagem de erro operacional em timeout.
- **Padrão de credencial dinâmica correto** nos serviços WhatsApp/Asaas: leem `IntegrationSetting` primeiro (permite troca de chave sem redeploy), fallback env.
- **Nuvemshop webhook verifica HMAC-SHA256** (`x-linkedstore-hmac-sha256`) quando o secret está presente.
- **Loops de sync com paginação limitada** (safety caps: 50 páginas Nuvemshop, limits Meta/GA4) evitam laços infinitos.
- **Webhooks retornam 200 em erro interno** (Asaas) para evitar retries em falha própria — comportamento intencional documentado.
- **Google Ads/GA4 usam Service Account JWT** assinado localmente (sem SDK pesado, sem armazenar tokens de longa duração).

### (c) Riscos por severidade

**ALTO**

- **Evolution client sem timeout** — `src/services/evolution/client.ts:30` (`fetch` em `req()` sem `AbortSignal`). Toda chamada WhatsApp (envio de digest, QR, status) pode pendurar indefinidamente. Viola regra "toda chamada externa tem timeout".
- **Z-API client sem timeout** — `src/services/zapi/client.ts:33` (`fetch` em `req()` sem `AbortSignal`). Mesmo risco no canal de envio de mensagens.
- **GA4 client sem timeout** — `src/services/ga4/client.ts` (`fetch` em `getServiceAccountToken`, `getRefreshToken`, `validateProperty`, `getItemReport`, `getReport` — nenhum tem `signal`). Sync diário pode travar.
- **Google Ads client sem timeout** — `src/services/google-ads/client.ts:59,104,151` (token + search sem `signal`).
- **Nuvemshop client sem timeout** — `src/services/nuvemshop/client.ts:96,129` (`exchangeCodeForToken` e `request()` sem `signal`). Paginação de até 10k pedidos sem timeout por página.
- **Meta `validateToken`/`getAdAccounts` sem timeout** — `src/services/meta-ads/client.ts:176,200` (usam `fetch` cru fora de `fetchPages`, sem `AbortController`).
- **Webhook Nuvemshop: HMAC opcional (bypass silencioso)** — `src/app/api/nuvemshop/webhooks/route.ts:25` só valida se `appSecret && hmacHeader`. Sem header, aceita payload não assinado e grava pedidos/métricas. Deveria rejeitar quando o secret está configurado mas o header ausente.
- **Webhook Asaas: token opcional** — `src/app/api/asaas/webhook/route.ts:15-16` só valida se `ASAAS_WEBHOOK_TOKEN` definido. Sem a env, endpoint aceita qualquer POST que altere status de pagamento (`handlePaymentWebhook`).
- **Webhook WhatsApp (Z-API): client-token opcional** — `src/app/api/webhooks/whatsapp/route.ts:18-19` só valida se header presente. Endpoint público que cria `AgencyLead`/`AgencyActivity` — sujeito a spam/injeção de leads falsos sem o token.

**MÉDIO**

- **Leads capture: público com CORS `*` refletido** — `src/app/api/leads/capture/route.ts:32,117` ecoa qualquer origin. Sem rate-limit nem captcha; alvo fácil para flood de leads. Aceitável por design (formulário público), mas sem nenhuma proteção anti-abuso.
- **`console.error` como único registro de falha de webhook** — Asaas/Nuvemshop/WhatsApp não gravam `AuditLog` em erro (regra 8: automação crítica gera log). Falha de webhook fica invisível no sistema.
- **Meta usa `META_SYSTEM_TOKEN` como fallback global** — `src/services/meta-ads/client.ts:49` — token único de sistema para todas as contas; se vazar, expõe todas as contas de anúncio.

**BAIXO**

- **User-Agent Nuvemshop com email pessoal default hardcoded** — `src/services/nuvemshop/client.ts:134` (`'Performli/1.0 (kyn.leonardo@gmail.com)'`). Não é segredo, mas email pessoal fixo em fallback.
- **Sem `lastRunAt` visível em alguns clients de integração** — verificar cobertura de `SyncLog` por integração (regra 9/10).

### 🔒 Travas / Fluidez

- **Travas de segurança (corrigir já):** adicionar timeout a Evolution, Z-API, GA4, Google Ads, Nuvemshop e aos dois métodos crus do Meta — mudança aditiva de baixo risco, sem alterar contratos.
- **Trava de webhook:** tornar a verificação de assinatura **obrigatória quando o secret existe** (Nuvemshop HMAC, Asaas token, Z-API client-token) — rejeitar em vez de aceitar silenciosamente. Requer que os secrets estejam populados em produção antes do deploy (coordenar para não quebrar recebimento).
- **Fluidez:** registrar `AuditLog` em falha de webhook e `SyncLog.lastRunAt` por integração dá ao Marcos a visão "qual rotina não rodou" sem depender de logs do Vercel.
- **Fluidez futura:** consolidar Evolution vs Z-API — dois clients WhatsApp coexistindo aumenta superfície de manutenção; definir canal canônico.


---

## Segurança

Auditoria da dimensão de segurança do PERFORMLI. Foco: middleware/RBAC, JWT,
endpoints públicos, webhooks e crons. Leitura read-only.

### (a) Modelo de auth/RBAC atual

- **Autenticação:** JWT (HS256) assinado com `SESSION_SECRET`, guardado em cookie
  httpOnly `performli_session` (`src/lib/session.ts`). `secure` só em produção,
  `sameSite: lax`, validade 7 dias. Verificação via `jose.jwtVerify` com
  `algorithms: ['HS256']` fixado (bom — evita `alg: none`).
- **Credenciais:** `verifyCredentials` (`src/lib/auth.ts`) usa `bcryptjs.compare`,
  checa `user.active`, mensagens de erro genéricas ("Credenciais inválidas").
- **Middleware de página:** `src/middleware.ts` protege prefixos listados em
  `PROTECTED_PREFIX` e redireciona não autenticados para `/login`. O matcher
  exclui `api`, então o middleware **não** protege rotas de API — cada rota de
  API é responsável por sua própria checagem via `getSession()`.
- **RBAC em API:** feito ad hoc dentro de cada handler (`session.role !== 'ADMIN'`
  etc). Não há helper central `requireRole`/`requireOwnership`; a validação de
  posse (ownership) para MANAGER está espalhada e não foi possível confirmar
  cobertura uniforme nesta dimensão.

### (b) Pontos fortes

- Algoritmo JWT fixado (`algorithms: ['HS256']`) no middleware e na sessão.
- Cookie httpOnly + `secure` em produção.
- Todos os 4 crons (`daily`, `digest`, `recurrences`, `resultados`) exigem
  `CRON_SECRET` via `Authorization: Bearer` ou `x-cron-secret`; se o secret não
  estiver setado, **rejeitam** tudo (fail-closed) — ver `cron/daily/route.ts:34`.
- Cron `daily` tem try/catch por etapa (não quebra a rotina inteira).
- Webhook Nuvemshop valida HMAC-SHA256 quando `NUVEMSHOP_APP_SECRET` existe
  (`nuvemshop/webhooks/route.ts:25`).
- `/api/seed` e `/api/debug/ga4` têm gate (secret / role ADMIN).
- Nenhum segredo hardcoded encontrado nos arquivos auditados — chaves vêm de
  `process.env` ou `IntegrationSetting` (ex.: `ZAPI_CLIENT_TOKEN`).

### (c) Vulnerabilidades por severidade

#### 🔴 Crítico

**1. Webhooks Asaas e WhatsApp autenticam apenas "se o secret existir" (fail-open).**
- `src/app/api/asaas/webhook/route.ts:15-21` — só valida `asaas-access-token` se
  `ASAAS_WEBHOOK_TOKEN` estiver setado. Sem a env var, qualquer um posta eventos
  de pagamento forjados (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`) e altera o
  estado financeiro (dinheiro em risco).
- `src/app/api/webhooks/whatsapp/route.ts:19-24` — só valida `client-token` se
  `IntegrationSetting.ZAPI_CLIENT_TOKEN` existir. Sem ele, qualquer um cria
  `AgencyLead`/`AgencyActivity` arbitrários (spam/poluição do CRM).
- `src/app/api/nuvemshop/webhooks/route.ts:25` — HMAC só é checado se
  `appSecret && hmacHeader`; um atacante que omita o header pula a verificação e
  injeta pedidos/receita falsos em `MetricSnapshot`.
  Correção: fail-closed — se o secret de produção não estiver configurado, **negar**.

**2. `/api/nuvemshop/install` é público e cria Client + PlatformAccount sem sessão.**
- `src/app/api/nuvemshop/install/route.ts:21` — endpoint público que, com um
  `code` OAuth válido, cria automaticamente um novo `Client` no banco. Qualquer
  fluxo de instalação (ou um atacante com um code) injeta clientes na base sem
  vínculo a nenhum usuário/atribuição. É um endpoint de mutação de dados
  canônicos sem autenticação do Performli.

#### 🟠 Alto

**3. `/api/seed` cria usuários com senhas fracas conhecidas e é acionável em produção.**
- `src/app/api/seed/route.ts:5-16` — protegido só por `SEED_SECRET` (header
  `x-seed-secret`). Cria ADMIN `admin@performli.com.br` com senha `admin123`
  (também `gestor123`, `analista123`). Se `SEED_SECRET` estiver setado em prod (ou
  vazar), cria-se um admin de senha trivial. **Não** há guarda de
  `NODE_ENV !== 'production'`. Se `SEED_SECRET` for undefined, o compare
  `secret !== undefined` já barra — mas o risco é a existência do endpoint em prod.
  Correção: bloquear em produção e/ou remover após bootstrap; nunca semear senhas fixas.

**4. `/api/debug/ga4` exposto em produção (retorna dados brutos de terceiros).**
- `src/app/api/debug/ga4/route.ts` — exige ADMIN (bom), mas o próprio comentário
  diz "Remover após diagnóstico". Endpoint de debug não deve viver em produção;
  vaza receita/sessões brutas de GA4 de qualquer property informada.

**5. `/api/leads/capture` público com CORS `*` reflexivo e sem rate limit.**
- `src/app/api/leads/capture/route.ts:32,117-123` — `Access-Control-Allow-Origin`
  reflete a origin recebida (efetivamente `*`) e não há rate limiting em nenhum
  endpoint (grep de `rateLimit` só acha em meta-ads sync). Permite flood de
  `AgencyLead` e enumeração/atualização de leads por telefone (dedupe por
  `phone.slice(-9)` no `update`). Correção: rate limit + allowlist de origins.

**6. Ausência total de rate limiting no login e endpoints públicos.**
- Não há rota `/api/auth/login` custom localizada nesta auditoria (login
  provavelmente via server action), mas `verifyCredentials` não tem proteção
  contra brute force. Combinado com a ausência de rate limit global, há exposição
  a força bruta de credenciais.

#### 🟡 Médio

**7. `PROTECTED_PREFIX` é uma allowlist manual — risco de rota nova descoberta.**
- `src/middleware.ts:7` — proteção por lista explícita de prefixos. Qualquer
  página nova cujo path não comece por um prefixo listado fica **pública** por
  omissão. Hoje as páginas vivem sob route groups (`(dashboard)`) e o path público
  raiz `/` cai no grupo autenticado, mas o modelo é frágil. A raiz `/` não está em
  `PROTECTED_PREFIX` nem em `PUBLIC_ROUTES` — não redireciona anônimos.
  Correção: inverter para deny-by-default (proteger tudo exceto uma allowlist pública).

**8. Webhooks retornam 200 mascarando erros / silenciam falhas de auth.**
- `asaas/webhook/route.ts:44-47` engole exceções e retorna `received:true`;
  dificulta detectar abuso. Menor, mas reduz observabilidade de segurança.

**9. `/api/webhooks/whatsapp/test` (ADMIN) faz SSRF-lite para a própria origin.**
- `webhooks/whatsapp/test/route.ts:17-18` — faz `fetch` para `req.nextUrl.origin`.
  Baixo risco (origin controlada, gate ADMIN), mas endpoint de teste em produção.

### 🔒 Travas / Fluidez (correções seguras)

Correções aditivas, sem quebrar deploy nem remover funcionalidade:

1. **Fail-closed nos 3 webhooks** (Asaas, WhatsApp, Nuvemshop): se a env/secret de
   produção não estiver setada, retornar 401 em vez de aceitar. Baixo risco;
   exige apenas garantir as envs configuradas antes do deploy.
2. **Guardar `/api/seed` e `/api/debug/ga4` atrás de `NODE_ENV !== 'production'`**
   (early-return 404). Trava simples, sem efeito em dev.
3. **Trocar senhas fixas do seed por variáveis de ambiente** (ou gerar aleatórias
   e logar uma vez). Remove admin `admin123`.
4. **Rate limit leve** (por IP) em `/api/leads/capture` e no fluxo de login, e
   **allowlist de origins** no CORS em vez de refletir a origin.
5. **Autenticar `/api/nuvemshop/install`** ou restringir criação de Client a um
   fluxo com `state` assinado/validado (como o callback já faz), evitando criação
   anônima de clientes canônicos.
6. **Inverter o middleware para deny-by-default** numa fatia futura (maior risco de
   regressão — validar todas as páginas/route groups antes).


---

## Performance

Auditoria read-only da dimensão de performance do PERFORMLI. Foco: `src/lib/dal.ts`, tela Client 360, cache/revalidate, cold-start Neon, client vs server components.

### (a) Padrões atuais de data-fetching e cache

- **DAL centralizada** em `src/lib/dal.ts` (~3478 linhas). Todas as leituras passam por funções memoizadas com `cache()` (React, per-request) — bom.
- **Paralelização**: `Promise.all` é usado consistentemente (dashboard, cockpit, client detail, check-in stats). Nenhum loop `await` sequencial sobre clientes encontrado — agregações feitas em memória após 1 query.
- **Server Components** por padrão; `'use client'` restrito a componentes interativos (96 arquivos, todos em `components/` ou botões/modais).
- **Cache persistente (`unstable_cache`)**: usado em apenas **3** pontos — `getClientsList` (revalidate 30s), `getClientMonthlyComparison` (300s). Todo o resto depende só de `cache()` (não sobrevive entre requests).
- **Toda a rota `(dashboard)` é `export const dynamic = 'force-dynamic'`** (`src/app/(dashboard)/layout.tsx:1`) — desliga full-route cache; toda navegação re-executa as queries.

### (b) Pontos fortes

- `MetricSnapshot` (tabela mais quente) tem índices corretos: `@@index([clientId, date])`, `@@index([date])`, `@@unique([platformAccountId, date])`. As queries por range de data (`getClientKPIs`, history, monthly) batem no índice composto.
- `HealthScore` indexado por `[clientId, periodStart]` e `[status]` — cobre os filtros do dashboard.
- 96 usos de índice/unique no schema — cobertura geral boa.
- Agregações pesadas (6 meses, funil, comparativos) feitas com **1 query + reduce em memória**, não N queries — ex. `_fetchMonthlyComparison` (dal.ts:895), `getManagerStats` faz 2 queries para todos os clientes (dal.ts:1898/1931), não uma por cliente.
- `Operation` (`getOperations`, dal.ts:973) tem paginação real (`skip`/`take`/`count`).
- Prisma singleton global (`src/lib/prisma.ts:15`) evita nova conexão por invocação serverless.

### (c) Riscos por severidade

**ALTO**

- **`force-dynamic` global + Neon cold-start** — `src/app/(dashboard)/layout.tsx:1`. Nenhuma rota do dashboard usa cache de rota; cada request acorda o Neon e re-roda todas as queries. Com Neon (cold-start ~300ms–1s), a primeira query de cada request paga o wake-up. Combinar com o ponto abaixo torna o Client 360 lento.
- **Client 360 dispara ~17 queries por request sem cache de rota nem `loading.tsx`** — `src/app/(dashboard)/clients/[slug]/page.tsx:131` (Promise.all de 17 chamadas DAL) + `:121` (mais 2). Boa paralelização, mas todas as chamadas usam apenas `cache()` (não `unstable_cache`), então em cada navegação re-executam contra o Neon. Sem `loading.tsx` na rota `clients/[slug]`, o usuário vê tela branca até a mais lenta terminar (ex. `getClientKPIs` faz 2 queries de snapshots + `getClientMonthlyComparison` 6 meses).

**MÉDIO**

- **`getManagerStats` / `getManagersOverview` carregam TODOS os clientes ativos com includes profundos** — dal.ts:1898 e dal.ts:1673. `include` de `metricSnapshots` (range de semana), `healthScores`, `assignments`, `statusStreak` para todos os ~30 clientes de uma vez. Escala linearmente com nº de clientes × snapshots/semana; sem `take`. Aceitável em 30 clientes, mas é a query mais cara e roda sem `unstable_cache`.
- **`getClientChat` faz `upsert` (escrita) dentro de um fetch de página** — dal.ts:2235. Chamado no render do Client 360; toda visita ao cliente executa um write no DB só para garantir que o canal existe. Deveria ser lazy/separado da leitura da página.
- **`getManagersMRR` (dal.ts:2107) e `getNovaTarefaContext` (dal.ts:1188)** carregam `managedClients`/`tasks` aninhados sem `take` — ok para volume atual, mas incluem coleções que crescem (tasks abertas por cliente).
- **`ClientHealthGrid` usa `<img>` em vez de `next/image`** — `src/components/dashboard/ClientHealthGrid.tsx`. Logos de cliente sem otimização/lazy-load (só 1 uso de `next/image` no projeto inteiro). Payload de imagens não controlado.

**BAIXO**

- Sem paginação em `getTasks`/`getOperacionalBoard` (dal.ts:1069/1114) — retornam todas as tasks role-scoped. Board sem `take`; cresce com o histórico de tarefas.
- `getAtRiskClients` (dal.ts:1784) e `getAntiChurnQueue` (dal.ts:1471) fazem filtro/sort em memória após carregar todos os clientes ativos — barato hoje.
- `getClientChat` inclui `take: 100` mensagens sempre, mesmo quando o painel está fora da viewport.

### 🔒 Travas / Fluidez

- **`loading.tsx` faltando nas rotas mais pesadas.** Só 6 rotas têm (`canais`, `clients`, `cockpit`, `financeiro`, `meu-dia`, `operacional`). Faltam justamente em `clients/[slug]` (a tela de 17 queries), `dashboard`, `managers`, `reports`, `agency`, `comercial`, `check-ins`, `anti-churn`. Adicionar `loading.tsx` dá feedback imediato durante o cold-start do Neon.
- **Cache de rota desligado globalmente** (`force-dynamic` no layout). Considerar remover do layout e aplicar seletivamente, ou usar `unstable_cache` com `revalidate` curto (30–120s) nas telas de leitura pesada (Client 360, managers, cockpit) — os dados vêm de sync diário/cron, não precisam ser real-time.
- **`unstable_cache` subutilizado**: apenas 2 funções o usam. As queries mais caras do Client 360 (`getClientKPIs`, `getClientMetricHistory`, `getClientDailyRevenue`, `getGoalPaceMetrics`) rodam sem cache persistente. Envolvê-las com `unstable_cache` (chave por `clientId`+range, `revalidate` ~60s) elimina a maior parte da latência entre navegações.
- **Paginação ausente** em `getTasks` e `getOperacionalBoard` — adicionar `take`/cursor antes que o volume de tarefas cresça.
- **Write no caminho de leitura**: `getClientChat` (`upsert`) deve ser movido para fora do render da página para não bloquear TTFB nem impedir cache.


---

## Crons & Automação

Auditoria read-only da dimensão Crons & Automação do PERFORMLI. Escopo:
`src/app/api/cron/*` e serviços de monitor/gerador em `src/services`.

### (a) Rotinas existentes

**Rotas de cron (`vercel.json`):**

| Rota | Schedule (UTC) | Faz |
|------|----------------|-----|
| `/api/cron/daily` | `0 11 * * *` (08:00 BRT) | Orquestra ~20 passos: syncs (Meta/GA4/GoogleAds/Nuvemshop/Asaas), health, oscilação, churn, anti-churn, check-ins, inadimplência, follow-up de leads, escalação de tarefas, budget, contas críticas, war room (escalação+monitor), contract expiry; domingo gera weekly reports/checklists; segunda sincroniza metas semanais. |
| `/api/cron/digest` | `30 11 * * *` (08:30 BRT) | Envia digest diário via WhatsApp (Z-API). Separado para não depender do sync. |
| `/api/cron/recurrences` | `0 10 * * *` | Gera tarefas recorrentes de templates. Idempotente por `idempotencyKey`. |
| `/api/cron/resultados` | `0 9 * * 1` (segunda) | Atualiza Resultado semanal (ROAS/GA4) e deriva Etapa. Idempotente por `Client.resultadoWeek`. |

**Serviços com try/catch POR item + logging (fortes):** `warroom-escalation`,
`warroom-monitor`, `inadimplencia-checker`, `lead-followup-checker`,
`task-escalation`, `antichurn-monitor`, `checkin-monitor`, `recurrence-engine`,
`resultado-engine`.

### (b) Pontos fortes

- **Auth consistente:** todas as 4 rotas exigem `CRON_SECRET` via `Bearer` ou
  `x-cron-secret`, e rejeitam quando o env não está setado (`return false`).
- **Isolamento por passo no daily:** cada um dos ~20 passos do `runDailySync`
  tem `try/catch` próprio — a falha de um passo (ex: sync Meta) não derruba os
  demais. Retorna `summary` por passo (`ok/error`).
- **Idempotência real** onde importa: `recurrence-engine` (idempotencyKey +
  AutomationLog "duplicidade evitada"), `resultado-engine` (`resultadoWeek`),
  dedup de alertas por janela em quase todos os monitores.
- **AutomationLog / AuditLog** presentes nos serviços mais críticos
  (recurrence, resultado, lead-followup, task-escalation, warroom-escalation).
- **`lastRunAt`** gravado por regra em `recurrence-engine.ts:140`.
- **digest separado do sync** — decisão arquitetural correta (timeout de sync
  não impede envio do digest).

### (c) Riscos por severidade

#### 🔴 Alto

- **Loops "all" sem try/catch por cliente** — a regra inegociável nº 7 é
  violada nos runners batch. Um cliente com dado corrompido aborta TODA a
  sub-rotina (embora o `try` do passo no daily contenha o estrago no nível do
  passo, todos os demais clientes daquele passo são perdidos):
  - `health-scorer.ts:477` (`recalculateAllClientsHealth` — loop `for` chama
    `recalculateClientHealth` + `updateStreak` sem try/catch).
  - `churn-scorer.ts:147` (`scoreAllClientsChurnRisk`).
  - `oscillation-detector.ts:199` (`detectOscillationsForAll`).
  - `budget-monitor.ts:36` (loop `for goals` — sem try/catch por goal).
  - `critical-account-detector.ts:46` (loop `for clients`).
  - `contract-expiry-checker.ts:25` (loop `for expiring`).
  - `weekly-report-generator.ts:945` (`generateAllWeeklyReports`).
  - `weekly-checklist-generator.ts:57` e `:149` (loops por cliente/manager).

#### 🟡 Médio

- **Sem `lastRunAt` / SyncLog no nível das rotinas do daily.** Nenhuma rota de
  cron nem os serviços batch (health, churn, oscilação, budget, critical,
  contract, weekly) gravam `lastRunAt` global. Só `recurrence-engine` e
  `resultado-engine` registram. Viola regras nº 9 e 10 (tela precisa mostrar
  última atualização). O `summary` do daily não é persistido — some quando a
  resposta HTTP retorna. `grep` confirmou: sem `lastRunAt/SyncLog/AuditLog` em
  `src/app/api/cron/`.
- **Contas críticas / budget / contract não geram AuditLog.** Criam `Alert`
  (automação crítica) mas sem `AuditLog` (regra nº 8). `critical-account-detector.ts:190`
  tem try/catch isolado só para uma sub-ação, não para o loop.
- **`daily` sem timeout explícito por sync externo visível aqui.** O timeout
  precisa existir dentro de cada `syncAll*` (não auditado nesta dimensão) —
  verificar se cada chamada externa respeita a regra nº 6. `maxDuration: 300`
  no `vercel.json` protege a função, mas não substitui timeout por chamada.

#### 🟢 Baixo

- **`digest` retorna 500 em falha** — correto para observabilidade, mas o
  Vercel Cron pode reexecutar; `sendDailyDigest` deve ser idempotente/dedup
  (não verificado nesta dimensão).
- **Sem `runtime`/`dynamic` explícito** nas rotas de cron (risco de cache de
  rota estática em edge cases do Next). Baixo, mas vale forçar
  `export const dynamic = 'force-dynamic'`.

### 🔒 Travas / Fluidez

- **Trava dura:** os 8 loops batch sem try/catch por cliente são o maior risco
  de "falha silenciosa" — exatamente o que o sistema deveria eliminar. Um único
  cliente quebra o lote inteiro e ninguém vê (o passo só reporta `ok:false` com
  a mensagem do primeiro erro).
- **Trava de observabilidade:** sem `lastRunAt`/SyncLog persistido, é impossível
  a tela responder "qual rotina não rodou" — pergunta operacional central do
  CLAUDE.md. O `summary` volátil precisa virar registro em `SyncLog`/`AutomationLog`.
- **Fluidez boa:** padrão de dedup de alertas por janela é consistente e evita
  spam; separação digest/sync é madura; idempotência dos engines novos
  (recurrence/resultado) é exemplar e deve ser o modelo para os demais.


---

## Testes & Documentação

Auditoria read-only da dimensão **Testes & Documentação** do Performli.
Data: 2026-07-01.

---

### (a) O que existe

**Testes automatizados**
- **Nenhum.** Não há arquivos `*.test.ts(x)` nem `*.spec.ts(x)` em `src/`
  (busca em toda a árvore, excluindo `node_modules`, retornou 0).
- **Nenhum test runner configurado.** `package.json` não declara `jest`,
  `vitest`, `@playwright/test` nem `@testing-library` em `dependencies` ou
  `devDependencies`. Não há script `test`.
  - `@playwright/test` aparece apenas como dependência **transitiva** em
    `package-lock.json` (arrastado por outra lib), não é instalável/usável.
- **Nenhum CI.** Não existe `.github/workflows/` — nada roda lint/build/test
  em PR. A única defesa automática é `npm run build` (Vercel), que faz
  `prisma generate + migrate deploy + next build` (compilação/type-check),
  sem verificação comportamental.
- `.gitignore` tem seção `# testing`, mas sem infra por trás.

**Documentação (raiz)**
- `CLAUDE.md` — regras transversais, RBAC, 21 POPs, score 0.30, exit strategy
  ClickUp. Robusto e atual.
- `AGENTS.md` — apenas aviso "This is NOT the Next.js you know" (regras
  nextjs). **Não** documenta os agentes do projeto (isso está no README).
- `README.md` — descreve a **estrutura de subagents** (maestro, guardião etc.)
  e as 4 fases. **Não** é um README de setup do app (não há passos de
  instalação, `.env`, migrate, seed, rodar dev).
- `PROJECT_STATE.md` — estado global detalhado (23 KB), atualizado 2026-07-01.

**Documentação (`docs/`)**
- `PERFORMLI_CONTEXTO.md`, `Arkza_Dossie_POPs.html`, `ficha_clinica.docx`
- `auditoria-codigo.md`, `mapa-lacunas.md`, `mapa-pops.md`
- `proposta-schema.md`, `proposta-telas.md`, `ux-clickup-referencia.md`, `ux/`
- `nuvemshop-instalacao.md` (único guia de setup de integração)
- `prompt_auditoria_dossie_mae.md`
- `_audit/` (este diretório de auditoria)

---

### (b) Pontos fortes

1. **Documentação de contexto/produto excelente.** CLAUDE.md + PROJECT_STATE +
   docs/ cobrem regras, POPs, lacunas e propostas com profundidade rara.
2. **PROJECT_STATE.md vivo** — atualizado hoje, serve de fonte de verdade do
   progresso.
3. **Guia de integração** existe para Nuvemshop (`nuvemshop-instalacao.md`).
4. **Build faz type-check e migrate** — pega quebras de compilação e schema
   antes do deploy.
5. Regra de **"evidência mínima por tarefa"** (CLAUDE.md #14) está bem definida
   como conceito de produto (check-in preenchido, relatório aprovado etc.).

---

### (c) Lacunas por severidade

**🔴 ALTA**
- **Zero testes em fluxos críticos.** Sem cobertura de:
  - **Auth/RBAC** (`src/lib/auth.ts`, `src/lib/session.ts`,
    `src/app/actions/auth.ts`) — o pilar de segurança (auth+papel+posse,
    regras inegociáveis #2/#3) não tem nenhum teste de regressão.
  - **Mutações com posse (ownership)** — nenhuma server action validada por
    teste; um bypass de autorização passaria silenciosamente.
  - **`resultado-engine.ts` / `recurrence-engine.ts`** — motores de cálculo
    centrais, sem teste de regressão numérica.
  - **Crons** (`src/app/api/cron/{daily,digest,recurrences,resultados}`) —
    a regra #7 (try/catch por cliente, falha isolada) não é verificável por
    teste; regressão de resiliência passaria despercebida.
- **Sem rede de segurança de regressão.** Regras #11/#12 ("não quebrar
  produção", "não remover funcionalidade") dependem hoje 100% de revisão
  manual (guardião) — nada automatizado impede regressão comportamental.

**🟡 MÉDIA**
- **README não serve de onboarding do app.** Um dev novo não consegue subir o
  projeto lendo o README (falta `.env`, `prisma migrate dev`, `seed`, `dev`).
  O README documenta os agentes, não o software.
- **Sem CI.** PRs não têm gate automático de `lint`/`build`. `guardiao` é
  manual e "nunca conserta"; sem CI, regressões só são pegas se alguém rodar.
- **Ausência de doc de segredos/integrações.** Muitas integrações (Meta,
  Google Ads, GA4, Asaas, Z-API, Windsor, ClickUp) sem guia de config
  equivalente ao de Nuvemshop; risco operacional na transição para CEO.

**🟢 BAIXA**
- `AGENTS.md` é enxuto e pode confundir (parece placeholder); poderia apontar
  para README/CLAUDE.
- `docs/` mistura fontes (`.docx`, `.html`) sem índice (`docs/README.md`).

---

### 🔒 Travas / Fluidez

Ordem de menor esforço / maior retorno.

1. **[FLUIDEZ] Adicionar Vitest + 1 teste de fumaça** sobre a decisão de
   autorização (papel + posse) usada por mutações. Instalar `vitest`,
   `script "test"`, e um `*.test.ts` que cobra que um MANAGER só altera
   cliente atribuído e que CS não muta. Aplicável agora, risco baixo, protege
   a regra inegociável mais crítica.
2. **[FLUIDEZ] Teste de regressão do `resultado-engine`.** Fixar entradas
   conhecidas → saídas esperadas. Congela o motor de cálculo antes de futuras
   mudanças. Aplicável agora, risco baixo.
3. **[FLUIDEZ] Reescrever/dividir README.** Manter descrição dos agentes, mas
   adicionar seção "Rodar o app" (env, migrate, seed, dev). Ou mover agentes
   para `AGENTS.md` e deixar README = setup. Aplicável agora, risco baixo.
4. **[FLUIDEZ] CI mínimo** (`.github/workflows/ci.yml`): `npm ci` + `lint` +
   `build` (+ `test` quando existir). Gate automático antes do guardião.
   Aplicável agora, risco baixo.
5. **[TRAVA leve] Não marcar fatia como "concluída" sem ao menos 1 teste de
   fumaça no fluxo crítico** — operacionaliza a regra #14 ("evidência mínima")
   também para código, não só para dado de produto. Adotar como norma no
   checklist do guardião. Risco baixo.
6. **[FLUIDEZ] Atualizar PROJECT_STATE** com uma linha de status de testes
   (hoje: "sem cobertura automatizada") para que a lacuna fique visível na
   fonte de verdade. Aplicável agora, risco baixo.


---
