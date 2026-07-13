# AUDITORIA FORENSE — PERFORMLI

> Data: 2026-07-13 | Commit auditado: `cf74b39` (código) / `96a047c` (com dossiê)
> Método: 4 subagentes adversariais (bugs, inconsistências, segurança, rotas) +
> mergulho nos 2 bugs conhecidos + Fase 2 de autocrítica (ataque a cada achado).
> Mapa de apoio: `DOSSIE-PERFORMLI.md`. Verdade: o código.
>
> **Restrição cumprida:** nada foi corrigido nesta execução — só diagnóstico.
> Nenhum valor de secret aparece no relatório.

---

## 1. RESUMO EXECUTIVO

### Contagem por severidade e confiança

| Severidade | Total | CONFIRMADO | SUSPEITO |
|---|---|---|---|
| CRÍTICO | 4 | 4 | 0 |
| ALTO | 6 | 5 | 1 |
| MÉDIO | 13 | 11 | 2 |
| BAIXO / dívida | 10 | 9 | 1 |
| **Total** | **33** | **29** | **4** |
| Descartados na autocrítica | 7 | — | — |

### Os 5 problemas que mais importam agora

1. **Faturamento de e-commerce mostra o número do GA4 (bruto, atribuído) e joga fora as vendas reais da Nuvemshop** — e-commerce só-Nuvemshop fica com faturamento zerado e sem Resultado semanal (CR-1).
2. **Pipeline comercial inteiro (nomes, telefones, valores de negócio) é legível e gravável por qualquer usuário logado** — `GET/POST /api/comercial/leads` sem RBAC (CR-3).
3. **`fetchMonthlyGoals` vaza metas de FATURAMENTO/ROAS de clientes fora da carteira** a qualquer papel autenticado (CR-4).
4. **War Room dobra/triplica o faturamento** no diagnóstico porque soma `conversionValue` de todas as plataformas (CR-2).
5. **"Cliente sem meta cadastrada" é mentira**: o cron só olha meta de ROAS e mente quando existe meta de FATURAMENTO (AL-1).

---

## 2. ACHADOS CRÍTICOS

Quebram funcionalidade, vazam dados entre tenants ou corrompem métricas.

### CR-1 — Faturamento de ECOMMERCE ignora as vendas reais da Nuvemshop e usa receita bruta do GA4 — ✅ CORRIGIDO (2026-07-13, via GA4Sync)
- **Arquivo:** `src/services/health-scorer.ts:84,107,117-118` (agregação canônica); escrita descartada em `src/services/nuvemshop/sync.ts:167-172`.
- **Confiança:** CONFIRMADO.
- **Trecho:**
  ```ts
  const ga4 = snapshots.filter(x => x.platformAccount.platform === 'GA4') // :84
  const revenue = isLocalLike ? metaRevenue : ga4Revenue                   // :107 (ECOM = só GA4)
  if (metric === 'FATURAMENTO' || metric === 'SALES')
    return revenue > 0 ? revenue : null                                    // :117
  ```
- **Explicação:** `aggregateSnapshots` é a fonte canônica de "realizado" (usada por `realizado.ts`, `resultado-engine`, `progress.ts`, `dal.ts`). Para ECOMMERCE o faturamento é **exclusivamente** `Σ conversionValue` das linhas `platform='GA4'`. A Nuvemshop grava a receita REAL dos pedidos (`order.total`) numa linha `platform='NUVEMSHOP'` que cai no bucket `ads` e só é usada para `spend` (=0) — **as vendas reais são descartadas**. Ainda: o campo GA4 é `grossPurchaseRevenue` (bruto, sem estornos, `ga4/client.ts:44`). O comentário `nuvemshop/transformers.ts:5-8` ("usar receita REAL da Nuvemshop, não a estimativa do GA4") é contradito pela agregação.
- **Impacto:** (a) o faturamento exibido em `/agency`, Client 360, `/agency/metas`, relatórios e o ROAS do resultado-engine é o do GA4 (atribuído, bruto), que **diverge do faturamento real da loja**; (b) e-commerce que tem loja Nuvemshop mas **não** tem GA4 conectado fica com `FATURAMENTO = null` mesmo com pedidos sincronizados, e o `resultado-engine` grava `FALHA … sem GA4` e nunca classifica o cliente (`resultado-engine.ts:102-120`). É a "divergência de faturamento em e-commerce" relatada.
- **Correção proposta (não aplicada):** decidir a fonte de verdade da receita e-commerce (recomendo Nuvemshop real, ou net-of-refunds), e fazer `aggregateSnapshots` usar `platform='NUVEMSHOP'` para FATURAMENTO quando existir loja, com fallback GA4. Alinhar `resultado-engine` ao mesmo critério.

