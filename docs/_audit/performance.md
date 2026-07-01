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
