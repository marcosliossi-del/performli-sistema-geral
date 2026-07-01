# DOSSIÊ MÃE — Performli (Sistema Operacional Interno da Arkza)

> **Fonte única da verdade do projeto.** Consolida `AUDITORIA_SISTEMA.md`,
> `docs/_audit/*.md`, `CLAUDE.md`, `PROJECT_STATE.md`, `MAPA_ARQUITETURA.md`,
> `prisma/schema.prisma` e a exploração direta do código.
> Data de referência: 2026-07-01 · "Arkza em processo, não em memória."

---

## Identidade do Projeto

- **Nome:** Performli.
- **Objetivo:** sistema operacional interno da Arkza (agência de tráfego pago,
  foco em e-commerce de moda e negócios locais, ~30 clientes ativos). Ser a
  **central de comando** da agência — uma única visão de tudo que está saudável,
  em atenção ou crítico. Frase-guia: **"Arkza em processo, não em memória."**
  Meta de negócio: tirar o Marcos do papel de "cérebro operacional" (migrar para
  CEO/comercial) sem que processos críticos quebrem silenciosamente.
- **Direção estratégica:** **substituir gradualmente o ClickUp** nas rotinas
  críticas (tarefas recorrentes, check-ins, validação CS, CRM, follow-ups,
  onboarding, gestão de clientes, war room, financeiro, contas a receber/pagar,
  contratos, comissões, visão geral). O ClickUp pode ser fonte de dados de
  transição; o estado canônico já vive no PostgreSQL. Objetivo de arquitetura:
  **reduzir** a dependência do ClickUp, nunca aumentá-la.
- **Status:** **em produção na Vercel, ativo.** Fase 2 (build) com várias fatias
  mescladas em `main` e a Central Operacional (BLOCOS 1–7) implementada.
  Redesign UX (direção Apple/iOS) aplicado. Estado geral: **saudável e maduro**.
- **Escopo (números do código):** 32 páginas em `(dashboard)` · 27 arquivos de
  server actions · 44 API routes · 41 arquivos de serviço · **64 models Prisma**
  · 46 migrations · ~42k LOC.

---

## Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Linguagem | TypeScript | `^5` (`strict: true`, target ES2017) |
| Framework | Next.js (App Router) | `16.2.1` |
| UI | React (Server Components por padrão) | `19.2.4` |
| Estilo | Tailwind CSS v4 (`@tailwindcss/postcss`) | v4 |
| ORM | Prisma + `@prisma/adapter-pg` | `^7.5.0` |
| Banco | PostgreSQL (Neon, serverless) | `pg 8` |
| Auth | JWT HS256 via `jose` em cookie httpOnly | `jose 6` |
| IA | `@anthropic-ai/sdk` | `^0.80.0` |
| Hospedagem | **Vercel** (functions + Vercel Cron) | — |

- **Modelos de IA em uso:** `claude-sonnet-4-6` (planoAcao, weekly-report,
  ai/chat, dashboard-chat, campaign-insight) e `claude-haiku-4-5-20251001`
  (actions/insights).
- **Ferramentas/config:** `eslint-config-next` (flat config), `prisma.config.ts`
  (seed via `tsx`), `vercel.json` (4 crons + `maxDuration` por rota: sync 300s,
  cron 300s, nuvemshop 60s, knowledge 120s), `next.config.ts`
  (`compress`, `poweredByHeader:false`, `optimizePackageImports`).
- **Build:** `prisma generate && npm run migrate:deploy && next build`.
  `migrate:deploy` tem 3 tentativas com backoff (12s/25s) para mitigar
  cold-start do Neon. **Type-check do build é a única defesa automática** (não
  há CI de código nem testes).
- **Dívidas de stack:** `next-auth ^5.0.0-beta.30` é dep de produção mas **não
  é importada** (auth real é `jose`) — remover. `@anthropic-ai/sdk ^0.80.0` (0.x
  com `^`) deveria ser pinado. Sem `engines.node`/`.nvmrc` (Next 16 exige Node
  ≥20.9). `dotenv` e `@types/*` deveriam ser devDependencies.

---

## Arquitetura

> Referência completa e diagramas: **`MAPA_ARQUITETURA.md`**.

**Camadas (regras materializadas no código):**