### CR-2 — War Room soma `conversionValue` de todas as plataformas → faturamento dobrado/triplicado — ✅ CORRIGIDO (2026-07-13)
- **Arquivo:** `src/lib/warroom/prefill.ts:34-41`.
- **Confiança:** CONFIRMADO.
- **Trecho:**
  ```ts
  const res = await prisma.metricSnapshot.aggregate({
    where: { clientId, date: { gte: start, lt: end } }, // SEM filtro de plataforma
    _sum: { spend: true, conversionValue: true },
  })
  const faturamento = Number(res._sum.conversionValue ?? 0)
  ```
- **Explicação:** um e-commerce com GA4 **e** Nuvemshop tem duas linhas de receita por dia (contas diferentes). Este `_sum` sem filtro soma as duas (e triplica se o Meta Ads trouxer `conversionValue`). O `progress.ts:130` já foi blindado com `platform:'GA4'`; o `prefill` do War Room não.
- **Impacto:** o diagnóstico automático do War Room (contas críticas — a tela de maior atenção do Marcos) mostra faturamento ~2x o real. Decisão crítica tomada sobre número inflado.
- **Correção proposta:** filtrar a plataforma canônica (mesma decisão de CR-1) ou reusar `getRealizado`/`aggregateSnapshots` em vez de `aggregate` cru.

### CR-3 — Pipeline comercial (ADMIN-only) exposto a qualquer autenticado: `GET/POST /api/comercial/leads` e `POST /api/comercial/activities` sem RBAC — ✅ CORRIGIDO (2026-07-13)
- **Arquivos:** `src/app/api/comercial/leads/route.ts:32-34` (GET), `:52-54` (POST); `src/app/api/comercial/activities/route.ts` (POST).
- **Confiança:** CONFIRMADO (lido diretamente).
- **Trecho:**
  ```ts
  export async function GET(_request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const leads = await prisma.agencyLead.findMany({ where: { deletedAt: null }, include: {...} })
    return NextResponse.json(leads) // TODO o funil comercial
  }
  ```
- **Explicação:** o guard é só `if (!session)`. A matriz RBAC reserva `comercial` ao ADMIN, e os irmãos do mesmo recurso (`leads/[id]` PATCH/DELETE e `convert`) exigem `normalizeRole(session.role) === 'ADMIN'`. Só o list, o create e o activities ficaram abertos.
- **Impacto:** qualquer GESTOR/ANALISTA/CS/SUPERVISOR logado faz `GET /api/comercial/leads` e recebe todo o funil — nomes, e-mails, telefones, `value` (valor do negócio), `probability`, `notes`. Chamada direta à rota ignora o esconde-botão da UI. Também pode injetar leads e atividades.
- **Correção proposta:** adicionar `|| normalizeRole(session.role) !== 'ADMIN'` (403) no GET, no POST de leads e no POST de activities, igual aos handlers PATCH/DELETE/convert.

### CR-4 — `fetchMonthlyGoals` vaza metas de receita cross-carteira (sem `scopeClients` nem `stripSensitive`) — ✅ CORRIGIDO (2026-07-13)
- **Arquivo:** `src/app/actions/goals.ts:134-157`.
- **Confiança:** CONFIRMADO (lido diretamente).
- **Trecho:**
  ```ts
  export async function fetchMonthlyGoals(clientIds: string[], year, month) {
    await requireSession()                       // única barreira: só autentica
    const goals = await prisma.goal.findMany({
      where: { clientId: { in: clientIds }, period: 'MONTHLY',
               metric: { in: ['FATURAMENTO','ROAS','SPEND','CPL','CPA', ...] } },
      select: { clientId: true, metric: true, targetValue: true },
    })
  ```
