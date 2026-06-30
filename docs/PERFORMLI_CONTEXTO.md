# Performli — Documento de Contexto do Sistema

> **Para que serve este documento:** dar a qualquer nova sessão do Claude Code (ou a um desenvolvedor) o contexto completo de como o Performli funciona, sem precisar reler todo o código.
> **Repositório oficial de produção:** `marcosliossi-del/performli-sistema-geral` (branch `main` → deploy automático na Vercel).
> **Última atualização:** 2026-06-30

---

## 1. O que é o Performli

Painel interno de uma **agência de marketing digital multi-cliente**. Centraliza, para cada cliente da agência:

- Métricas de tráfego pago (Meta Ads, Google Ads) e de e-commerce (GA4, Nuvemshop)
- **Health Score** (saúde do cliente) calculado automaticamente em relação às metas
- Alertas de degradação, risco de churn, CRM/pipeline comercial, contratos e financeiro
- Relatórios semanais/mensais gerados por IA e digest diário no WhatsApp

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** |
| Linguagem | TypeScript |
| ORM / Banco | **Prisma 7** + **PostgreSQL** (adapter `@prisma/adapter-pg`) |
| Autenticação | Sessão **JWT em cookie httpOnly** (`performli_session`, 7 dias, lib `jose`) |
| IA | `@anthropic-ai/sdk` (Claude) — relatórios, insights, chat |
| E-mail | `resend` |
| UI | Tailwind CSS v4 + Radix UI + `recharts` + `lucide-react` |
| Deploy | **Vercel** (auto-deploy ao dar push no `main`) |

> ⚠️ **Atenção (regra do projeto):** este Next.js tem mudanças que diferem do padrão. Sempre consulte `node_modules/next/dist/docs/` antes de escrever código novo. Ver `AGENTS.md`.

---

## 3. Papéis de usuário (enum `Role`)

| Papel | Acesso |
|---|---|
| **ADMIN** | Acesso total + todas as mutações |
| **MANAGER** | Apenas os clientes atribuídos a ele via `ClientAssignment`; pode mutar esses |
| **ANALYST** | Acesso limitado; bloqueado da maioria das mutações |
| **CS** (Customer Success) | Leitura ampla de todos os clientes, **sem** mutações |

**Padrão de autorização central:** a função `canViewAll(role)` retorna `true` para **ADMIN** e **CS**. Usada em todo o `dal.ts`. Para MANAGER/ANALYST, o acesso é filtrado pela tabela pivô `ClientAssignment` (`assignments: { some: { userId } }`).

- `requireSession()` (em `src/lib/dal.ts`) → só verifica autenticação (redireciona p/ `/login`). **Não** verifica papel nem posse.
- A verificação de **posse** (ownership) é feita caso a caso nas server actions e nas funções por-cliente do DAL.

---

## 4. Modelo de dados (principais models Prisma)

**Núcleo:**
- `User` — usuários da agência (com `Role`)
- `Client` — clientes da agência (tem `slug`, `status`, `BusinessType`: ECOMMERCE | LOCAL | …)
- `ClientAssignment` — pivô User↔Client (define quem é manager de quem; `isPrimary`)
- `ClientInteraction` — registro de CRM/interações com o cliente
- `PlatformAccount` — conta de plataforma conectada (Meta, Google Ads, GA4, Nuvemshop)

**Métricas & saúde:**
- `MetricSnapshot` — snapshot diário de métricas por plataforma
- `Goal` — metas (enum `GoalPeriod`: WEEKLY | MONTHLY; `MetricType`: FATURAMENTO, ROAS, CPL, SPEND, LEADS…)
- `HealthScore` — score por meta e período (`HealthStatus`: OTIMO | REGULAR | RUIM)
- `ClientStatusStreak` — sequência de status (quantos dias no mesmo status)
- `ChurnRiskScore` — score de risco de churn (0–100), histórico semanal
- `CriticalProtocol` — protocolo de conta crítica
- `Alert` — alertas gerados (enum `AlertType`)

