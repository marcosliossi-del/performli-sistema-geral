# AUDITORIA SISTÊMICA — FASE 1 (A1) · Divergência de dados entre telas

> Entregável da Fase 1 do master prompt "Auditoria e Correção Sistêmica".
> Modo somente leitura — nenhuma correção aplicada. Dois auditores em paralelo:
> Parte I (métricas/saúde, A-001..A-010) e Parte II (schema derivado, badges,
> cache, RBAC, financeiro, fuso — A-100..A-120).
>
> Base consultada: `DOSSIE-PERFORMLI.md`, `AUDITORIA-PERFORMLI.md` (CR-1..4,
> AL-1..6, ME-* já corrigidos NÃO são re-reportados).
>
> ⚠️ Os dois arquivos de referência comportamental do master prompt
> (`health-score-performli-especificacao`, `master-prompt-health-score-performli`)
> ainda NÃO foram anexados — itens que dependem deles estão marcados para
> classificação na Fase 2 como `LACUNA_DE_ESPECIFICACAO` até que cheguem.

---

## PARTE I — MÉTRICAS E SAÚDE (fluxo MetricSnapshot → telas)

### Raiz comum identificada
A precedência **GA4SYNC>GA4 por dia** (correção CR-1) vive apenas dentro de
`aggregateSnapshots` (`src/services/health-scorer.ts:106-168`). Todo cálculo
inline que sobreviveu fora dela mantém a definição pré-GA4Sync — onde a tela
mistura valor canônico com valor inline, a divergência aparece na MESMA tela;
onde telas usam ramos diferentes, aparece ENTRE telas.

### A-001 · ALTO — resultado-engine calcula ROAS/faturamento GA4-only
- `src/services/resultado-engine.ts:98-109,130,143,166` — revenue só de
  `platform==='GA4'`; grava `Client.resultadoRoas`. A fonte canônica aplica
  GA4SYNC>GA4. `realizado.ts:19-21,61-65` ainda PROMETE que `SEMANA_FECHADA`
  bate com `Client.resultadoRoas` — promessa quebrada pós-CR-1.
- Tela: Client 360 mostra `resultadoRoas` (GA4-only) no cabeçalho
  (`clients/[slug]/page.tsx:352`) e ROAS canônico (GA4SYNC) no bloco de metas
  (`page.tsx:215`) — dois ROAS diferentes na mesma página. Alertas
  `ROAS_BELOW_TARGET_2W`/War Room decididos no número GA4-only
  (`resultado-engine.ts:158,173-187`).
- Agravante: ECOMMERCE só-GA4Sync (sem linha GA4) cai em `!hasGa4 → pular`
  (`resultado-engine.ts:114-120`) e nunca recebe Resultado; anti-churn cego.

### A-002 · ALTO — realizado ao vivo × % persistido do HealthScore na mesma linha
- `clients/[slug]/page.tsx:636-637,699-700` e `dal.ts:1188-1213`
  (getReportsData): `actual` = getRealizado ao vivo (alvo cheio exibido), `pct`
  = `HealthScore.achievementPct` persistido no cron e calculado contra alvo
  PRÓ-RATA (`health-scorer.ts:356-360`). No meio do mês: "R$45k / R$100k" com
  selo "90%". Três desalinhamentos: alvo cheio×pró-rata, ao-vivo×congelado,
  base pré×pós sync do dia.

### A-003 · MÉDIO — Ticket médio: receita GA4SYNC ÷ pedidos GA4-only
- `src/app/actions/progress.ts:206-231`: revenue de `fatBatch` (GA4SYNC),
  purchases de `platform==='GA4'`. Client 360 usa `aggregateSnapshots`
  homogêneo (`dal.ts:936`). Ticket de `/agency/metas` ≠ Ticket do Client 360.

### A-004 · MÉDIO — Tendência mês-a-mês compara GA4SYNC (atual) vs GA4-only (anterior)
- `progress.ts:126-141` (prev mês só GA4) vs mês corrente via fatBatch. Já
  `dal.ts:2247-2251` (prev semana) usa canônico — incoerência interna.