- **Explicação:** `clientIds` vem do chamador e vai ao `where` sem `scopeClients(role,userId)` nem `assertClientMutationAccess`. Retorna `targetValue` de FATURAMENTO/ROAS — metas de receita que `stripSensitive` remove de não-ADMIN nas leituras. É `'use server'`, invocável diretamente por qualquer sessão de staff, independentemente da UI. O irmão `createGoal` (`:225`) chama `assertClientMutationAccess`; este esqueceu.
- **Impacto:** um GESTOR chama `fetchMonthlyGoals(['<id-de-outra-carteira>'], 2026, 6)` e lê a meta de faturamento/ROAS de cliente que não deveria enxergar — vazamento cross-tenant + bypass de coluna sensível numa chamada.
- **Correção proposta:** interseccionar `clientIds` com `scopeClients(session)` antes do `findMany` e omitir métricas de receita para não-ADMIN (espelhar `getReportData`/`stripSensitive`).

---

## 3. ACHADOS ALTOS

### AL-1 — "Cliente sem meta cadastrada" mente: o cron só verifica meta de ROAS — ✅ CORRIGIDO (2026-07-13, mensagem)
- **Arquivo:** `src/services/resultado-engine.ts:65-70,135-149`. **Confiança:** CONFIRMADO.
- A query de meta filtra `metric: 'ROAS'` e o log dispara quando `target == null`. O operador tipicamente cadastra meta de **FATURAMENTO** (via `upsertMonthlyGoals`); se nunca cadastrou ROAS e o cliente não tem `roasMinimo`, o cron loga `resultado.semMetaRoas — … sem meta cadastrada` **apesar de a meta existir**. Bate com o sintoma e com o finding S1-008 (`docs/AUDITORIA_METAS_PERFORMLI.md:193`).
- **Correção:** mensagem específica ("sem meta de ROAS — usando roasMinimo" / "cadastre meta de ROAS") e/ou fallback para meta de FATURAMENTO na avaliação.

### AL-2 — `dal.ts` recalcula revenue/ROAS GA4-only para TODOS os clientes, divergindo do canônico para LOCAL/B2B — ✅ CORRIGIDO (2026-07-13)
- **Arquivo:** `src/lib/dal.ts:321-333` (e cópias em `:635-700,850,917,978,2202,2849,2959,3379`). **Confiança:** CONFIRMADO.
- `aggregateSnapshots` roteia por `businessType` (LOCAL/B2B usam Meta); a tabela operacional da DAL faz `revenue = ga4Rev` para todos. Para LOCAL/B2B o ROAS/faturamento da lista **diverge** do valor canônico de `getRealizado`. O comentário `// GA4-only — single source of truth` contradiz `health-scorer.ts:106-114`. Reintrodução do S2-014.
- **Correção:** a DAL deve chamar `aggregateSnapshots`/`getRealizadoForMetrics` em vez de recomputar inline.

### AL-3 — `realizado.ts` (fonte canônica) exclui o dia 1 do mês em todo MTD e mistura convenções de fuso — ✅ CORRIGIDO (2026-07-13, MTD; SEMANA_FECHADA/getWeekRange fica com AL-4)
- **Arquivo:** `src/lib/metas/realizado.ts:68-71,104-105,130`. **Confiança:** CONFIRMADO (verificado).
- `saoPauloDayStart('2026-07-01')` = `2026-07-01T03:00:00Z`; `MetricSnapshot.date` (`@db.Date`) volta `00:00Z`. O filtro `date: { gte: janela.start }` com `03:00Z` **exclui o snapshot do dia 1**. O portal já resolveu isso com `utcDayStart` (`portal/kpis.ts:15-21`). Além disso, o ramo MTD usa SP e o ramo SEMANA_FECHADA usa `getWeekRange` (UTC) — inconsistência interna.
- **Impacto:** MTD subestima o dia 1 de cada mês e diverge do `HealthScore` (que usa `getMonthRange`, inclui o dia 1).
- **Correção:** usar bound `${mês}-01T00:00:00.000Z` (padrão `utcDayStart`) para casar com `@db.Date`; jamais `saoPauloDayStart` como comparador de coluna `@db.Date`.

### AL-4 — `getWeekRange`/`getMonthRange` calculam a fronteira no fuso do servidor (UTC na Vercel), não em SP — ✅ CORRIGIDO (2026-07-13)
- **Arquivo:** `src/lib/utils.ts:36-53`. **Confiança:** CONFIRMADO (código); impacto ATIVO SUSPEITO.
- `getDay()`/`setHours()`/`new Date(y,m,1)` usam o runtime (UTC em produção). As janelas "viram" às 00:00 UTC = 21:00 SP do dia anterior. Usado por health-scorer, churn-scorer, weekly-goals-sync, resultado-engine, checkin-monitor. O cron das segundas roda 06:00 BRT e **escapa**; o risco se materializa em acesso **on-demand**/sync manual entre 21:00–23:59 SP. É bomba-relógio se o horário do cron mudar.
- **Correção:** derivar week/month de `saoPauloDateString(now)` e montar os bounds com aritmética UTC sobre o dia-parede SP.