**Operação:**
- `Task`, `Operation`, `WeeklyChecklist`, `WeeklyReport`, `MonthlyReport`, `CampaignSnapshot`, `SyncLog`

**IA & conhecimento:**
- `AIConversation`, `AIMessage`, `ClientInsight`, `ClientChat`, `ClientChatMessage`
- `KnowledgeDocument`, `KnowledgeChunk` (base de conhecimento p/ RAG)

**Integrações externas:**
- `NuvemshopStore`, `NuvemshopOrder` (e-commerce)
- `AsaasCustomer`, `AsaasPayment`, `AsaasSubscription`, `AsaasTransfer` (financeiro/cobranças)
- `AgencyLead`, `AgencyActivity` (comercial/aquisição de clientes da própria agência)
- `Contract` (jurídico — `ContractStatus`, `ContractType`)
- `Expense`, `FinancialCategory` (financeiro interno)
- `IntegrationSetting` (chaves/config de integrações em banco, ex. `ZAPI_CLIENT_TOKEN`)

---

## 5. Health Score — como a saúde do cliente é calculada

Implementado em `src/services/health-scorer.ts`. Usa **dois sinais combinados**:

**Sinal 1 — Ritmo MTD (mês até a data):**
Compara o acumulado do mês contra a meta **pro-rateada**.
Ex.: no dia 14 de 31, a meta de comparação = meta_total × 14/31.
- ≥ 90% → **OTIMO**
- 70–89% → **REGULAR**
- < 70% → **RUIM**

**Sinal 2 — Tendência recente:**
Compara os últimos 7 dias vs. os 7 dias anteriores da mesma métrica.
- Variação ≥ 20% na direção **errada** → rebaixa o status MTD um nível
- Variação ≥ 20% na direção **certa** → sobe um nível
- Aplicado apenas a scores **MONTHLY** (os semanais já refletem recência)

**Fonte de verdade por tipo de negócio:**
- **ECOMMERCE** → GA4 é a fonte de receita + compras (sem fallback p/ Meta)
- **LOCAL** → Meta Ads é a fonte de todas as métricas de conversão

Métricas "menor é melhor" (`LOWER_IS_BETTER`): CPL, CPA, CAC, CPC, SPEND, CPS, CPM.
Métricas pro-rateadas (acumulam ao longo do mês): FATURAMENTO, SALES, SPEND, LEADS, CONVERSIONS, etc.

---

## 6. Cron diário — `/api/cron/daily`

Agendado na Vercel (`vercel.json`):
- `/api/cron/daily` → **11:00 UTC** (08:00 BRT)
- `/api/cron/digest` → **11:30 UTC** (08:30 BRT) — 30 min depois, p/ usar scores frescos

Sequência do `runDailySync()`:
1. Sync **Meta Ads**
2. Sync **GA4**
3. Sync **Google Ads**
4. Sync **Nuvemshop**
5. **Segunda-feira:** converte metas mensais → semanais (`syncWeeklyGoalsFromMonthly`)
6. Recalcula **health scores** de todos os clientes
7. Detecção de **oscilação**
8. **Churn risk scoring**
9. Sync **Asaas** (financeiro)
10. Avisos de **budget**
11. Detecção de **contas críticas**
12. **Domingo:** relatórios semanais + checklists
13. Checagem de **vencimento de contratos**
14. (Digest do WhatsApp roda no cron separado, 30 min depois)

Autenticação do cron: header `x-cron-secret` = `process.env.CRON_SECRET`.

---

## 7. Páginas principais (App Router, grupo `(dashboard)`)

`/dashboard`, `/clients`, `/clients/[slug]`, `/clients/new`, `/reports`, `/tasks`,
`/operations`, `/anti-churn`, `/ai-agents`, `/alerts`, `/team`, `/managers`,
`/managers/assignments`, `/pipeline`, `/comercial`, `/comercial/dashboard`,
`/financeiro`, `/juridico`, `/knowledge`, `/agency`, `/agency/metas`, `/settings`.

