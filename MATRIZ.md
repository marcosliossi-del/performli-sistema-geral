# MATRIZ DE INCONSISTÊNCIAS — FASE 2 (A2)

> Entregável da Fase 2 do master prompt "Auditoria e Correção Sistêmica".
> Base: AUDITORIA-SISTEMICA.md (30 achados). Classificação: 15 BUG_DIVERGENCIA ·
> 10 LACUNA_DE_ESPECIFICACAO · 4 RISCO_LATENTE (A-009/A-006 na fronteira).
> ⛔ GATE 1: nenhuma correção sem aprovação explícita por lote.
> Os 2 arquivos de referência comportamental ainda não foram anexados — as
> LACUNAs viram perguntas objetivas ao Marcos (seção 3).

## 1. Matriz

| ID | Tipo | Módulo | Sintoma observável | Causa raiz | Evidência | Sev. | Esf. |
|---|---|---|---|---|---|---|---|
| A-001 | BUG_DIVERGENCIA | Resultado/Métricas | Dois ROAS diferentes na MESMA página do Client 360; War Room/alerta ROAS disparam no número errado; e-commerce só-GA4Sync fica sem Resultado | resultado-engine soma só `GA4`, ignora precedência GA4SYNC>GA4 (canônica) | resultado-engine.ts:98-120,130,143,158-187; realizado.ts:19-21; clients/[slug]/page.tsx:352,215 | CRITICA | M |
| A-002 | BUG_DIVERGENCIA | Metas | "R$45k/R$100k" com selo "90%" na mesma linha | actual ao vivo vs alvo cheio × pct pró-rata congelado no cron | page.tsx:636-700; dal.ts:1188-1213; health-scorer.ts:356-360 | ALTA | M |
| A-003 | BUG_DIVERGENCIA | Ticket médio | Ticket em /agency/metas ≠ Client 360 | receita GA4SYNC ÷ pedidos GA4-only | progress.ts:206-231; dal.ts:936 | MEDIA | P |
| A-004 | BUG_DIVERGENCIA | Tendência | Seta mês-a-mês distorcida | mês atual GA4SYNC vs anterior GA4-only | progress.ts:126-141 | MEDIA | P |
| A-005 | BUG_DIVERGENCIA | Histórico | Mês passado difere entre /agency/metas e gráfico 6 meses | fatBatch só no mês corrente | progress.ts:190-217; dal.ts:1059-1060 | MEDIA | P |
| A-006 | LACUNA | Spend | monthSpend (def. A) ao lado de monthRoas (def. B) | duas definições de investimento | dal.ts:468-469,366-370; health-scorer.ts:91-93 | MEDIA | P |
| A-007 | BUG_DIVERGENCIA | Fuso/pró-rata | Após 21h SP, pace 1 dia à frente do achievementPct | getDate() UTC na UI vs SP no scorer | dal.ts:2768; progress.ts:76-83 | MEDIA | P |
| A-008 | BUG_DIVERGENCIA | Projeção | 4 projeções de mês diferentes (portal/cockpit/metas/360) | 4 fórmulas de daysElapsed | portal/kpis.ts:380; dal.ts:770,2839; progress.ts:242 | MEDIA | M |
| A-009 | LACUNA | Status | Cliente OTIMO e PESSIMO ao mesmo tempo | dois eixos: HealthStatus × ClientResultado | resultado-engine + streak | MEDIA | P | ✅ CORRIGIDO (decisão 3=A, Marcos 2026-07-18 — eixo único de saúde). Fatia 1/2 (backend): `getUnifiedClientHealth`/`getUnifiedClientHealthBatch` em `health-derive.ts` = selo único por cliente (HealthStatus, NÃO nova escala), "Resultado" rebaixado a sub-informação (`weeklyRoas.resultado`). Fatia 2/2 (UI): quadro canônico único no Cockpit (`ClientHealthGrid` + `getUnifiedClientHealthBatch`, atingimento sem SPEND, pacing, ROAS semana, GA4Sync, carimbo); saúde removida de `AssignmentsClient` e `ClientesTable` (viram link "ver saúde →"); Client 360 usa selo único + ROAS rotulado (Etapa permanece). Ver DOSSIE §15. |
| A-121 | BUG_DIVERGENCIA | Atingimento | Meta de SPEND infla "atingimento geral" | média inclui achievementPct de SPEND (consumo de budget) | dal.ts:225-231,535-538,2185-2187,2518-2520,3506-3509 | ALTA | P | ✅ CORRIGIDO (fatia Saúde única): `BUDGET_CONSUMPTION_METRICS` (SPEND/INVESTMENT) em health-scorer + `overallAchievementPct()` em health-derive excluem consumo de budget da MÉDIA (barra individual do SPEND preservada). Evidência do bug: ROAS 31% + FATURAMENTO 4% + SPEND 694% → mostrava "243% atingimento geral" com selo Crítico. Todos os 5 sites de média na DAL passam pela fonte única. |
| A-010 | BUG_DIVERGENCIA | Portal | Funil e faturamento não fecham | funil GA4-only vs faturamento canônico | portal/kpis.ts:173,293-300 | BAIXA | P |
| A-100 | RISCO_LATENTE | Tarefas | statusId espelho sem constraint; leitura bifurcada | fonte dupla viva | mutate.ts:85-88; panel.ts:140 | MEDIA | M |
| A-101 | BUG_DIVERGENCIA | Conversas | Inbox desordena após crash no envio | outbound sem $transaction | actions/conversas.ts:101-116 | MEDIA | P | ✅ CORRIGIDO (Lote 4): create+update em `prisma.$transaction` (conversas.ts:101-124) |
| A-102 | BUG_DIVERGENCIA | Conversas | Não-lida some na contagem | increment × set 0 (corrida) | ingest.ts:274; conversas.ts:260 | MEDIA | M | ✅ CORRIGIDO (Lote 4): `updateMany` guardado por `lastInboundAt` visto — reset só se nenhum inbound chegou no intervalo; sem campo "visto por usuário" no schema, guard sem migration (conversas.ts:250-284) |
| A-103 | RISCO_LATENTE | Streak | Board × Client 360 divergem por janela; vira às 21h | streak fora da transação; setHours UTC | health-scorer.ts:521-542 | MEDIA | M | ✅ CORRIGIDO (Lote 4): leitura dos scores + escrita do streak em `prisma.$transaction` interativa (health-scorer.ts:501-550); try/catch por cliente da regra 7 preservado no batch |
| A-104 | LACUNA | Badge check-ins | Badge nunca bate com a tela | Task OPE-06 × ClientWeeklyCheckin | dal.ts:3875 × 1825-1899 | MEDIA | P |
| A-105 | LACUNA | Badge alertas | Badge maior que o cockpit | badge inclui KPI_DROP/SPIKE; cockpit exclui | dal.ts:3878 × 135 | MEDIA | P |
| A-106 | LACUNA | Badge alertas | Badge só não-lidos × página com tudo | escopos diferentes | alerts/page.tsx:67-78 | BAIXA | P |
| A-107 | LACUNA | Badge suporte | Badge ≠ tela (status) | 3 status × todos ≠CANCELADO | dal.ts:3879 × suporte/page.tsx:20-26 | MEDIA | P |
| A-108 | LACUNA | Badge suporte | Item conta no badge e some da tela | scope assignedTo OR carteira × só carteira | dal.ts:3863 × page.tsx:23-25 | MEDIA | P |
| A-109 | BUG_DIVERGENCIA | Fuso/tarefas | Mesma tarefa "atrasada" numa tela e "hoje" na outra (21h-24h SP) | boundary UTC-local × SP | dal.ts:3571-3584,3869 × 1326,3628,3924 | ALTA | M |
| A-110 | BUG_DIVERGENCIA | Board | KPI topo ≠ lista na mesma tela; filtro vaza entre usuários | localStorage global; KPI sem filtro | taskBoard.ts:55 | MEDIA | P |
| A-111 | RISCO_LATENTE | Conversas | Vira bug com unstable_cache futuro | ingestão não revalida | ingest.ts:269-277 | BAIXA | P | ✅ CORRIGIDO (Lote 4): `revalidatePath('/conversas')` 1x por batch nos route handlers (cron/conversas/route.ts + webhooks/meta-whatsapp/route.ts), não por evento — evita chamar em contexto server-only do ingest |
| A-112 | LACUNA | RBAC/Fin | GESTOR com grant vê valores cheios em /financeiro e estripados em /clients | grant sem stripSensitive no DAL financeiro | financeiro/page.tsx:282 | CRITICA | M |
| A-113 | LACUNA | RBAC/Fin | Vê a tela, toma 401 ao agir | grant na página; API ADMIN-only | summary/route.ts:15 | ALTA | P |
| A-114 | LACUNA | Financeiro | "Inadimplentes" difere entre /clients e /financeiro | faturas × clientes distintos | clients/page.tsx:41 × financeiro/page.tsx:79-83 | ALTA | P |
| A-115 | LACUNA | DRE | Dois DRE coexistem (endpoint × página) | boundary + fontes de saída diferentes | summary/route.ts × financeiro/page.tsx | ALTA | M |
| A-116 | BUG_DIVERGENCIA | Fin/Fuso | Fila de vencidos × KPIs divergem na virada | UTC-midnight × new Date() com hora | dal.ts:1643-1661 × page.tsx:31,80 | MEDIA | P |
| A-117 | BUG_DIVERGENCIA | Fuso | Badge Meu Dia muda após 21h SP | endToday UTC-local | dal.ts:3868-3873 | MEDIA | P |
| A-118 | BUG_DIVERGENCIA | Fuso | /meu-dia desloca 1 dia após 21h | boundary UTC-local | dal.ts:3570-3572 | MEDIA | P |
| A-119 | BUG_DIVERGENCIA | Fin/Fuso | Endpoint DRE corta o último dia | new Date('YYYY-MM-DD') + lte | summary/route.ts:24-44 | MEDIA | P |
| A-120 | BUG_DIVERGENCIA | Fuso | Streak vira às 21h SP | setHours runtime | health-scorer.ts:525-526 | BAIXA | P | ✅ CORRIGIDO (Lote 4): `today` e `sinceDay` no UTC-midnight do dia-parede SP (`saoPauloDateString()` + setUTCHours), padrão da linha 337 (health-scorer.ts:513,536) |