### AL-5 — Webhook Nuvemshop não estorna cancelamento/reembolso (faturamento inflado intradiário) — ✅ CORRIGIDO (2026-07-13)
- **Arquivo:** `src/app/api/nuvemshop/webhooks/route.ts:137`. **Confiança:** CONFIRMADO.
- Só recalcula o snapshot quando `paymentStatus === 'PAID'`; eventos `cancelled`/`updated→REFUNDED/VOIDED` pulam o recálculo. A receita do pedido cancelado permanece até o full-sync diário; estorno de pedido de dia anterior nunca dispara recálculo daquele dia.
- **Correção:** recalcular o dia também em cancelamento/refund (ou recomputar sempre, não só em PAID).

### AL-6 — Validação de input desigual: 14 rotas + actions ADMIN sem zod — 🟡 PARCIAL (2026-07-13)
- **Corrigido (rotas internas):** `budget` (PATCH), `admin/contract-fee`, `ai/chat`,
  `ai/dashboard-chat`, `sync/ga4|meta|google-ads|nuvemshop|health`,
  `nuvemshop/reconciliation` — zod permissivo `.safeParse` + `400 { error: <pt-BR> }`.
  `admin/seed-operacao` pulado (só query params já validados defensivamente).
  Webhooks/crons validam por token/HMAC; financeiro é outra tarefa.
- **Pendente:** actions ADMIN (`goals.ts:48-70`, `updateClient.ts`).
- **Arquivos:** `sync/*`, `nuvemshop/reconciliation`, `clients/[clientId]/budget`, `ai/*`, `admin/contract-fee`, webhooks; actions `goals.ts:48-70` (`upsertMonthlyGoals` — `metric`/`clientId` crus ao Prisma), `updateClient.ts`. **Confiança:** CONFIRMADO.
- Metade do `api/*` usa zod (`comercial`, `financeiro/expenses`, `settings`, `leads/capture`), a outra metade confia no payload. Em actions ADMIN a "proteção" vira "só ADMIN chega aqui", não validação de dado.
- **Correção:** exigir schema (zod) em toda rota/action que lê body/params.

---

## 4. INCONSISTÊNCIAS

Nomenclatura, padrões, contratos, duplicações. (Funcionais primeiro.)

### Funcionais
- **F-03 — 5 convenções de retorno de action** (`throw` em `team.ts`; `{ok}|{error}` em `interactions.ts`; `{success}|{error}` em `updateClient.ts` — e `success` é campo **morto**, ninguém lê; `{ok:boolean}` em `goals.ts`; `{ok:false}|{ok:true}` em `contracts.ts`, divergindo dentro do próprio arquivo). Narrowing quebra sem erro de compilação. **CONFIRMADO.**
- **F-04 — corpo de erro `{error:string}` vs `{error:<objeto zod>}` na mesma rota** (`comercial/leads:34/59`, `leads/capture:41/108`) → front renderiza `[object Object]` no ramo de validação. **CONFIRMADO.**
- **ME-7 (B-11) — mesma falha responde 401 em `settings/*` e 403 em `admin/*`** para não-admin. 401=não autenticado, 403=sem papel. **CONFIRMADO.**
- **KPI-2 — data-base divergente:** Nuvemshop agrega por `orderCreatedAt`, GA4 por data da transação; a mesma venda cai em dias diferentes nas duas linhas. **CONFIRMADO.**

