## Performance

Escopo: `src/lib/dal.ts`, telas do grupo `(dashboard)`, cache/revalidate, cold-start Neon.
Data: 2026-07-01. Read-only.

### (a) Padrões de data-fetching e cache

- **DAL centralizada** (`src/lib/dal.ts`, ~3400 linhas). Toda leitura de tela passa por funções
  exportadas, quase todas embrulhadas em `cache()` (React request-memoization).
- **`cache()` (React):** deduplica dentro de UMA request. NÃO persiste entre requests nem entre
  usuários. É o padrão dominante (~40 funções). Bom para evitar refetch quando a mesma função é
  chamada 2x na mesma render; inútil como cache real entre navegações.
- **`unstable_cache` (Next):** usado em apenas 2 pontos — `getClientsList` (`revalidate: 30`,
  dal.ts:415) e `getClientMonthlyComparison` (`revalidate: 300`, dal.ts:936). São os únicos caches
  que sobrevivem entre requests.
- **`force-dynamic` global:** `(dashboard)/layout.tsx:1` + repetido em ~20 páginas. Mantido por
  decisão de frescor operacional. Efeito: toda página SSR a cada request, sem Full Route Cache.
  `cache()` não ajuda entre requests → cada visita re-executa todas as queries.
- **Pool Prisma:** singleton global correto (`prisma.ts`), evita nova conexão por invocação.
- **Invalidação:** via `revalidatePath` nas server actions — cobertura ampla e coerente.
- **`loading.tsx` global** no grupo dá streaming/skeleton, mitigando o cold-start percebido.

### (b) Pontos fortes

- Índices aditivos bem cobertos: `MetricSnapshot(clientId,date)`, `HealthScore(clientId,periodStart)`,
  `Goal(clientId,startDate)`, `Task` (clientId/assignedTo/status/dueDate), `Contract`, `AsaasPayment`.
  Os filtros quentes da DAL batem com índices existentes.
- N+1 já evitado em vários lugares: `getClientsList`, `getAgencyOverview`, `getManagerStats`
  fazem UMA query de snapshots com `clientId: { in: [...] }` e agregam em memória (Map). Correto.
- Uso consistente de `Promise.all` para paralelizar (dashboard, cockpit, client 360, checkin stats).
- `select` enxuto na maioria das queries de lista (evita over-fetch de colunas).
- Paginação real em `getOperations` (skip/take + count paralelo).

### (c) Riscos por severidade

**ALTA**
- **`getClientChat` faz `upsert` dentro de função `cache()`** — `dal.ts:2233`. Uma "leitura" da tela
  client 360 executa um WRITE (upsert do canal). Viola separação leitura/escrita, impede qualquer
  cache de rota e adiciona latência de escrita a cada carga da página. Mover criação do canal para
  onboarding/action; `getClientChat` deve ser findUnique puro.
- **Client 360 dispara ~18 queries + 2 `findUnique` inline por request, sem cache entre requests**
  — `clients/[slug]/page.tsx:132-174`. Com `force-dynamic`, cada visita re-roda tudo contra Neon
  (cold-start amplifica). `Promise.all` só paraleliza; não reduz carga total. Maior tela do sistema.

**MÉDIA**
- **`getTasks` sem `take` nem paginação** — `dal.ts:1069`. Para ADMIN (`where: {}`) retorna TODAS as
  tarefas da agência com joins de client+user. Cresce sem limite.
- **`getOperacionalBoard` sem `take`** — `dal.ts:1114`. Idem: board carrega todas as tarefas
  role-scoped e agrega KPIs em memória. Sem teto conforme o volume de tarefas cresce.
- **`getManagersOverview` / `getManagerStats` — include profundo aninhado** — `dal.ts:1673` e
  `dal.ts:1898`. `user → managedClients → client → {platformAccounts, healthScores, goals}` /
  `client → metricSnapshots`. Payload grande, coleções aninhadas sem `take`; escala com
  clientes × scores × dias. `getManagerStats` roda em rota `force-dynamic` sem `unstable_cache`.
- **`getClientChannels` — `_count` de mensagens + last message por cliente** — `dal.ts:2281`.
  Subquery de contagem por linha; aceitável em ~30 clientes, degrada com histórico de chat grande.
- **Leituras do client 360 sem `unstable_cache`** — histórico/monthly/campaigns (`getClientMetricHistory`,
  `getClientCampaigns`, `getHealthScoreHistory`) mudam ~1x/dia (dependem do cron), mas re-executam a
  cada request por só usarem `cache()`. Candidatos a `unstable_cache` com revalidate diário + tag.

**BAIXA**
- **`getClientInteractions take:50`, `getClientChat take:100`** — limites fixos ok, sem paginação
  além disso (`dal.ts:2756`, `dal.ts:2240`).
- **`getPipelineClients` / `getCheckinBoard` / `getAntiChurnQueue`** — `findMany` sobre todos os
  clientes ativos sem `take`. Seguro no volume atual (~30); teto implícito a documentar.
- **Datas via `new Date()` dentro de `cache()`** — irrelevante para `cache()`, mas impede migração
  ingênua para `unstable_cache` sem normalizar o range de datas na chave.

### 🔒 Travas / Fluidez

- **Trava real:** `getClientChat` (upsert em leitura) — bloqueia cachear o client 360 e injeta escrita
  no caminho de render. É o item que mais trava evolução de cache.
- **Fluidez:** `force-dynamic` global é escolha deliberada (frescor). Tradeoff aceitável: migrar as
  leituras derivadas do cron diário (histórico, comparativos, campanhas, listas) para `unstable_cache`
  com `revalidate` alinhado ao cron + `revalidateTag` no fim da sync — mantém frescor dos dados "ao
  vivo" e alivia Neon nas telas pesadas. Não exige remover `force-dynamic`.
- **Cold-start Neon:** mitigado por `loading.tsx`; o ganho maior vem de reduzir round-trips na primeira
  tela (cockpit/client 360) via cache das partes lentas e não-voláteis.