## 2. Lotes por causa raiz

1. **Lote 1 — Precedência GA4SYNC propagada aos cálculos inline** [CRITICA]: A-001, A-003, A-004, A-005, A-010 (+A-006 após Pergunta 1). Fonte única = helper de agregação canônico (aggregateSnapshots); resultado-engine passa a consumi-lo; branch `!hasGa4` reconhece GA4SYNC. Regressão ALTA (muda resultadoRoas/alertas/War Room — snapshot antes/depois obrigatório).
2. **Lote 2 — Pró-rata/projeção/fuso unificados** [ALTA]: A-002, A-007, A-008, A-109, A-116, A-117, A-118, A-119, A-120. Fonte única = utilitário SP de dia/período + 1 definição de projeção e de alvo pró-rata. (+Pergunta 2 para A-002.)
3. **Lote 3 — Badges × telas** [MEDIA, bloqueado pelas Perguntas 4-7]: A-104..A-108. Badge e tela compartilham o MESMO predicado, centralizado.
4. **Lote 4 — Atomicidade conversas/streak** [MEDIA]: A-101, A-102, A-103. $transaction no outbound; unread reset condicional; streak dentro da transação do score.
5. **Lote 5 — Grant × strip × APIs financeiras** [CRITICA, bloqueado pelas Perguntas 8-10]: A-112, A-113, A-114, A-115. Política financeira única no DAL (gate grant-aware + strip coerente).
6. **Lote 6 — Riscos latentes** [MEDIA/BAIXA]: A-100, A-110, A-111. Constraint/leitura única do statusId; localStorage por usuário + KPI topo consistente; revalidate na ingestão.