### Duplicação
- **F-01/AL-2** já contado nos ALTOS (agregação inline vs `aggregateSnapshots`).
- **F-02 — `formatCurrency` reimplementado ≥8×** (`warroom/prefill.ts:47`, `budget-monitor.ts:101`, `inadimplencia-checker.ts:44`, `asaas-task-reconciler.ts:50`, `oscillation-detector.ts:90`, `portal/format.ts:12`, `comercial/proposta.ts:16`, `ai-client-context.ts:175`) — com casas decimais divergentes. **CONFIRMADO / manutenção.**
- **B-04/B-08 — cálculo de início-de-mês (`new Date(y,m,1)`) copiado ~40× e `formatDate` 5×**, ignorando `getMonthRange`/`formatSaoPauloDateTime`. **CONFIRMADO.** 🟡 PARCIAL (2026-07-13: os 4 `monthStart` do dal.ts consolidados em getMonthRange; demais cópias/formatDate seguem pendentes).
- **B-05 — 9 clients HTTP com timeout copiado** (15s/25s/30s, dois mecanismos), sem wrapper central. **CONFIRMADO.**
- **B-07 — cores de status hardcoded em hex** (`MetasDashboard.tsx`, `MetasBulkTable.tsx`, `email-templates.ts`) + 6 mapas status→cor independentes. **CONFIRMADO.**

### Nomenclatura (cosmético)
- **F-07 — `gestor` (schema `Client.gestorId`) vs `manager` (`WeeklyChecklist.managerId`, relação `CheckinManager`)** para o mesmo papel; 112 ocorrências misturadas. **CONFIRMADO.**
- **F-08 — pastas `components/clients` (en) e `components/clientes` (pt)**; rotas pt×en no mesmo grupo; `operations` (en) **e** `operacional` (pt) como rotas distintas. **CONFIRMADO.**

### Schema × código
- **B-15 — colunas mortas** `Client.dashboardLooker` e `Client.painelEcommerce`: **0 referências** em `src` (grep). **CONFIRMADO.**
- **B-16 — models fantasmas** `OperationalRoutine` e `TaskSLA`: **0 referências**; `TaskSavedView`: só um comentário "sem action de escrita" (`OperacionalBoard.tsx:277`) — feature pela metade. **CONFIRMADO (grep).**
- **F-11 — enum `Role` com legados `MANAGER`/`ANALYST`** exige `normalizeRole` em toda fronteira; ponto que comparar `role` cru trata legado como sem-permissão. **CONFIRMADO (dívida).**
- **B-17 — lista "MODELS PRISMA EXISTENTES" do CLAUDE.md desatualizada** vs os 71 do schema. **CONFIRMADO.**

---

## 5. AUDITORIA DE ROTAS

Contexto: time pequeno, migração do ClickUp — economia > purismo. O sistema, no geral, está **bem construído** (syncs usam `Promise.all`/`allSettled`, `progress.ts` usa batch, `sync/health` é exemplar). Só **2 itens pagam refatoração de verdade**.

| Rota / action | Veredito | Problema | Alternativa | Esforço |
|---|---|---|---|---|
| `financeiro/cashflow` | **retrabalhar** | `client.count()` invariante dentro do `for` de meses (`:64-65`); meses em série | mover count p/ 1× fora; `Promise.all` dos meses | P |
| `financeiro/summary` | **retrabalhar** | 5 queries independentes em série pós-`Promise.all` (`:101,107,127,131,165`); `findMany`+reduce onde cabe `aggregate _sum` (`:49,62`); `include customer.name` morto (`:69`) | 1 `Promise.all`; findMany→aggregate; remover include | P |
| `sync/ga4`, `sync/google-ads` | aceitável (segurança) | auth com `!== CRON_SECRET` cru, não timing-safe (`ga4:29`, `google-ads:13`) — diverge de `sync/meta` (`isCronAuthorized`) | padronizar em `isCronAuthorized` | P |
| `sync/nuvemshop` | aceitável | contas em `for…await` serial vs irmãos em `Promise.all` | `Promise.all` p/ consistência (ganho raro) | P |
| `nuvemshop/callback` + `install` | aceitável | bloco "garantir webhooks" duplicado (~25 linhas) | extrair `ensureNuvemshopWebhooks()` se editar | P |
| `sync/health`, `clients/[clientId]/budget`, `team/members`, `ai/clients`, `cron/daily` | **ótima** | — | — | — |
| `comercial/leads` (GET/POST) | **retrabalhar** | falta RBAC — ver CR-3 (segurança, não perf) | guard ADMIN | P |
| `sync/meta` vs `ga4` vs `google-ads` vs `nuvemshop` | aceitável | redundância **aparente** | **NÃO unificar** (purismo — ver §7) | — |
| Demais rotas/actions | aceitável | CRUD zod / delegam a service / 1 query com select | — | — |
| `admin/seed-*` | aceitável | `for…await` — rodam 1×, N+1 irrelevante | não mexer | — |