Login em `/login` (grupo `(auth)`).

**Middleware** (`src/middleware.ts`): protege todos os prefixos de rota acima exigindo sessão JWT válida; redireciona p/ `/login` se não autenticado.

---

## 8. Integrações externas

| Integração | Propósito | Pasta de serviço |
|---|---|---|
| **Meta Ads** | Métricas de campanha (fonte p/ negócios LOCAL) | `services/meta-ads` |
| **GA4** | Receita/tráfego (fonte p/ ECOMMERCE) | `services/ga4` |
| **Google Ads** | Métricas de campanha Google | `services/google-ads` |
| **Nuvemshop** | Pedidos de e-commerce (OAuth) | `services/nuvemshop` |
| **Asaas** | Cobranças/financeiro | `services/asaas` |
| **Z-API / Evolution** | WhatsApp (digest, captura de leads) | `services/zapi`, `services/evolution` |
| **Windsor** | Conector de dados | `services/windsor` |

**Nuvemshop OAuth (importante):** o `state` é assinado com HMAC (`SESSION_SECRET`) em `/api/nuvemshop/auth` e verificado em `/api/nuvemshop/callback` para prevenir CSRF.

---

## 9. Histórico de segurança (3 rodadas de auditoria)

Foram feitas 3 rodadas de auditoria de segurança/estabilidade. Commits:

| SHA | Rodada | Conteúdo |
|---|---|---|
| `3f03923` | 1 | Bypass de auth no webhook WhatsApp; checagens de autorização em goals/updateClient; guarda no chat IA; dependência `zod` faltante |
| `e12d4d6` | 2 | Ownership/role em todas as server actions de mutação (interactions, contracts, operations, protocols, tasks); validação de datas; `/juridico` no middleware; try/catch no envio de e-mail de alertas |
| `f0e43ca` | 3 | **IDOR** em `getClientDetail`/`getReportData` (escopo por assignment); ownership em weeklyReports/campaignInsights/budget/leads-convert; **CSRF** no OAuth Nuvemshop; filtro `period:'WEEKLY'` no churn scorer; try/catch por-cliente nos relatórios; **timeout de 30s** em todas as chamadas fetch do GA4 |

**Padrões de segurança estabelecidos (seguir em código novo):**
- Funções por-cliente no DAL recebem `userId` + `role` e filtram por `assignments: { some: { userId } }` quando `!canViewAll(role)`.
- Server actions de mutação verificam papel **e** posse antes de gravar. Helper comum: `assertClientAccess(session, clientId)`.
- Toda chamada `fetch` a API externa deve ter timeout (AbortController) para não travar o cron.
- Loops de processamento por-cliente (cron) usam try/catch por iteração para uma falha não abortar as demais.

---

## 10. Convenções importantes

- **Camada de dados:** toda leitura passa por `src/lib/dal.ts` (marcado `server-only`, usa `cache()` do React e `unstable_cache`).
- **Mutações:** ficam em `src/app/actions/*.ts` (server actions `'use server'`).
- **Segredos/config dinâmica:** lidos da tabela `IntegrationSetting` no banco (ex.: token do Z-API), não só de env vars.
- **Branch de produção:** `main` no `performli-sistema-geral` → deploy automático na Vercel. Nunca commitar identificadores internos de modelo/sessão em código.

---

## 11. Como continuar o projeto (fluxo 100% nuvem)

1. Em **claude.ai/code**, abra a sessão sempre conectada ao repositório **`performli-sistema-geral`**, branch `main`.
2. Faça as alterações nessa sessão (de qualquer PC).
3. Push no `main` → Vercel faz o deploy automático.
4. Acompanhe em **vercel.com → projeto → Deployments**.

> Sessões conectadas a outro repositório (ex.: `marcos`/`kyn-nuvemshop`) **não** conseguem fazer deploy em produção — o proxy git só autoriza o repositório com que a sessão foi criada.