```
page.tsx / Server Component     → só apresentação, nunca fala com prisma direto
  ├─ LEITURA  → src/lib/dal.ts   (requireSession + filtro por papel/posse; cache/unstable_cache)
  └─ MUTAÇÃO  → src/app/actions/*.ts (auth + papel + posse + writeAuditLog; retorno {ok}|{error})
       ↓
Prisma (src/lib/prisma.ts, singleton) → PostgreSQL/Neon ★ FONTE DA VERDADE ★
       ↑
src/services/*  → integrações externas (Meta, GA4, Asaas, Z-API…) chamadas por crons
```

**Estrutura de diretórios (resumo):**
- `prisma/` — schema + 46 migrations aditivas/idempotentes.
- `src/middleware.ts` — guarda JWT por prefixo (`PROTECTED_PREFIX`); **exclui
  `/api`** (cada handler faz sua própria autorização).
- `src/app/(auth)/login/` — única tela pública.
- `src/app/(dashboard)/` — 32 páginas operacionais, layout único protegido.
- `src/app/api/` — 44 route handlers (cron, sync, webhooks, comercial,
  financeiro, asaas, nuvemshop, leads, ai, clients, team, settings, admin,
  whatsapp, seed, debug).
- `src/app/actions/` — 27 arquivos de mutação.
- `src/lib/` — `dal.ts` (leitura, ~3.5k linhas), `auth.ts`/`session.ts`,
  `audit.ts` (`assertClientMutationAccess` + `writeAuditLog`), `prisma.ts`,
  `knowledge-search.ts` (RAG), `pops-catalog.ts`, `toast.ts`, `whatsapp.ts`.
- `src/services/` — 41 unidades: integrações (meta-ads, google-ads, ga4,
  nuvemshop, asaas, zapi, evolution, windsor, notifications), scorers
  (health/churn), engines idempotentes (recurrence, resultado), monitores e
  escalações (`*-monitor`, `*-checker`, `*-escalation`), geradores semanais.
- `src/components/` — 108 arquivos por domínio + `ui/` (7 primitivos) + `layout/`.

**Fluxo de dados:** browser → middleware (jose HS256) → page → DAL/actions →
Prisma → PostgreSQL, com syncs escrevendo `MetricSnapshot`/`CampaignSnapshot` e
automações gravando `Alert`/`AuditLog`/`AutomationLog`. Crons (Vercel) autenticam
via `CRON_SECRET` e orquestram serviços por loop.

**ClickUp praticamente desacoplado:** só 2 referências incidentais
(`components/juridico/JuridicoPageTabs.tsx`, `api/admin/seed-contracts`).

---

## Funcionalidades

### Cockpit / Central Operacional
- **Objetivo:** visão única da agência (saudável/atenção/crítico) respondendo às
  6 perguntas de UX por card. Central de Tarefas substitui o ClickUp na operação.
- **Arquivos:** `(dashboard)/cockpit/page.tsx`, `components/cockpit/OperationalCard.tsx`,
  `LastUpdatedBadge.tsx`; `(dashboard)/operacional` (views Lista/Kanban/
  Calendário/Por Cliente/Por Gestor), `TaskDrawer`, `NovaTarefaModal`; DAL
  `getCockpitData`, `getOperacionalBoard`, `getNovaTarefaContext`.
