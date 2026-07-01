# DOSSIÊ MÃE — Performli (Sistema Operacional Interno da Arkza)

> **Fonte única da verdade do projeto.** Consolida as 10 auditorias em `docs/_audit/*.md`,
> a `AUDITORIA_SISTEMA.md`, `CLAUDE.md`, `AGENTS.md`, `PROJECT_STATE.md` e `README.md`,
> confirmados contra `src/` e `prisma/`.
> Data: 2026-07-01 · Escopo real: 34 páginas, ~45 API routes, 27 arquivos de actions,
> ~30 serviços, 64 models Prisma, 38 enums, 44 migrations, ~41k LOC.

Documentos irmãos: `AUDITORIA_SISTEMA.md` (achados por dimensão), `MAPA_ARQUITETURA.md`
(diagrama de camadas), `HANDOFF_PROXIMA_SESSAO.md` (guia da próxima sessão).

---

## 1. Identidade do Projeto

O **Performli** é o sistema operacional interno da **Arkza** — agência de tráfego pago
focada em e-commerce de moda e negócios locais, com **~30 clientes ativos**. A missão é
transformá-lo na **central de comando** da agência: uma única tela onde o Marcos entende
a agência inteira, o que está saudável, em atenção, crítico, e o que pode quebrar
silenciosamente.

- **Frase-guia:** *"Arkza em processo, não em memória."*
- **Objetivo de negócio:** tirar o Marcos do papel de "cérebro operacional" (memória,
  WhatsApp, planilhas soltas, cobrança manual) e liberá-lo para CEO/comercial sem que
  processos críticos quebrem.
- **Direção estratégica (ClickUp):** o Performli deve **substituir gradualmente o ClickUp**
  nas rotinas críticas (tarefas recorrentes, check-ins, validação CS, CRM, follow-ups,
  onboarding, gestão de clientes, War Room, financeiro interno, contratos, comissões,
  visão geral). PostgreSQL é a **fonte canônica**; o ClickUp é apoio temporário. A auditoria
  confirma que o ClickUp já está **praticamente desacoplado** — só aparece como rótulo de UI
  (`JuridicoPageTabs.tsx`) e num seed one-off (`api/admin/seed-contracts`). Não há SDK ClickUp
  em runtime; não há dívida de arquitetura para o desligamento futuro.