## 2.1. Status de correção — Lote 1 (Fase 3 / A3)

> Lote 1 APROVADO por Marcos (Pergunta 1 = A: investimento/ROAS só plataformas
> de anúncio; a definição do health-scorer é a canônica). Correções aplicadas
> em working tree (commit pendente de QA).

| ID | Status | Correção |
|---|---|---|
| A-001 | ✅ CORRIGIDO | resultado-engine consome `aggregateSnapshots` (FATURAMENTO GA4SYNC>GA4/dia + SPEND só-ads); branch `!hasGa4` → `hasRevenueSource` (GA4 OU GA4SYNC); cliente só-GA4Sync agora tem Resultado. `resultado-engine.ts:94-143,148` |
| A-003 | ✅ CORRIGIDO | progress.ts: purchases/ticket ECOM via `getRealizadoBatch('CONVERSIONS')` canônico; ticket = revenue÷purchases bate com Client 360. `progress.ts:206,220,232,245` |
| A-004 | ✅ CORRIGIDO | progress.ts: mês anterior ECOM via `getRealizadoBatch(janelaPrev)`; seta mês-a-mês compara na mesma base. `progress.ts:126-149,281-287` |
| A-005 | ✅ CORRIGIDO | `getRealizadoBatch` aceita janela explícita; meses passados usam a mesma agregação canônica (fim da divergência com o gráfico de 6 meses). `realizado.ts:149-157`; `progress.ts:188-207` |
| A-006 | ✅ CORRIGIDO | Constante única `NON_AD_PLATFORMS`/`isAdPlatform` (health-scorer); aplicada em `dal.ts:468`, `progress.ts:207`, health-scorer:99. monthSpend/localSpend alinhados à def. canônica. |
| A-010 | ✅ CORRIGIDO | portal/kpis.ts: etapa "Compraram" via `aggregateSnapshots('CONVERSIONS')` (bate com faturamento/pedidos); topo do funil (sessões/carrinho/checkout) segue GA4-only por não ter análogo canônico. `kpis.ts:169-320` |