- **Status:** em produção (Cockpit #19; Central BLOCOS 1–7 mesclados).
- **Riscos:** `getTasks`/`getOperacionalBoard` sem `take` (crescem sem limite);
  `getClientChat` faz upsert dentro de `cache()`.

### Clientes 360
- **Objetivo:** ficha completa do cliente (KPIs, histórico, saúde, campanhas,
  resultado semanal, tarefas, chat).
- **Arquivos:** `(dashboard)/clients/[slug]/page.tsx`, `components/clients/*`
  (35 arquivos), `actions/updateClient.ts`; DAL `getClientKPIs`, `getClientMetricHistory`.
- **Status:** em produção. **Maior tela do sistema.**
- **Riscos:** ~18 queries + findUnique inline por request sem cache entre
  requests; Prisma inline fora da DAL; badge "Sem dados" genérico.

### Resultado semanal automatizado (ROAS/GA4)
- **Objetivo:** para cada cliente ECOMMERCE ativo, somar faturamento GA4
  (`conversionValue`) + investimento (spend) da semana DOM–SÁB → ROAS → comparar
  com meta (Goal ROAS, default 2.0) → Resultado (Ótimo→Péssimo) e Etapa
  (Escala/Monitoramento/Otimização). Ruim/Péssimo gera Alert + Task plano de ação.
- **Arquivos:** `services/resultado-engine.ts`, `api/cron/resultados/route.ts`,
  campos aditivos em `Client` (resultado/etapa/resultadoRoas/resultadoWeek).
- **Status:** em produção (cron segunda 9h UTC). Idempotente por `resultadoWeek`,
  try/catch por cliente, AutomationLog.
- **Dependências:** sync GA4 + plataformas de anúncio.

### Ficha de CS
- **Objetivo:** NPS, relacionamento, curva do cliente (campos de saúde CS).
- **Arquivos:** `actions/fichaCs.ts`; enums no `Client`. **Status:** implementado.

### Canais / Chat interno
- **Objetivo:** chat por cliente (alinhamento interno) + telas de canais/métricas.
- **Arquivos:** `(dashboard)/canais`, `components/*/ClientChatPanel`, `actions/chat.ts`;
  models `ClientChat`, `ClientChatMessage`; DAL `getClientChat`/`getClientChannels`.
- **Status:** em produção. **Riscos:** `ensureClientChat` sem `requireSession`;
  `getClientChat` faz upsert em leitura; drawers sem focus-trap.

### Comercial / CRM
- **Objetivo:** pipeline de leads, follow-up automático, atividades.
- **Arquivos:** `(dashboard)/comercial`, `pipeline/PipelineBoard.tsx`,
  `api/comercial/{leads,activities}`, `api/leads/capture` (público),
  `services/lead-followup-checker.ts`, `actions/interactions.ts`; models
  `AgencyLead`, `AgencyActivity`.
- **Status:** em produção. **Riscos:** PATCH/POST de lead sem checagem de papel;
  `leads/capture` sem rate-limit e CORS `*`; falha silenciosa no drag (`catch {}`).

### Financeiro / DRE (entradas e saídas Asaas)
- **Objetivo:** DRE com entradas (payments→AsaasPayment), saídas
  (financialTransactions DEBIT→Expense source=ASAAS), lucro, margem, MRR,
  inadimplência, contas a pagar, fila de cobrança. **Sem dupla contagem
  (confirmado).**
- **Arquivos:** `(dashboard)/financeiro/page.tsx`, `api/financeiro/{summary,
  cashflow,expenses}`, `services/asaas/*`, `services/inadimplencia-checker.ts`;
  models Asaas + `Expense`, `FinancialCategory`.
- **Status:** em produção (FIN-19 completo). **ADMIN-only.**
- **Riscos:** 18 queries Prisma inline fora da DAL (pior caso de ownership);
  índice composto `(status,dueDate)` ausente.

### Contratos / Jurídico
- **Objetivo:** contratos, regularidade, expiração.
- **Arquivos:** `(dashboard)/juridico/page.tsx`, `actions/contracts.ts`,
  `services/contract-expiry-checker.ts`; model `Contract`. **Status:** em produção.

### War Room / Anti-churn
- **Objetivo:** protocolos de contas críticas com critério de saída, escalação
  de 3 semanas, plano espelhado em Task. Fila anti-churn.
- **Arquivos:** `actions/warRoom.ts`, `actions/antiChurn.ts`, `actions/protocols.ts`,
  `services/{warroom-monitor,warroom-escalation,antichurn-monitor,
  critical-account-detector,churn-scorer}.ts`; models `CriticalProtocol`
  (estendido), `ChurnRiskScore`, enum `WarRoomOutcome`.
- **Status:** em produção (WAR-14 #17, WAR-16 #18). **Riscos:** `protocols.ts`
  valida só auth (sem posse); sem AuditLog em churn/health.

### Check-ins e Relatórios IA por check-in
- **Objetivo:** check-in semanal por cliente com workflow de validação da CS
  (gestor preenche checklist + evidência → envia; CS aprova/solicita ajustes).
  Relatórios semanais/mensais gerados por IA. Prestação de contas (OPE-07).
- **Arquivos:** `actions/checkin.ts`, `actions/operacional.ts`,
  `services/{checkin-monitor,weekly-report-generator,weekly-checklist-generator,
  campaign-insight-generator}.ts`, `(dashboard)/{check-ins,validacoes,aceite}`;
  models `ClientWeeklyCheckin` (+enum `CheckinStatus`), `WeeklyChecklist`,
  `WeeklyReport`, `MonthlyReport`, `Task*` (validação via `TaskApproval`).
- **Status:** em produção (CSX-13 #21, OPE-06, CSX-10, OPE-07). Check-in é
  **manual**; cron é só controle interno (desacoplado).
- **Riscos:** geradores semanais sem try/catch por cliente/manager (regra 7).

### Alertas
- **Objetivo:** sinais operacionais (sync, KPI, war room, financeiro, checkin,
  antichurn). **Arquivos:** `(dashboard)/alerts`, `actions/alerts.ts`,
  `services/alert-dispatcher.ts`; model `Alert`, enum `AlertType`.
- **Status:** em produção. **Riscos:** `markAlertRead` sem escopo de posse;
  enum `AlertType` sobrecarregado.

### Base de Conhecimento / RAG
- **Objetivo:** upload de documentos, chunking, busca semântica; copiloto interno.
- **Arquivos:** `(dashboard)/knowledge`, `(dashboard)/ai-agents`,
  `lib/knowledge-search.ts`, `api/admin/knowledge/upload`, `api/ai/*`; models
  `KnowledgeDocument`, `KnowledgeChunk`, `AIConversation`, `AIMessage`,
  `ClientInsight`. **Status:** implementado.
- **Riscos:** `pdf-parse` no upload (restringir a ADMIN + limite de tamanho).

---

## Banco de Dados

**64 models** por domínio:
- **Auth/Team:** `User`, `Role`.
- **Clientes:** `Client`, `ClientAssignment`, `ClientInteraction`,
  `ClientStatusStreak`, `ClientChat`, `ClientChatMessage`, `ClientInsight`.
- **Plataformas/Métricas:** `PlatformAccount`, `MetricSnapshot`,
  `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Nuvemshop:** `NuvemshopStore`, `NuvemshopOrder`.
- **Central Operacional (Task + ~20 satélites):** `Task`, `TaskArea`, `POPProcess`,
  `POPStep`, `POPFriction`, `TaskList`, `TaskChecklistItem`, `TaskComment`,
  `TaskAttachment`, `TaskActivity`, `TaskDependency`, `TaskApproval`,
  `TaskCustomFieldDefinition/Value`, `TaskTemplate`(+Step/Field),
  `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskWatcher`,
  `TaskAuxAssignee`, `TaskSavedView`, `TaskSLA`, `OperationalRoutine`.
- **War Room:** `CriticalProtocol`, `AuditLog`, `Alert`.
- **CSX/Relatórios:** `ClientWeeklyCheckin`, `WeeklyChecklist`, `WeeklyReport`,
  `MonthlyReport`.
- **Financeiro/Asaas:** `AsaasCustomer`, `AsaasPayment`, `AsaasSubscription`,
  `AsaasTransfer`, `FinancialCategory`, `Expense`.
- **Comercial/CRM:** `AgencyLead`, `AgencyActivity`.
- **IA/RAG:** `AIConversation`, `AIMessage`, `KnowledgeDocument`, `KnowledgeChunk`.
- **Config:** `IntegrationSetting`, `Contract`, `Operation`.

**Relacionamentos / campos críticos:** `onDelete: Cascade` em dados dependentes
do `Client`; `SetNull` em vínculos opcionais (`AuditLog.actor/client`,
`CriticalProtocol.responsible`, `AsaasCustomer.client`, `Contract.responsible`).
Uniques de janela evitam duplicidade em cron: `MetricSnapshot @@unique([platformAccountId,date])`,
`ClientWeeklyCheckin @@unique([clientId,weekStart])`, `Task.idempotencyKey @unique`.
`CampaignSnapshot.adSetId @default("")` evita buraco de unicidade com NULL.

**Migrations:** 46, **100% aditivas**. As de 2026-06-30+ são idempotentes
(`DO $$ ... EXCEPTION WHEN duplicate_object`, `IF NOT EXISTS`, `ADD VALUE IF NOT
EXISTS`). Migrations antigas (init, mar–mai/2026) usam DDL cru — **não reescrever**.

**Seeds:** 7 áreas + 21 POPs, templates recorrentes (Check-in OPE-06, OPE-07),
usuários via `api/seed` (SEED_SECRET). ⚠️ Senhas default triviais
(`admin123`/`gestor123`/`analista123`).

**Pontos de atenção:** FKs soltas em `Task` (`leadId`/`contractId` String? sem
FK — sem uso hoje); campos de status como String vs enum (Asaas/Financeiro);
models órfãos reservados (`TaskSavedView`, `OperationalRoutine`, `TaskSLA`,
`TaskAutomationRule`, `AsaasTransfer`, `TaskCustomFieldDefinition`).

---

## Integrações

| Integração | Finalidade | Arquivos | Config/Env | Eventos | Timeout | Riscos |
|---|---|---|---|---|---|---|
| **Asaas** | Entradas (payments→AsaasPayment) + saídas (DEBIT→Expense) + customers/subs/transfers/balance | `services/asaas/{client,sync}`, `api/asaas/{sync,webhook}` | IntegrationSetting `ASAAS_API_KEY`,`ASAAS_SANDBOX` (fallback env); `ASAAS_WEBHOOK_TOKEN` | Webhook `asaas-access-token` **fail-closed 503** | 30s | 200 em erro sem AuditLog |
| **Nuvemshop** | Pedidos → NuvemshopOrder + MetricSnapshot | `services/nuvemshop/*`, `api/nuvemshop/{callback,webhooks}`, `api/sync/nuvemshop` | env `NUVEMSHOP_APP_*` (token por loja em DB) | Webhook HMAC-SHA256 `x-linkedstore-hmac-sha256` **fail-closed 503** | 30s | **Callback OAuth: `state` não assinado (IDOR)** |
| **GA4** | Métricas → MetricSnapshot (`conversionValue=purchaseRevenue`) | `services/ga4/*`, `api/sync/ga4` | env (Service Account JWT; fallback OAuth) | — | 30s | Credencial só em env (regra 5) |
| **Google Ads** | Métricas por campanha → MetricSnapshot | `services/google-ads/*`, `api/sync/google-ads` | env (SA JWT + dev token) | — | 30s | Credencial só em env |
| **Meta Ads** | Insights conta/campanha → MetricSnapshot | `services/meta-ads/*`, `api/sync/meta` | env `META_SYSTEM_TOKEN` (token por conta) | — | 25s | 2 fetches (`debug_token`,`me/adaccounts`) **sem timeout** |
| **Windsor** | GA4 legado (connector) | `services/windsor/*` | env `WINDSOR_API_KEY` | — | 25s | Credencial só em env |
| **Z-API** | WhatsApp envio + QR + status | `services/zapi/client.ts`, `lib/whatsapp` | IntegrationSetting `ZAPI_*` | Webhook `client-token` (opcional) | 30s | Inbound **fail-open** |
| **Evolution** | WhatsApp alternativo | `services/evolution/client.ts` | IntegrationSetting `EVOLUTION_*` | MESSAGES_UPSERT | 30s | — |
| **Anthropic** | Relatórios IA, plano de ação, copiloto, insights | `actions/planoAcao.ts`, `weekly-report-generator`, `ai/*`, `campaign-insight-generator` | env `ANTHROPIC_API_KEY` | — | via SDK | Não bloqueia build; nunca inventa métrica |

**Como testar:** rotas `api/sync/*` aceitam sessão ADMIN/MANAGER (com ownership)
**ou** `x-cron-secret`; forçar cron com `?force=1` em recurrences/resultados.
Webhooks financeiros exigem secret (503 sem env). IA depende de
`ANTHROPIC_API_KEY` em runtime.

**Extra:** `WhatsApp inbound` (`api/webhooks/whatsapp`) cria lead a partir de msg;
`leads/capture` é endpoint público (CORS `*`). Email pessoal hardcoded no
User-Agent do Nuvemshop client (`kyn.leonardo@gmail.com`).

---

## Segurança

**Autenticação:** JWT **HS256** assinado com `SESSION_SECRET`, cookie
`performli_session` **httpOnly**, `secure` em produção, `sameSite=lax`, 7 dias
(`src/lib/session.ts`). `getSecretKey()` **fail-closed** se `SESSION_SECRET`
ausente.

**Middleware:** protege páginas por prefixo; **exclui `/api`** — cada handler
autoriza por conta própria (sessão, `CRON_SECRET`, `SEED_SECRET`, assinatura de
webhook). Sem checagem de papel no middleware (só autenticação).

**Autorização (auth + papel + posse):** `ADMIN`/`CS` = `canViewAll` (leitura
ampla). `MANAGER`/`ANALYST` = escopo por `ClientAssignment` na DAL. Mutações via
`assertClientMutationAccess` (`src/lib/audit.ts`): ADMIN livre, CS só com
`allowCS`, MANAGER só cliente atribuído, ANALYST nunca muta.

**RBAC (CLAUDE.md):** ADMIN acesso total · CS leitura ampla sem mutações
indevidas · MANAGER só clientes atribuídos · ANALYST acesso limitado.

**Pontos fortes:** nenhum segredo hardcoded; webhooks Asaas/Nuvemshop fail-closed;
crons com `CRON_SECRET` fail-closed; financeiro/contratos ADMIN-only; chave Asaas
mascarada no GET; todas as ~44 rotas têm `getSession()` ou checagem de segredo.

**Vulnerabilidades da auditoria:**
- **ALTA** — `nuvemshop/callback` sem auth + `clientId` do `state` não assinado
  (IDOR/CSRF: vincula loja a cliente arbitrário).
- **ALTA** — webhook WhatsApp **fail-open** (token só validado se header vier →
  cria leads/atividades forjados).
- **MÉDIA** — `leads/capture` público sem rate-limit + CORS `*`; mutação de lead
  (`comercial/leads` PATCH/POST) sem checagem de papel; `tasks.ts`/`operations.ts`
  mutam cliente arbitrário sem posse/AuditLog; `alerts.markAlertRead`/
  `chat.ensureClientChat`/comentário/checklist do operacional sem posse.
- **BAIXA** — senhas default no seed; `String(err)` exposto no seed/settings.

**Dados sensíveis:** tokens de plataforma (por conta/loja em DB), chave Asaas,
`SESSION_SECRET`, `CRON_SECRET`, `SEED_SECRET`.

**Recomendações:** assinar/verificar `state` do OAuth + exigir sessão; tornar
webhook WhatsApp fail-closed; helper único `requireApiSession(role)`; adicionar
posse a `tasks.ts`/`operations.ts`/`markAlertRead`/`ensureClientChat`; migrar
credenciais Google/Meta/GA4/Windsor para `IntegrationSetting`.

---

## Testes

- **Automatizados: nenhum hoje.** Zero `*.test.ts(x)`/`*.spec.ts(x)`; sem runner
  (jest/vitest/playwright) instalado; sem script `test`; **sem CI**
  (`.github/workflows/` inexistente). Única defesa: type-check do `next build` na
  Vercel — sem verificação comportamental. **É a maior fragilidade estrutural.**
- **Manuais:** guardião (revisão) + Vercel CI verde antes de merge.
- **Cobertura:** 0% automatizada.
- **Fluxos críticos sem rede de segurança:** auth/RBAC (`lib/auth.ts`,
  `session.ts`, `actions/auth.ts`), mutações com posse (bypass passaria silencioso),
  `resultado-engine`/`recurrence-engine` (motores de cálculo), resiliência de cron
  (regra 7).
- **Recomendado:** Vitest + smoke test de autorização (MANAGER só cliente
  atribuído; CS não muta) + regressão do `resultado-engine`; CI mínimo
  (`npm ci` + lint + build + test).

---

## Performance

- **DAL centralizada** (~3.4k linhas); ~40 funções em `cache()` (React
  request-memoization — dedup dentro de uma request, **não** persiste entre
  requests). Só 2 pontos usam `unstable_cache`: `getClientsList` (revalidate 30)
  e `getClientMonthlyComparison` (revalidate 300).
- **`force-dynamic` global** (`(dashboard)/layout.tsx` + ~20 páginas) — decisão de
  frescor operacional: toda página SSR por request, sem Full Route Cache.
- **Pontos fortes:** índices aditivos cobrem filtros quentes; N+1 evitado
  (`getClientsList`/`getAgencyOverview`/`getManagerStats` fazem 1 query com
  `in:[...]` + agregação em Map); `Promise.all` para paralelizar; `select` enxuto;
  paginação real em `getOperations`; `loading.tsx` global mitiga cold-start.
- **Gargalos:** `getClientChat` faz **upsert dentro de `cache()`** (leitura vira
  escrita — trava de cache); Client 360 ~18 queries + 2 findUnique por request sem
  cache entre requests; `getTasks`/`getOperacionalBoard` sem `take`;
  `getManagersOverview`/`getManagerStats` com include profundo sem `take`.
- **Otimizações recomendadas:** migrar leituras derivadas do cron diário
  (histórico/comparativos/campanhas) para `unstable_cache` com revalidate diário +
  `revalidateTag` no fim da sync (mantém frescor "ao vivo" e alivia Neon).
- **Build/bundle:** `optimizePackageImports` para `lucide-react` e
  `@anthropic-ai/sdk`; `compress` on; fonte iOS sem webfont (zero download).

---

## Bugs conhecidos

| Problema | Severidade | Evidência | Recomendação |
|---|---|---|---|
| Webhook WhatsApp inbound fail-open | Alta | `api/webhooks/whatsapp/route.ts:18` | Exigir `ZAPI_CLIENT_TOKEN` (fail-closed) |
| OAuth Nuvemshop: `state` não assinado + `clientId` arbitrário (IDOR) | Alta | `api/nuvemshop/callback/route.ts:12` | Assinar/verificar state + exigir sessão+posse |
| `tasks.ts` (`createTask`/`updateTaskStatus`) sem posse/papel/AuditLog | Alta | `actions/tasks.ts:17,54` | Aplicar `assertClientMutationAccess` + AuditLog |
| `operations.ts` (`createOperation`) sem posse/AuditLog | Alta | `actions/operations.ts:17` | Aplicar posse + AuditLog |
| Geradores semanais sem try/catch por cliente/manager (regra 7) | Alta | `weekly-report-generator.ts:852`, `weekly-checklist-generator.ts:149` | Envolver loop por item em try/catch |
| Zero testes / sem CI | Alta | `.github/workflows/` ausente | Vitest + smoke auth + CI mínimo |
| Nenhuma `error.tsx` (erro derruba a tela) | Alta/Média | `src/app/` sem error boundary | Criar `error.tsx` com copy operacional |
| `getClientChat` faz upsert dentro de `cache()` | Média | `dal.ts:2233` | `findUnique` puro; mover criação p/ onboarding |
| Posse ausente (`markAlertRead`, `ensureClientChat`, comentário/checklist) | Média | `alerts.ts:7`, `chat.ts:58`, `operacional.ts:85,104` | Adicionar posse |
| `leads/capture` sem rate-limit + CORS `*` | Média | `api/leads/capture/route.ts:32,117` | Throttle + allowlist de origin |
| Mutação de lead sem checagem de papel | Média | `api/comercial/leads/[id]/route.ts:25` | Checar papel (CS sem mutação indevida) |
| Credenciais Google/Meta/GA4/Windsor só em env | Média | `services/*/client.ts` | Migrar p/ IntegrationSetting (fallback env) |
| `lastRunAt`/SyncLog só em poucos serviços | Média | `src/services/*` | Persistir SyncLog por rotina |
| AuditLog ausente em health/churn/interactions/goals | Média | `health-scorer.ts:481`, `churn-scorer.ts:151` | Adicionar `writeAuditLog` |
| Modais/drawers sem `role=dialog`/focus-trap/Esc | Média | `components/operacional/TaskDrawer.tsx` | Wrapper `Dialog` acessível |
| 2 fetches Meta sem timeout | Baixa | `services/meta-ads/client.ts:176,200` | Adicionar `AbortSignal` |
| Falha silenciosa no drag do Pipeline (`catch {}`) | Baixa | `pipeline/PipelineBoard.tsx:56` | Toast de erro + explicação |
| Senhas default triviais no seed | Baixa | `api/seed/route.ts:13` | Restringir a dev / forçar troca |

---

## Próximos Passos (priorizados)

**1 — Crítico (segurança de bordas + resiliência):**
- Tornar webhook WhatsApp fail-closed (`ZAPI_CLIENT_TOKEN`) — validar env antes do deploy.
- Assinar/verificar `state` do OAuth Nuvemshop + exigir sessão+posse.
- Aplicar posse/papel/AuditLog em `tasks.ts` e `operations.ts`.
- Envolver geradores semanais (relatório/checklist) em try/catch por cliente/manager.

**2 — Alto (rede de segurança + robustez):**
- Vitest + smoke test de autorização + regressão do `resultado-engine`; CI mínimo.
- Criar `error.tsx` (dashboard) com copy operacional + "tentar de novo".
- Corrigir `getClientChat` (upsert em leitura → findUnique).
- Posse em `markAlertRead`/`ensureClientChat`/comentário/checklist do operacional.
- Rate-limit/allowlist no `leads/capture`; checagem de papel em `comercial/leads`.

**3 — Médio (observabilidade + integrações + UX):**
- `lastRunAt`/SyncLog por rotina; AuditLog em health/churn/interactions/goals.
- Migrar credenciais Google/Meta/GA4/Windsor p/ IntegrationSetting.
- Acessibilidade de modais/drawers; `EmptyState` com CTA; `humanizeError`.
- Timeout nos 2 fetches Meta; índice composto `AsaasPayment(status,dueDate)`.

**4 — Baixo (organização/polimento):**
- Fatiar `dal.ts` monolítico; migrar 9 telas com Prisma inline → DAL.
- Resolver pastas duplicadas `clientes/`↔`clients/`; remover `next-auth`;
  pinar `@anthropic-ai/sdk`; `engines.node`/`.nvmrc`; anotar models órfãos.
- Generalizar `LastUpdatedBadge`; migrar hex → tokens semânticos.

---

## Guia para próxima sessão

**Como iniciar:**
- Ler `CLAUDE.md` (regras inegociáveis), este dossiê, `MAPA_ARQUITETURA.md`,
  `PROJECT_STATE.md` (log do maestro, append-only), `HANDOFF_PROXIMA_SESSAO.md`.
- Trabalho segue o **fluxo de agentes** (maestro → auditores read-only → GATE →
  arquitetos → GATE → agentes de escrita → guardião). Nenhum agente de escrita
  roda antes de auditoria + lacunas + arquitetura aprovadas.
- **Build não é verificável localmente** (node_modules vazio, registry npm 403).
  Gate obrigatório: **Vercel CI verde antes de qualquer merge**. Sempre em branch
  (nunca commitar direto em `main`).

**Como testar:** não há suíte automatizada. Validar por type-check do `next
build` (Vercel) + revisão do guardião. Forçar crons com `?force=1`
(recurrences/resultados). Rotas de sync aceitam sessão ADMIN/MANAGER ou
`x-cron-secret`.

**Como publicar:** merge em `main` → deploy automático Vercel (roda
`prisma generate + migrate:deploy + next build`). Migrations **sempre aditivas e
idempotentes** (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`). Só mesclar com CI verde.

**O que NÃO alterar:**
- Não reescrever migrations já aplicadas (init, mar–mai/2026).
- Não remover funcionalidade existente sem justificativa registrada (regra 12);
  `/check-ins` antigo mantido intencionalmente.
- Não criar bypass de autorização; não deixar endpoint público desprotegido;
  não hardcodar segredo.
- Não criar model novo sem justificar por que nenhum dos 64 existentes serve.
- Não quebrar deploy de produção (regra 11).
- Design system travado (tokens Arkza Apple/iOS em `docs/ux/`) — usuário deu
  autonomia total no redesign.

**Arquivos críticos:** `CLAUDE.md`, `src/lib/dal.ts`, `src/lib/audit.ts`,
`src/lib/session.ts`, `src/middleware.ts`, `prisma/schema.prisma`, `vercel.json`,
`src/app/actions/*`, `src/services/{recurrence-engine,resultado-engine,
health-scorer,churn-scorer}.ts`, `src/lib/pops-catalog.ts`.

**Cuidados:** toda leitura pela DAL; toda mutação valida auth+papel+posse e grava
AuditLog; toda chamada externa com timeout; loops de cron com try/catch por
cliente; toda rotina registra `lastRunAt`; toda tela com dado crítico mostra
última atualização; cada tela/card responde às **6 perguntas de UX**; linguagem
**operacional**, nunca técnica; nenhuma tarefa concluída sem **evidência mínima**.