Detalhe dos "retrabalhar" (perf real): **`financeiro/cashflow`** faz `months` counts idênticos dentro do loop — mover 1 linha; envolver o loop de `aggregate` num `Promise.all` corta latência de ~2N para 2 round-trips. **`financeiro/summary`** serializa 5 queries independentes que caberiam num `Promise.all`, e traz N linhas para somar no app (`findMany`+reduce) o que o Postgres soma de graça (`aggregate _sum`). Ambos são telas de dashboard interativas — pagam o custo.

---

## 6. INVESTIGAÇÃO DOS BUGS CONHECIDOS

### "Cliente sem meta cadastrada" (cron semanal)
**Hipótese de UTC/boundary: REFUTADA. Causa-raiz real: semântica ROAS-only (CONFIRMADA — AL-1).**

Por que UTC está refutado (prova dos dois lados):
1. `Goal.startDate` é `@db.Date` (`schema.prisma:433-434`) — Postgres descarta a hora, então criação "meio-dia UTC" (mensal) e "meia-noite UTC" (semanal) colapsam na mesma data; sem off-by-one.
2. As leituras de Goal usam **range** (`startDate: {lte}, endDate: {gte}` — `health-scorer.ts:368`, `dal.ts:56-66`), robusto a diferença de horário. A única leitura por igualdade (`weekly-goals-sync.ts:107`) usa o mesmo `getWeekRange()` na escrita e na leitura (auto-consistente).
3. O cron roda 08:00 BRT (`daily/route.ts:42`) / 06:00 BRT (`resultados`), longe da fronteira Sáb-21h-SP.

Causa real (AL-1): `resultado-engine.ts:65-70,139,149` só consulta meta de **ROAS** e loga "sem meta cadastrada" genérico quando `target == null`; como o operador cadastra FATURAMENTO, a meta existe mas não é vista. **Risco latente registrado:** `getWeekRange` TZ-naive (AL-4) é bomba-relógio se o horário do cron mudar.

### Divergência de faturamento e-commerce
**Dois problemas independentes, ambos CONFIRMADOS. A tela que você viu decide qual é.**
- **Problema B (sistêmico → CR-1):** o faturamento canônico usa GA4-only (bruto, atribuído) e descarta a receita real da Nuvemshop; e-commerce só-Nuvemshop fica zerado. Afeta `/agency`, Client 360, `/agency/metas`, relatórios e ROAS do resultado-engine.
- **Problema A (localizado → CR-2):** `warroom/prefill.ts:36` soma `conversionValue` sem filtro de plataforma → dobra/triplica no diagnóstico do War Room.

**Refutado:** dupla-soma na agregação canônica **não** ocorre — `aggregateSnapshots` só soma GA4 (a dupla contagem está isolada no `prefill`); e os upserts sobrescrevem (`update: { conversionValue: <total> }`), não incrementam, então não há acúmulo concorrente.

---

## 7. REGISTRO DA AUTOCRÍTICA

### Achados descartados / rebaixados (7)
1. **"Cliente sem meta" = bug de UTC** → REFUTADO. Coluna `@db.Date` + leituras por range + cron às 08:00 BRT tornam o off-by-one impossível no caminho ativo. Causa real é ROAS-only (AL-1).
2. **Dupla-soma GA4+Nuvemshop na agregação canônica** → REFUTADO. `aggregateSnapshots` filtra `platform='GA4'`; a dupla contagem existe só em `warroom/prefill` (CR-2), não sistemicamente.
3. **Vazamento de cache do `getClientsList` entre gestores (⚠️12 do dossiê)** → REFUTADO. `unstable_cache` (`dal.ts:456`) incorpora os **argumentos** (`userId`,`role`) na chave derivada, além dos `keyParts`; entradas de gestores distintos não colidem. Verificado no código.
4. **`admin/knowledge/upload` e `admin/seed-contracts` sem checagem ADMIN (⚠️ do dossiê)** → REFUTADO. As barreiras existem no handler (`upload:82`, `seed-contracts:47-49`), não só na UI.
5. **Upsert concorrente somando receita** → REFUTADO. Ambos os writers usam sobrescrita (`update: { conversionValue: <total recomputado> }`), não incremento.
6. **Unificar os 4 endpoints `sync/*` num só parametrizado** → REJEITADO como purismo. Importam services distintos que evoluem em ritmos diferentes; trocaria 4 arquivos legíveis por 1 `switch` com mesma quantidade de código. O único dedup que paga é extrair o helper de auth (corrige a divergência timing-safe de brinde).
7. **`meta`/`Goal` como inconsistência de nomenclatura (F-10)** → DESCARTADO pelo próprio subagente. Mapeamento consistente, sem model `Meta` paralelo; puramente cognitivo.