- **Estrutura operacional:** 21 POPs em 7 áreas (CAP, ONB, OPE, CSX, WAR, CRM, FIN),
  priorizados pelo score 0.30 (peso máximo em "dependência do Marcos" e "risco de falha
  silenciosa"). Desenvolvido por fatias verticais via um pipeline de subagents
  (maestro → auditor/mapeador/lacunas → arquitetos → build → guardião).

---

## 2. Stack Técnica (versões reais do `package.json`)

- **Framework:** `next@16.2.1` (App Router), `react@19.2.4`, `react-dom@19.2.4`, `typescript@^5` (strict).
- **ORM/DB:** `prisma@^7.5.0`, `@prisma/client@^7.5.0`, `@prisma/adapter-pg@^7.5.0`, `pg@^8.20.0`, PostgreSQL (Neon).
- **Auth:** JWT via `jose@^6.2.2` + `bcryptjs@^3.0.3`. (`next-auth@^5.0.0-beta.30` presente mas aparentemente **órfão** — remover.)
- **IA:** `@anthropic-ai/sdk@^0.80.0`.
- **UI:** Tailwind v4 (`tailwindcss@^4`, `@tailwindcss/postcss@^4`), Radix UI, `lucide-react@^0.577.0`, `recharts@^3.8.0`, `@hello-pangea/dnd@^18.0.1`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- **Outros:** `resend@^6.9.4` (e-mail), `pdf-parse@^2.4.5` (RAG), `server-only`, `dotenv`.
- **Build:** `prisma generate && npm run migrate:deploy && next build` — `migrate:deploy` com 2 retries (12s/25s) para cold-start do Neon.
- **Deploy:** Vercel. `vercel.json` define 4 crons e `maxDuration` por rota (sync/cron 300s, nuvemshop 60s, knowledge 120s).
- **Ausentes:** sem test runner, sem CI (`.github/workflows`), sem `engines.node`.

---

## 3. Arquitetura (resumo)

Next.js 16 App Router com dois route groups: `(auth)/login` (público) e `(dashboard)/*`
(~30 telas). Três camadas de dados:

- **Leitura:** `page.tsx` → `src/lib/dal.ts` (monólito de 3.477 linhas, `import 'server-only'`,
  `requireSession` via `cache()`, `unstable_cache` pontual) → Prisma.
- **Mutação:** page/componente → `src/app/actions/*.ts` (27 arquivos) → Prisma. Posse
  centralizada em `assertClientMutationAccess` (`src/lib/audit.ts:17`) + `writeAuditLog`.
- **Rotina:** `src/app/api/cron/*` → `src/services/*` (~30 serviços/engines) → Prisma.

Integrações isoladas por provedor em `src/services/{meta-ads,google-ads,ga4,nuvemshop,asaas,evolution,zapi,windsor,notifications}`.
Guarda de borda em `src/middleware.ts` (JWT `jose`, allowlist de prefixos). Fonte da verdade: PostgreSQL.

Detalhe de camadas e fluxos em **`MAPA_ARQUITETURA.md`**.

---

## 4. Funcionalidades (por módulo)

### Cockpit — `/(dashboard)/cockpit`
- **Objetivo:** tela-comando única; cada card responde às 6 perguntas de UX (o quê / o que está errado / ação / responsável / prazo / impacto).
- **Arquivos:** `cockpit/page.tsx`, `components/cockpit/OperationalCard.tsx`, `LastUpdatedBadge.tsx`; DAL agrega sinais.
- **Fluxo:** page → DAL (Promise.all de agregados) → cards de severidade critical/warning/ok.
- **Status:** EM PRODUÇÃO (merged #19). Referência de UX operacional do projeto.
- **Riscos:** `LastUpdatedBadge` (regra 10) só aparece aqui, não nas demais telas críticas.

### Central de Tarefas / Operacional — `/(dashboard)/operacional`, `/tasks`, `/meu-dia`, `/minha-semana`
- **Objetivo:** hub que substitui o ClickUp (hierarquia Área→POP→Lista→Tarefa, recorrência, automação, validação CS).
- **Arquivos:** `operacional/page.tsx`, `components/operacional/OperacionalBoard.tsx`, `TaskDrawer.tsx`, `NovaTarefaModal.tsx`; `actions/operacional.ts`, `actions/tasks.ts`; DAL `getOperacionalBoard`/`getNovaTarefaContext`/`getMinhaSemana`.
- **Fluxo:** 5 views (Lista/Kanban/Calendário/Por Cliente/Por Gestor) + drawer com checklist obrigatório, evidência e workflow de validação da CS (AGUARDANDO_CS → CONCLUIDO/AJUSTES_SOLICITADOS).
- **Status:** EM PRODUÇÃO (BLOCOs 1–6 merged #24–#26). Design iOS/Apple.
- **Riscos:** `createTask`/`updateTaskStatus` (`tasks.ts:17/54`) sem posse/AuditLog (CRÍTICO); `getTasks`/`getOperacionalBoard` sem paginação; drawer sem `role="dialog"`/focus-trap; erros técnicos crus na UI.

### Clientes / Client 360 — `/(dashboard)/clients`, `/clients/[slug]`
- **Objetivo:** visão única do cliente (KPIs, histórico, metas, saúde, resultado semanal, chat, tarefas).
- **Arquivos:** `clients/[slug]/page.tsx` (~17 queries em Promise.all), `components/clients/*` (e a pasta duplicada `components/clientes/`), DAL `getClientKPIs`/history/pace.
- **Status:** EM PRODUÇÃO. Surfacing de Resultado/Etapa (badge colorido + ROAS).
- **Riscos (ALTO perf):** 17 queries por request sem `unstable_cache` nem `loading.tsx` → tela branca no cold-start do Neon; `getClientChat` faz `upsert` (escrita) dentro do render; pasta duplicada pt/en.

### Ficha de CS — campos manuais no `Client` + `/validacoes`
- **Objetivo:** dimensões de relacionamento preenchidas pela CS (NPS, relacionamento, curva ABC, feedback negativo) e fila de validação dedicada (CSX-10).
- **Arquivos:** enums `ClientNps`/`ClientRelacionamento`/`ClientCurva` + campos no `Client` (schema:138-143, migration `20260701010000_client_ficha_cs`); `actions/fichaCs.ts` (usa posse — bom); `validacoes/page.tsx`, `components/ValidationQueue`, DAL `getValidationQueue`.
- **Status:** EM PRODUÇÃO. `fichaCs.ts` segue o padrão completo de posse/AuditLog.
- **Riscos:** `/validacoes` sem `loading.tsx`.

### Central de Comunicação / Canais — `/(dashboard)/canais`, ClientChat
- **Objetivo:** alinhamento por cliente (chat interno) + digest/WhatsApp.
- **Arquivos:** `canais/page.tsx`, `components/*/ClientChatPanel`; models `ClientChat`/`ClientChatMessage`; envio via Evolution/Z-API; `services/notifications/daily-digest.ts`.
- **Status:** EM PRODUÇÃO. Estados vazios operacionais bons ("abra o canal para iniciar o alinhamento").
- **Riscos:** dois clients WhatsApp coexistindo (Evolution vs Z-API) — definir canal canônico; `ClientChatPanel` sem focus-trap.

### Comercial / CRM — `/(dashboard)/comercial`, `/pipeline`, `/comercial/dashboard`
- **Objetivo:** pipeline comercial, leads, atividades, follow-up (CAP-01).
- **Arquivos:** `comercial/page.tsx`, `pipeline/page.tsx`; `api/comercial/leads/*`, `api/leads/capture`; `actions/interactions.ts`; models `AgencyLead`/`AgencyActivity`; `services/lead-followup-checker.ts`.
- **Status:** EM PRODUÇÃO. Follow-up automático gera Task idempotente.
- **Riscos (ALTO/CRÍTICO):** `comercial/page.tsx` usa Prisma direto **sem `requireSession`** (qualquer papel vê todos os leads); `interactions.ts:31/47` muta pipeline/CRM de qualquer cliente sem posse; `api/comercial/leads` POST aceita qualquer papel; `api/leads/capture` público com CORS `*` e sem rate-limit.

### Financeiro — `/(dashboard)/financeiro`, `/juridico`
- **Objetivo:** DRE (entradas/saídas, lucro, margem, MRR, inadimplência), contas a pagar (Expense), fila de cobrança, contratos (FIN-19/20/21).
- **Arquivos:** `financeiro/page.tsx` (18 queries Prisma inline), `juridico/page.tsx`, `api/financeiro/*`, `api/asaas/*`; `actions/contracts.ts`; models `Asaas*`, `Expense`, `Contract`, `FinancialCategory`; `services/inadimplencia-checker.ts`.
- **Status:** EM PRODUÇÃO (FIN-19 completo desde antes; merged #20).
- **Riscos (CRÍTICO):** `contracts.ts:20/84/143` cria/altera dados financeiros só com `requireSession()` (sem papel/posse/AuditLog); `financeiro/page.tsx` fura a DAL com 18 queries inline; webhook Asaas fail-open.

### War Room / Anti-churn — `/(dashboard)/anti-churn`
- **Objetivo:** contas críticas com plano, critério de saída, escalação de 3 semanas (WAR-14/15/16); scoring de churn.
- **Arquivos:** `anti-churn/page.tsx`, `components/*/WarRoomPlanPanel`; `actions/warRoom.ts` (**referência de ouro** — auth+papel+posse+AuditLog+retorno tipado), `actions/protocols.ts`, `actions/antiChurn.ts`; model `CriticalProtocol` (+`AuditLog`, enum `WarRoomOutcome`); `services/{warroom-escalation,warroom-monitor,churn-scorer,critical-account-detector}.ts`.
- **Status:** EM PRODUÇÃO (merged #17/#18). War Room conectado ao Task (tarefa-espelho idempotente).
- **Riscos (CRÍTICO):** `protocols.ts:8/36` encerra/edita War Room de qualquer cliente sem posse/AuditLog (conhecido no PROJECT_STATE); `churn-scorer`/`critical-account-detector` sem try/catch por cliente; drawers sem focus-trap.

### Relatórios IA — `/(dashboard)/reports`, `/ai-agents`, `/knowledge`
- **Objetivo:** relatórios semanais/mensais por IA, plano de ação (BLOCO 7.2), chat/copiloto, RAG na base de conhecimento.
- **Arquivos:** `reports/page.tsx`, `api/ai/{chat,dashboard-chat}`, `actions/planoAcao.ts`, `actions/insights.ts`, `services/weekly-report-generator.ts`, `campaign-insight-generator.ts`, `lib/ai-client-context.ts`, `knowledge-search.ts`; models `WeeklyReport`/`MonthlyReport`/`AIConversation`/`KnowledgeDocument`/`KnowledgeChunk`.
- **Status:** EM PRODUÇÃO. `generatePlanoAcao` valida papel+posse e usa dados reais (não inventa métrica).
- **Riscos (CRÍTICO runtime):** model ID `claude-sonnet-4-6` (inexistente no catálogo Anthropic) em `api/ai/chat/route.ts:158` e `weekly-report-generator.ts` → 404 silencioso; clientes Anthropic sem timeout (viola regra 6); `apiKey` inconsistente entre 7 instâncias; `reports` sem `loading.tsx`.

### Crons / Automação — `src/app/api/cron/*`
- **Objetivo:** rotinas recorrentes idempotentes e resilientes.
- **Rotas:** `daily` (~20 passos, 08:00 BRT), `digest` (WhatsApp, 08:30), `recurrences` (templates de tarefa), `resultados` (ROAS/GA4 semanal, segunda).
- **Arquivos:** `api/cron/{daily,digest,recurrences,resultados}/route.ts`; engines `recurrence-engine.ts`/`resultado-engine.ts` (**exemplares**: idempotência + AutomationLog + `lastRunAt`); serviços com try/catch por item: warroom-*, inadimplencia, lead-followup, task-escalation, antichurn-monitor, checkin-monitor.
- **Status:** EM PRODUÇÃO. Todos exigem `CRON_SECRET` (fail-closed). Daily tem try/catch por passo.
- **Riscos (ALTO):** 8 loops "all" sem try/catch **por cliente** (health-scorer, churn-scorer, oscillation-detector, budget-monitor, critical-account-detector, contract-expiry-checker, weekly-report-generator, weekly-checklist-generator) — um cliente derruba o lote; `summary` do daily não é persistido (sem `lastRunAt`/SyncLog no nível da rotina).

---

## 5. Banco de Dados

**64 models, 38 enums, 44 migrations** (`prisma/schema.prisma`, ~1.582 linhas). Domínios:

- **Auth/Team:** `User` (enum `Role`: ADMIN/MANAGER/ANALYST/CS).
- **Clientes:** `Client` (acumula campos derivados: resultado, etapa, ficha CS), `ClientAssignment`, `ClientInteraction`, `ClientStatusStreak`, `ClientInsight`, `ClientChat`/`ClientChatMessage`.
- **Plataformas/Métricas:** `PlatformAccount`, `MetricSnapshot`, `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Central Operacional (maior domínio, ~24 models):** `Task` + satélites `TaskArea`, `POPProcess`, `POPStep`, `POPFriction`, `TaskList`, `TaskTemplate`(+Step/Field), `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskChecklistItem`, `TaskComment`, `TaskAttachment`, `TaskActivity`, `TaskDependency`, `TaskApproval`, `TaskCustomFieldDefinition`/`Value`, `TaskSavedView`, `TaskSLA`, `TaskAux/Watcher`, `OperationalRoutine`.
- **War Room:** `CriticalProtocol` + `AuditLog` (transversal, append-only).
- **CSX/Relatórios:** `WeeklyChecklist`, `ClientWeeklyCheckin`, `WeeklyReport`, `MonthlyReport`, `Operation`.
- **Integrações:** `NuvemshopStore`/`NuvemshopOrder`, `IntegrationSetting`, `AIConversation`/`AIMessage`, `KnowledgeDocument`/`KnowledgeChunk`.
- **Financeiro:** `AsaasCustomer`/`Payment`/`Subscription`/`Transfer`, `FinancialCategory`, `Expense`, `Contract`.
- **CRM:** `AgencyLead`, `AgencyActivity`.

**Destaques/relacionamentos:** filhos de `Client`/`Task` com `onDelete: Cascade`, refs fracas com `SetNull` (`AuditLog.actor`, `CriticalProtocol.responsible`, `Contract.responsible`); `idempotencyKey @unique` em `Task`; `lastRunAt` em `TaskRecurrenceRule`; `@@unique([platformAccountId, date])` / `@@unique([clientId, weekStart])`; `AuditLog` com 4 índices compostos.

**Estado das migrations:** aditivas e idempotentes a partir de `20260630*` (`ADD COLUMN IF NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, guardas `EXCEPTION WHEN duplicate_object` — ex. `20260630170000_central_operacional_bloco1` com 101 guardas). Migrations antigas (ex. `20260324230442_add_cac_metric_type`) usam `ALTER TYPE ADD VALUE` sem `IF NOT EXISTS` → falham em replay de banco novo (histórico imutável; não corrigir, registrar).

---

## 6. Integrações

Zero segredo hardcoded — credenciais via `IntegrationSetting` (troca sem redeploy) ou `process.env`.

| Integração | Finalidade | Arquivos | Credenciais | Como testar | Riscos |
|---|---|---|---|---|---|
| **Meta Ads** | Insights conta/campanha (Graph v22) | `services/meta-ads/{client,sync,transformers}.ts`, `api/sync/meta` | `PlatformAccount.accessToken` ou `META_SYSTEM_TOKEN`; `META_APP_ID/SECRET` | `api/sync/meta` (ADMIN) | `validateToken`/`getAdAccounts` sem timeout; token de sistema global (se vazar, expõe tudo) |
| **Google Ads** | Relatório diário (v17, SA JWT) | `services/google-ads/*`, `api/sync/google-ads` | `GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | `api/sync/google-ads` | client sem timeout (token+search) |
| **GA4** | Relatório diário + itens (Data API v1beta) | `services/ga4/*`, `api/sync/ga4`, `api/debug/ga4` | `GOOGLE_SERVICE_ACCOUNT_*` ou `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` | `api/sync/ga4`; `api/debug/ga4` (ADMIN) | client sem timeout; `debug/ga4` exposto em prod ("remover após diagnóstico") |
| **Nuvemshop** | Pedidos, OAuth, webhooks | `services/nuvemshop/*`, `api/nuvemshop/*` | `NUVEMSHOP_APP_ID/SECRET/USER_AGENT`; token por loja em DB | `api/nuvemshop/install`/`callback`; `docs/nuvemshop-instalacao.md` | client sem timeout; webhook HMAC opcional (fail-open); `install` público cria Client sem sessão (CRÍTICO); User-Agent com email pessoal |
| **Asaas** | Cobranças, assinaturas, saldo, webhook | `services/asaas/{client,sync,types}.ts`, `api/asaas/*`, `settings/asaas` | `IntegrationSetting` `ASAAS_API_KEY`/`ASAAS_SANDBOX`; `ASAAS_WEBHOOK_TOKEN` | `api/asaas/sync`; POST `settings/asaas` testa a chave | **tem timeout (bom)**; webhook token opcional (fail-open, dinheiro em risco) |
| **Z-API** (WhatsApp) | Envio texto/QR/status; recebe leads | `services/zapi/client.ts`, `api/webhooks/whatsapp` | `ZAPI_INSTANCE_ID/TOKEN/CLIENT_TOKEN` | `api/whatsapp/test-digest`, `settings/whatsapp` | client **sem timeout**; webhook client-token opcional (spam de leads) |
| **Evolution** (WhatsApp) | Envio/QR/status (Baileys) | `services/evolution/client.ts` | `EVOLUTION_URL/KEY/INSTANCE` | via digest/canais | client **sem timeout**; duplicidade com Z-API |
| **Windsor.ai** | Fonte alternativa GA4 | `services/windsor/{client,transformers}.ts` | `WINDSOR_API_KEY` | via sync GA4 | **tem timeout (bom)** |
| **Anthropic** | IA (relatórios, plano de ação, chat, RAG) | `api/ai/*`, `actions/{planoAcao,insights}.ts`, `services/weekly-report-generator.ts` | `ANTHROPIC_API_KEY` | acionar feature de IA | **model ID `claude-sonnet-4-6` inválido → 404**; sem timeout; apiKey inconsistente entre 7 instâncias |
| **ClickUp** | Apenas rótulo de UI + seed one-off | `JuridicoPageTabs.tsx`, `api/admin/seed-contracts` | — | — | **já desacoplado** — sem cliente em runtime |

---

## 7. Segurança

- **Auth:** JWT HS256 assinado com `SESSION_SECRET`, cookie httpOnly `performli_session` (`secure` em prod, `sameSite: lax`, 7 dias). `algorithms: ['HS256']` fixado (evita `alg:none`). Senha via `bcryptjs.compare`, checa `user.active`.
- **RBAC:** enum `Role` ADMIN/CS/MANAGER/ANALYST. Helper canônico `assertClientMutationAccess` (`src/lib/audit.ts:17`) implementa a regra corretamente — ADMIN tudo, CS só com `allowCS`, MANAGER só clientes atribuídos (`ClientAssignment`), ANALYST nunca. Usado quando presente, mas **não uniformemente**.
- **Middleware (`src/middleware.ts`):** allowlist `PROTECTED_PREFIX`; matcher **exclui `/api`** → cada rota de API valida a própria sessão. Modelo frágil (deny-by-default seria mais seguro); raiz `/` não está em nenhuma lista.
- **Crons:** todos fail-closed (`CRON_SECRET` obrigatório).

**Vulnerabilidades abertas:**
- 🔴 **Bypass de autorização** — 6 mutações client-scoped só com `requireSession()` (updateClient, interactions, contracts, goals, budget route, protocols). Qualquer papel muta cliente não atribuído.
- 🔴 **Webhooks fail-open** — Asaas, WhatsApp e Nuvemshop só validam assinatura *se o secret existir*.
- 🔴 **`nuvemshop/install` público** cria Client/PlatformAccount sem sessão.
- 🟠 **`/api/seed`** cria admin `admin123` (senhas fixas), sem guarda `NODE_ENV`.
- 🟠 **`/api/debug/ga4`** em produção (vaza dados de terceiros).
- 🟠 **`/api/leads/capture`** CORS `*` reflexivo, sem rate-limit; sem proteção brute-force no login.

---

## 8. Testes

**Estado atual: sem cobertura automatizada.** Nenhum `*.test.ts(x)`/`*.spec.ts(x)`, nenhum
test runner em `package.json` (`@playwright/test` só como dependência transitiva), sem script
`test`, sem CI (`.github/workflows` inexistente). Única defesa: `npm run build` (type-check +
migrate) no Vercel — não valida comportamento. Regras #11/#12 dependem 100% de revisão manual.

**Recomendação:** Vitest + (1) teste de fumaça de auth/posse (`assertClientMutationAccess`:
MANAGER só muta cliente atribuído, CS não muta, ANALYST nunca); (2) teste de regressão numérica
de `resultado-engine`/`recurrence-engine`; (3) CI mínimo `npm ci + lint + build + test` como gate
antes do guardião; (4) norma: nenhuma fatia "concluída" sem ≥1 teste de fumaça no fluxo crítico
(operacionaliza a regra #14 para código).

---

## 9. Performance

- **Padrões:** DAL memoizada com `cache()` (per-request); `Promise.all` consistente (sem loops `await` sequenciais sobre clientes); Server Components por padrão; Prisma singleton; agregações com 1 query + reduce em memória; `MetricSnapshot`/`HealthScore` bem indexados; `Operation` paginado.
- **Gargalos:**
  - 🔴 **`force-dynamic` global** no `(dashboard)/layout.tsx` — nenhuma rota usa cache de rota; cada request acorda o Neon (cold-start ~300ms–1s) e re-roda tudo.
  - 🔴 **Client 360** dispara ~17 queries por request sem `unstable_cache` nem `loading.tsx` → tela branca.
  - 🟠 `getManagerStats`/`getManagersOverview` carregam todos os clientes com includes profundos sem `take` (query mais cara, sem cache).
  - 🟠 `getClientChat` faz `upsert` (escrita) dentro do fetch da página.
  - 🟠 `unstable_cache` usado em só 2–3 funções; `ClientHealthGrid` usa `<img>` (sem `next/image`).
  - 🟢 `getTasks`/`getOperacionalBoard` sem paginação; índices faltando em `SyncLog`, `Client(status/pipelineStage)`, `AgencyLead(status, deletedAt)`.

---

## 10. Bugs / Dívidas conhecidas

| Problema | Severidade | Evidência (arquivo) | Recomendação |
|---|---|---|---|
| 6 mutações client-scoped sem papel/posse | 🔴 Crítico | `actions/{updateClient,interactions,contracts,goals,protocols}.ts`, `api/clients/[clientId]/budget/route.ts` | Inserir `assertClientMutationAccess` + `writeAuditLog` |
| Webhooks fail-open (validam só se secret existe) | 🔴 Crítico | `api/{asaas/webhook,webhooks/whatsapp,nuvemshop/webhooks}` | Fail-closed: 401 se secret de prod ausente |
| `nuvemshop/install` público cria Client sem sessão | 🔴 Crítico | `api/nuvemshop/install/route.ts:21` | Exigir auth ou `state` assinado |
| Model ID de IA inexistente (`claude-sonnet-4-6`) → 404 silencioso | 🔴 Crítico | `api/ai/chat/route.ts:158`, `weekly-report-generator.ts` | Trocar por alias válido (`claude-sonnet-4-5`); validar `claude-haiku-4-5` |
| `comercial/page.tsx` sem `requireSession`/posse | 🔴 Alto | `(dashboard)/comercial/page.tsx:3,11` | Mover leitura p/ DAL com sessão + filtro RBAC |
| 8 loops de cron "all" sem try/catch por cliente | 🔴 Alto | `services/{health-scorer:477,churn-scorer:147,oscillation-detector:199,budget-monitor:36,critical-account-detector:46,contract-expiry-checker:25,weekly-report-generator:945,weekly-checklist-generator:57}` | Envolver corpo do loop por item, acumular erros no summary |
| Timeout ausente em clients externos | 🔴 Alto | `services/{evolution,zapi,ga4,google-ads,nuvemshop,meta-ads}/client.ts` | `AbortSignal.timeout()` (padrão já em asaas/meta/windsor) |
| `force-dynamic` global + Client 360 sem cache | 🔴 Alto | `(dashboard)/layout.tsx`, `clients/[slug]/page.tsx:131` | Remover force-dynamic do layout; `unstable_cache` seletivo |
| 25 de ~34 rotas sem `loading.tsx` | 🟠 Alto | `app/(dashboard)/{aceite,alerts,anti-churn,check-ins,clients/[slug],pipeline,reports,validacoes,...}` | Plugar `PageSkeleton` existente |
| `/api/seed` senhas fixas + `/api/debug/ga4` em prod | 🟠 Alto | `api/seed/route.ts:5-16`, `api/debug/ga4/route.ts` | Guard `NODE_ENV!=='production'`; senhas via env |
| `leads/capture` CORS `*` sem rate-limit | 🟠 Médio | `api/leads/capture/route.ts:32,117` | Rate-limit por IP + allowlist de origins |
| Anthropic sem timeout / apiKey inconsistente | 🟠 Médio | 7 instâncias de `new Anthropic()` | Centralizar em `lib/anthropic.ts` (timeout+maxRetries) |
| Alertas criados sem AuditLog | 🟠 Médio | `services/{critical-account-detector,budget-monitor,contract-expiry-checker}.ts` | `writeAuditLog` junto do Alert (regra 8) |
| Sem `lastRunAt`/SyncLog no nível das rotinas do daily | 🟠 Médio | `api/cron/daily/route.ts` | Persistir summary em SyncLog/AutomationLog (regras 9/10) |
| `Task.assignedTo` onDelete Cascade apaga histórico | 🟠 Médio | `prisma/schema.prisma:719` | Cascade→SetNull (coluna nullable) |
| `Task.leadId`/`contractId` FK lógica sem constraint | 🟠 Médio | `schema.prisma:678-679` | Formalizar FK com SetNull (após backfill) |
| 9 telas furam a DAL (Prisma inline) | 🟠 Médio | `financeiro`(18 queries), `juridico`, `anti-churn`, `clients`, `alerts`, `agency/metas`, `comercial` | Mover leitura p/ DAL por fatia |
| Modais/drawers sem `role="dialog"`/focus-trap/Esc | 🟠 Médio | `TaskDrawer.tsx`, `TaskFormModal.tsx`, `ClientChatPanel`, drawers anti-churn | Wrapper Dialog acessível |
| Erros técnicos crus na UI | 🟠 Médio | `TaskDrawer.tsx` (`setActionError(r.error)`) | `humanizeError()` → mensagem operacional |
| Estados vazios sem CTA (pergunta 3) | 🟢 Baixo | `managers:109`, `team:49`, `operations:83` | Componente `EmptyState` com ação obrigatória |
| Índices de DB faltando (aditivos) | 🟢 Baixo | `schema.prisma` (SyncLog, Client.status/pipelineStage, AgencyLead) | `CREATE INDEX IF NOT EXISTS` via migration |
| `LastUpdatedBadge` só no Cockpit (regra 10) | 🟢 Baixo | `components/cockpit/LastUpdatedBadge.tsx` | Generalizar p/ client 360/reports/financeiro |
| Sem testes nem CI | 🟢 Baixo | `package.json`, `.github/` | Vitest + workflow lint+build+test |
| README de setup ausente / `next-auth` órfão / `@types` em deps | 🟢 Baixo | `README.md`, `package.json` | README "Rodar o app"; remover next-auth; mover types p/ dev |
| Pastas `clientes/` vs `clients/` duplicadas | 🟢 Baixo | `src/components/` | Consolidar convenção `clients` |

---

## 11. Próximos Passos priorizados

**🔴 Crítico (trava de merge — segurança/regras inegociáveis)**
1. Inserir `assertClientMutationAccess` + `writeAuditLog` nas 6 mutações client-scoped (updateClient, interactions, contracts, goals, budget route, protocols).
2. Fail-closed nos 3 webhooks (Asaas, WhatsApp, Nuvemshop).
3. Autenticar/validar `state` em `nuvemshop/install`.
4. Corrigir model ID de IA (`claude-sonnet-4-6` → `claude-sonnet-4-5`) — quebra silenciosa das features de IA.
5. `requireSession` + RBAC em `comercial/page.tsx`.

**🟠 Alto (robustez/observabilidade)**
6. try/catch por cliente nos 8 loops de cron batch.
7. Timeout em todos os clients externos (Evolution, Z-API, GA4, Google Ads, Nuvemshop, métodos crus do Meta); centralizar Anthropic com timeout.
8. Remover `force-dynamic` global; `unstable_cache` no Client 360/managers/cockpit.
9. Plugar `loading.tsx` nas ~25 rotas restantes.
10. Guard `NODE_ENV` em `/api/seed` e `/api/debug/ga4`; senhas do seed via env; rate-limit no login e `leads/capture`.
11. Persistir `lastRunAt`/SyncLog do daily; AuditLog nos alertas.

**🟡 Médio**
12. Índices aditivos (SyncLog, Client, AgencyLead); Task.assignedTo → SetNull; formalizar FKs de Task.
13. Migrar 9 telas para a DAL; quebrar o monólito `dal.ts`.
14. Acessibilidade de modais (role/focus-trap/Esc); `humanizeError`; `EmptyState` com CTA.
15. Vitest + teste de auth/posse + CI mínimo.

**🟢 Baixo**
16. Generalizar `LastUpdatedBadge`; consolidar `clientes/`↔`clients/`; remover `next-auth`; README de setup; consolidar Evolution vs Z-API; migrar hex → tokens; `next/image` nos logos.

---

## 12. Guia para a próxima sessão

O próximo trabalho deve seguir o pipeline de subagents do `CLAUDE.md` (maestro → auditoria/
lacunas → arquitetura → build → guardião), sempre por **fatia vertical**, sem quebrar produção
(migrations aditivas, gate de CI Vercel verde antes de merge).

Ordem recomendada: começar pela **fatia de segurança** (itens 1–5 do §11) — mecânica, sem model
novo, fecha as violações da regra inegociável nº 2. Depois resiliência de cron e timeouts (6–7),
performance (8–9), higiene (10–11). Só então retomar a fila de features do `PROJECT_STATE.md`
(ficha de CS avançada, ⌘K, toasts, calendário, DnD, skeletons, redesign UX Apple/iOS).

Passos detalhados, contexto de estado e checklist de handoff em **`HANDOFF_PROXIMA_SESSAO.md`**.
Estado de orquestração vivo em `PROJECT_STATE.md`; regras transversais em `CLAUDE.md`;
achados por dimensão em `AUDITORIA_SISTEMA.md` e `docs/_audit/*.md`.