## 2.2. Status de correção — Lotes 2 e 3 (Fase 3 / A3)

> Lotes 2 e 3 APROVADOS por Marcos. Decisões: P2=A (alvo pró-rata "esperado até
> hoje" + pct ao vivo), P4=B (badge check-ins = ClientWeeklyCheckin pendentes),
> P5=B (badge alertas exclui KPI_DROP/SPIKE), P6=A (badge só não-lidos), P7 =
> alinhar suporte em status (abertos) E scope (assignedTo OR carteira).
> Correções em working tree (commit pendente de QA — npm bloqueado no ambiente).

**Fonte única criada:** `src/lib/metas/pace.ts` — `spDayInfo`, `projectMonth`,
`periodElapsed`, `proRataExpected`, `liveAchievementPct`. Reusa `PRORATE_METRICS`
/ `LOWER_IS_BETTER` / `computeAchievementPct` (agora exportados de
`health-scorer.ts`) para não duplicar a régua do cron.

| ID | Status | Correção |
|---|---|---|
| A-007 | ✅ CORRIGIDO | `getGoalPaceMetrics` usa `spDayInfo` (daysElapsed/total do mês no dia-parede SP) em vez de `today.getDate()`. `dal.ts:2851` |
| A-008 | ✅ CORRIGIDO | 4 projeções unificadas em `projectMonth`: `dal.ts:832` (KPI, daysElapsed SP no mês corrente / daysInRange p/ MTD explícito), `dal.ts:2922` (GoalPace), `progress.ts:252`, `portal/kpis.ts` (loadProjection). |
| A-002 | ✅ CORRIGIDO | P2=A. Client 360 "Metas do Mês" usa `paceExpected` ("esperado até hoje") + `paceAchievement` ao vivo (não mais achievementPct congelado); meta cheia vira secundária; status segue do HealthScore. `clients/[slug]/page.tsx:211,633-675`. `getReportData` (weekly) ganha `expected` (pró-rata da semana via `periodElapsed`) e `pct` ao vivo (`liveAchievementPct`); UI /reports atualizada. `dal.ts:1264-1281`; `reports/page.tsx:160-171`. **Pendência:** carimbo de atualização por-linha não adicionado (exigiria redesign; página já é server-render por request). Rótulo "dia N" no Client 360 ainda usa `kpis.daysElapsed` (server) — cosmético, diverge 1 dia entre 21–24h SP. |
| A-109 | ✅ CORRIGIDO | Boundary "hoje" das tarefas unificado no dia-parede SP (`startOfTodaySaoPaulo` + 24h) em getMinhaSemana e getSidebarCounts.meuDia (antes já SP em operacional/cockpit/aceite). |
| A-117 | ✅ CORRIGIDO | `getSidebarCounts` endToday = `startOfTodaySaoPaulo(now)+24h`. `dal.ts` |
| A-118 | ✅ CORRIGIDO | `getMinhaSemana` startToday = `startOfTodaySaoPaulo`, endToday = +24h. `dal.ts` |
| A-116 | ✅ CORRIGIDO | `getOverdueInvoices` e `getFinanceiroData` (page) usam `spDayInfo().spDayStartUtc` (00:00Z do dia SP) como `today` — mesmo boundary p/ colunas `@db.Date`. |
| A-119 | ✅ CORRIGIDO | `api/financeiro/summary` from/to no padrão SP da página (`saoPauloDayStart`, `to` exclusivo = dia seguinte) + todos os `lte`→`lt`; `today` = `spDayStartUtc`. Alinha A-115 parcialmente (fontes de saída ficam p/ Lote 5). |
| A-104 | ✅ CORRIGIDO | P4=B. Badge check-ins = `pendingCheckinCount` (clientes ativos − submetidos na semana), FONTE ÚNICA reusada por `getCheckinStats.semCheckin`. `dal.ts` |
| A-105 | ✅ CORRIGIDO | P5=B. Constante `EXCLUDED_ALERT_TYPES` compartilhada; badge alertas exclui KPI_DROP/SPIKE_24H (igual ao cockpit). `dal.ts` |
| A-106 | ✅ MANTIDO | P6=A. Badge segue só `read:false` (não-lidos); comentário de intenção adicionado. |
| A-107 | ✅ CORRIGIDO | P7. Badge suporte conta `OPEN_SUPPORT_STATUSES` (abertos ≠CONCLUIDO/CANCELADO), constante compartilhada; a tela segue listando ≠CANCELADO. `dal.ts` |
| A-108 | ✅ CORRIGIDO | P7. `taskScopeFor` (assignedTo OR carteira) compartilhado entre badge e tela /suporte — item atribuído fora da carteira aparece nos dois. `dal.ts`; `suporte/page.tsx:20-26` |
| A-112 | ✅ CORRIGIDO | P8=B (interpretação conservadora registrada no DOSSIE §15). `financeiro/page.tsx`: `fullAccess = role==='ADMIN'` propagado a `getFinanceiroData`. Grant (não-ADMIN) → VISÃO RESUMIDA/somente-leitura: agregados (DRE total, previstas, MRR, inadimplência agregada, receita média) SIM; breakdown por cliente/contrato NÃO (sem `MovimentacoesTable`, sem donut "Distribuição de entradas" por cliente, sem `InadimplenciaFila` nominal); banner "Visão resumida"; botões de mutação (`ExpenseLaunchButton`/`SyncAsaasButton`) só ADMIN. |
| A-113 | ✅ CORRIGIDO | P8=B. Rotas de LEITURA aceitam grant `administrativo.financeiro` com o MESMO recorte estripado: `api/financeiro/summary` (distribuicaoEntradas por cliente = [] p/ grant) e `api/financeiro/cashflow` (só agregados mensais). Mutação (`expenses` POST) segue ADMIN estrito; UI esconde os botões. |
| A-114 | ✅ CORRIGIDO | P9=B. `countInadimplentes()` única na DAL (`dal.ts`) = CLIENTES DISTINTOS com OVERDUE e `dueDate<=hoje`. Usada por `/clients` (antes contava FATURAS via `asaasPayment.count`), `/financeiro` e `/api/financeiro/summary`. |
| A-115 | ✅ CORRIGIDO | P10=B. `getDreTotals(from,to)` única na DAL (`dal.ts`): saídas = `Expense + asaasTransfer(DONE)`, entradas = `netValue`(fallback value), deltas por período anterior. Consumida pela página `/financeiro` e pelo endpoint `/api/financeiro/summary` (lógica divergente aposentada). Boundary A-119/A-116 preservado. |
| A-100 | ✅ CORRIGIDO | Lote 6. `Task.statusId` = WRITE-ONLY até D-004. `panel.ts` não lê mais a coluna (removido do `select`); deriva do enum via `statusIdFor(task.status)`. Nota no `statusMap.ts`. Espelho segue escrito pelas mutações. |
| A-110 | ✅ CORRIGIDO | Lote 6. `taskBoard.ts`: `VIEW_KEY/FILTERS_KEY/KANBAN_GROUP_KEY` com sufixo `:${userId}` (load/save recebem `userId` de `currentUser.id` no `OperacionalBoard`); migração suave herda 1x a chave global legada. KPI topo: nota "Mostrando N de M tarefas (filtro ativo…)" no board quando há filtro — os KPIs do topo seguem contando a carteira inteira (saúde global, intencional). |

## 3. Perguntas ao Marcos (Gate 1 — LACUNAs)

1. **(A-006)** Investimento/ROAS considera: (A) só plataformas de anúncio (recomendado) ou (B) tudo que não é GA4?
2. **(A-002)** % da meta no meio do mês: (A) contra alvo pró-rata com rótulo "esperado até hoje" (recomendado) ou (B) contra alvo cheio? Realizado ao vivo com carimbo?
3. **(A-009)** Status: (A) unificar num eixo único de saúde (recomendado) ou (B) manter dois com rótulos distintos?
4. **(A-104)** Badge check-ins conta: (A) Task OPE-06 ou (B) ClientWeeklyCheckin pendentes (recomendado)?
5. **(A-105)** Badge alertas: (A) inclui ou (B) exclui KPI_DROP/SPIKE (recomendado: B, igual ao cockpit)?
6. **(A-106)** Badge alertas: (A) só não-lidos (recomendado) ou (B) igual à página?
7. **(A-107/108)** Badge suporte: alinhar à tela em status E scope (recomendado) ou manter?
8. **(A-112/113)** Grant financeiro: (A) acesso pleno (APIs passam a aceitar grant) ou (B) dados estripados/somente leitura (recomendado)? → **DECIDIDO B** (interpretação conservadora — DOSSIE §15; validar com Marcos).
9. **(A-114)** "Inadimplentes" = (A) nº de faturas ou (B) nº de clientes distintos vencidos (recomendado)? → **DECIDIDO B**.
10. **(A-115)** Saídas do DRE: (A) só Expense ou (B) Expense + transferências Asaas (recomendado) — e aposentar o endpoint duplicado? → **DECIDIDO B**.