### Áreas com cobertura incompleta (honestidade sobre limites)
- **Frontend (`src/components/**`):** estados de erro (loading infinito, optimistic update sem rollback, `useEffect` com deps erradas) foram pouco inspecionados — foco foi lógica de dados/engines. Superfície grande não auditada.
- **Concorrência real:** pontos de `upsert` concorrente (webhook × daily-sync no mesmo `(platformAccountId,date)`) foram identificados mas não exercitados sob execução simultânea (não há testes). Marcados SUSPEITO (KPI-5, AS-2).
- **Varredura campo-a-campo dos 71 models × código** para colunas órfãs não foi exaustiva (só os casos confirmados B-15/B-16).
- **Parsing de resposta de integrações externas** (payload malformado, timeouts efetivos) não foi auditado além do ponto de gravação.

---

## 8. PLANO DE CORREÇÃO PRIORIZADO

Ordem = impacto ÷ esforço. **Nenhuma correção foi aplicada** — cada item vira um prompt/PR próprio.

### Quick wins (< 1h cada)
1. **CR-3** — guard ADMIN em `comercial/leads` (GET/POST) e `comercial/activities` (3 linhas). *Vazamento de dado.*
2. **CR-4** — `scopeClients` + strip de receita em `fetchMonthlyGoals`. *Vazamento de dado.*
3. **CR-2** — filtrar plataforma no `warroom/prefill` (1 where). *Número crítico dobrado.*
4. **AL-1** — mensagem específica de "sem meta de ROAS" (não "sem meta"). *Mentira operacional.*
5. **AL-3** — trocar `saoPauloDayStart` por bound UTC em `realizado.ts`. *Dia 1 do mês.*
6. **ME-9** — ✅ CORRIGIDO (2026-07-13) `financeiro/cashflow` (count fora do loop + meses em Promise.all) + `financeiro/summary` (Promise.all das 5 queries seriais + aggregate no lugar de findMany+reduce + include morto removido). *Latência.*
7. **ME-13** — padronizar `isCronAuthorized` em `sync/ga4` e `sync/google-ads`. *Timing-safe.*
8. **AL-5** — recalcular snapshot em cancelamento/refund no webhook Nuvemshop.

### Correções estruturais (exigem decisão de produto + refatoração)
9. **CR-1** — decidir a fonte de verdade do faturamento e-commerce (Nuvemshop real vs GA4) e centralizar em `aggregateSnapshots`; alinhar resultado-engine. *É o bug de faturamento sistêmico — decisão do Marcos sobre qual número é "o certo".*
10. **AL-2 / F-01** — fazer a DAL consumir `aggregateSnapshots` em vez de recomputar GA4-only (corrige LOCAL/B2B).
11. **AL-4** — tornar `getWeekRange`/`getMonthRange` SP-aware (desarma a bomba-relógio de fuso).
12. **AL-6 / F-06** — padronizar validação zod nas rotas/actions que hoje confiam no payload.
13. **F-03 / F-04 / ME-7** — envelope único de retorno de action e de erro de rota (`{ok}|{error}`; `{error:{code,message}}`; 401 vs 403 corretos).
14. **Dívida de schema** — remover/implementar `OperationalRoutine`, `TaskSLA`, `TaskSavedView`, `dashboardLooker`, `painelEcommerce` (migration aditiva/soft) e regenerar a lista de models do CLAUDE.md.
15. **Duplicação** — centralizar `formatCurrency`, cores de status, cálculo de mês, e um `fetchWithTimeout` único.

### Investigar antes de corrigir (SUSPEITOS)
- **ME-4 (A-04)** — churn conta semanas por entradas presentes, não calendário (pode inflar "crítico" com buraco de dados). ✅ CORRIGIDO (2026-07-13, guarda de adjacência >8d).
- **AS-2** — resultado-engine marca `resultadoWeek` antes de criar a task de plano de ação; falha parcial deixa cliente crítico sem plano, silenciosamente.
- **KPI-5** — corrida webhook × daily-sync no mesmo snapshot (last-writer-wins).