### A-005 · MÉDIO — Mês histórico: `/agency/metas` GA4-only × gráfico 6 meses canônico
- `progress.ts:190,209,216-217` (fatBatch só se `isCurrentMonth`) vs
  `dal.ts:1059-1060` (_fetchMonthlyComparison, canônico em todos os meses).

### A-006 · MÉDIO — Duas definições de "spend/investimento"
- Inclui tudo não-GA4 (GA4SYNC/NUVEMSHOP entram): `dal.ts:468-469`,
  `progress.ts:207,212`. Exclui GA4/GA4SYNC/NUVEMSHOP: `dal.ts:366-370`,
  `health-scorer.ts:91-93` (canônico). Lista de clientes exibe `monthSpend`
  (definição A) ao lado de `monthRoas` (definição B). Hoje spend é nulo nessas
  fontes; quebra silenciosamente se um sync passar a gravar.

### A-007 · MÉDIO — daysElapsed do pró-rata: fuso do servidor na UI, SP no HealthScore
- `dal.ts:2768` e `progress.ts:76-83` usam `today.getDate()` (UTC na Vercel);
  `health-scorer.ts:337` ancora em SP. Entre 21:00–23:59 SP, pace/projeção da
  UI ficam 1 dia à frente do achievementPct. Resíduo do AL-4.

### A-008 · BAIXO/MÉDIO — 4 fórmulas de "projeção do mês"
- `portal/kpis.ts:380-382` (daysElapsed SP) · `dal.ts:770-772` (daysInRange,
  range pode fechar ontem) · `progress.ts:242-244` (getDate UTC) ·
  `dal.ts:2839-2841` (GoalPaceCard). Projeção difere entre portal, cockpit,
  /agency/metas e Client 360.

### A-009 · BAIXO — Dois eixos de "status" (HealthStatus × ClientResultado)
- `HealthStatus` (streak, consistente entre telas — régua canônica reusada) vs
  `ClientResultado` do resultado-engine (escala própria, GA4-only) exibidos
  ambos como "situação". Cliente pode ser OTIMO e PESSIMO ao mesmo tempo.

### A-010 · BAIXO — Portal: funil GA4-only × faturamento GA4SYNC na mesma tela
- `portal/kpis.ts:173,293-300` (funil GA4) vs `computeValue:194` (canônico).

---

## PARTE II — SCHEMA DERIVADO, BADGES, CACHE, RBAC, FINANCEIRO, FUSO

### 4.1 Campos derivados persistidos

### A-100 · Task.statusId — espelho vivo sem constraint; leitura bifurcada
- Escrita consistente (~30 pontos com `statusIdFor`, `mutate.ts:85-88`);
  leitura: board lê enum, `panel.ts:140,261` lê statusId. Fonte dupla sem
  garantia no banco — writer futuro sem espelho quebra silenciosamente.

### A-101 · Conversation.lastMessageAt no envio OUT sem transação
- Inbound é `$transaction` (`ingest.ts:257-277`); outbound são 2 awaits
  separados (`actions/conversas.ts:101-116`) — crash entre eles desordena o
  inbox e diverge "última msg" da thread.

### A-102 · unreadCount — corrida increment (webhook) × set 0 (markRead)
- `ingest.ts:274` increment; `actions/conversas.ts:260` `unreadCount: 0`
  absoluto. Inbound entre render e reset é perdido (last-writer-wins).

### A-103 · ClientStatusStreak gravado fora de transação com HealthScore
- `health-scorer.ts:521-542`; board lê streak (`dal.ts:1348`), Client 360 lê
  HealthScore → janelas de divergência; `setHours(0,0,0,0)` UTC (vira 21:00 SP).

### Badges × telas (pares divergentes)

