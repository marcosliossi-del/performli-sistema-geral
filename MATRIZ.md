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
| A-009 | LACUNA | Status | Cliente OTIMO e PESSIMO ao mesmo tempo | dois eixos: HealthStatus × ClientResultado | resultado-engine + streak | MEDIA | P |
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

## 3. Perguntas ao Marcos (Gate 1 — LACUNAs)

1. **(A-006)** Investimento/ROAS considera: (A) só plataformas de anúncio (recomendado) ou (B) tudo que não é GA4?
2. **(A-002)** % da meta no meio do mês: (A) contra alvo pró-rata com rótulo "esperado até hoje" (recomendado) ou (B) contra alvo cheio? Realizado ao vivo com carimbo?
3. **(A-009)** Status: (A) unificar num eixo único de saúde (recomendado) ou (B) manter dois com rótulos distintos?
4. **(A-104)** Badge check-ins conta: (A) Task OPE-06 ou (B) ClientWeeklyCheckin pendentes (recomendado)?
5. **(A-105)** Badge alertas: (A) inclui ou (B) exclui KPI_DROP/SPIKE (recomendado: B, igual ao cockpit)?
6. **(A-106)** Badge alertas: (A) só não-lidos (recomendado) ou (B) igual à página?
7. **(A-107/108)** Badge suporte: alinhar à tela em status E scope (recomendado) ou manter?
8. **(A-112/113)** Grant financeiro: (A) acesso pleno (APIs passam a aceitar grant) ou (B) dados estripados/somente leitura (recomendado)?
9. **(A-114)** "Inadimplentes" = (A) nº de faturas ou (B) nº de clientes distintos vencidos (recomendado)?
10. **(A-115)** Saídas do DRE: (A) só Expense ou (B) Expense + transferências Asaas (recomendado) — e aposentar o endpoint duplicado?