| ID | Contador | Divergência | Evidência |
|---|---|---|---|
| A-104 | Check-ins | badge conta Task OPE-06; tela conta ClientWeeklyCheckin — models diferentes, nunca batem | `dal.ts:3875` × `dal.ts:1825,1891-1899` |
| A-105 | Alertas | badge inclui KPI_DROP/SPIKE_24H; cockpit exclui | `dal.ts:3878` × `dal.ts:135` |
| A-106 | Alertas | badge só não-lidos; /alerts lista lidos+não-lidos | `alerts/page.tsx:67-78` |
| A-107 | Suporte | badge 3 status; tela todos ≠CANCELADO (inclui EM_VALIDACAO/AGUARDANDO_CLIENTE/CONCLUIDO) | `dal.ts:3879` × `suporte/page.tsx:20-26` |
| A-108 | Suporte | scope: badge `assignedTo OR carteira`; tela só `carteira` — tarefa atribuída fora da carteira conta no badge e some da tela | `dal.ts:3863` × `suporte/page.tsx:23-25` |
| A-109 | Atrasadas | /meu-dia + badge com boundary UTC-local; /operacional, cockpit, aceite com SP — mesma tarefa "atrasada" numa tela e "hoje" na outra entre 21:00–23:59 SP | `dal.ts:3571,3584,3869` × `dal.ts:1326,3628,3924` |

Pares verificados SEM divergência: Central de Tarefas (abertas), Validações.

### 4.4 Cache / estado client

### A-110 · Filtros do board em localStorage com chave global + KPI de topo não filtrado
- `taskBoard.ts:55` sem namespace por userId; KPIs do cabeçalho (server, sem
  filtro) × lista (com filtro salvo) = dois números na mesma tela.

### A-111 · Ingestão de conversas não revalida path (risco latente, não bug ativo)
- Mutations revalidam; webhook/cron não (`ingest.ts:269-277`). Hoje /conversas
  é dynamic — vira bug se alguém adicionar unstable_cache.

### 4.5 RBAC sobre dados

### A-112 · Space-grant expõe /financeiro sem stripSensitive
- Grant (decisão aprovada) libera a página, mas `getFinanceiroData` lê
  contratos/pagamentos crus confiando em ser ADMIN-only. GESTOR com grant vê
  valores cheios em /financeiro e os MESMOS campos estripados em /clients e
  Client 360. `financeiro/page.tsx:282` + dal sem strip.

### A-113 · Grant dá a página; /api/financeiro/* segue ADMIN-only → 401 na ação
- `ExpenseModal` chama `/api/financeiro/expenses`; rotas exigem ADMIN
  (`summary/route.ts:15`). Usuário com grant vê a tela e toma 401 ao agir.

### Financeiro

### A-114 · "Clientes inadimplentes": faturas (em /clients) × clientes distintos (em /financeiro)
- `/clients/page.tsx:41` count de OVERDUE sem distinct/sem dueDate; 
  `/financeiro/page.tsx:79-83` distinct customerId + dueDate<=today.

### A-115 · /api/financeiro/summary diverge da página (boundary e fonte de saídas); endpoint sem consumidor
- summary: `lte:to` UTC + saídas só Expense; página: `lt:to` SP + Expense +
  asaasTransfer(DONE). Dois DRE coexistem.

### A-116 · Boundary `today` inconsistente dentro de /financeiro
- Fila `getOverdueInvoices` usa UTC-midnight (`dal.ts:1643-1644,1661`); KPIs da
  página usam `new Date()` com hora (`page.tsx:31,80`).

### Fuso (resíduos pós AL-3/AL-4)

- **A-117** `getSidebarCounts.meuDia` endToday UTC-local (`dal.ts:3868-3873`)
- **A-118** `getMinhaSemana` startToday/endToday UTC-local (`dal.ts:3570-3572`)
- **A-119** `summary/route.ts:24-25,44` new Date('YYYY-MM-DD') + lte corta o último dia
- **A-120** `updateStatusStreak` setHours(0,0,0,0) runtime (`health-scorer.ts:525-526`)

---

## Limites declarados desta auditoria
- Concorrência (A-101/102/103) identificada por leitura, não reproduzida (sem testes no repo).
- Scope de /anti-churn vs badge não lido linha a linha.
- npm bloqueado no ambiente: sem execução de build/testes.
