# AUDITORIA_SISTEMA.md — Performli (Arkza)

> Auditoria completa do sistema operacional interno da Arkza.
> Método: 10 dimensões auditadas em paralelo (read-only). Data de referência: 2026-07-01.
> Escopo: 34 páginas · 27 arquivos de server actions · 44 API routes · 29 serviços · 64 models Prisma · 46 migrations · ~42k LOC.

---

## Sumário executivo

**Estado geral: saudável e maduro.** Camadas bem definidas (page → DAL para leitura, actions → prisma para mutação com auth+papel+posse), migrations 100% aditivas e idempotentes, ClickUp praticamente desacoplado (fonte da verdade no PostgreSQL), webhooks Asaas/Nuvemshop fail-closed, financeiro/contratos ADMIN-only, índices bem cobertos, N+1 evitado nas listas, e a maioria dos crons isola falha por cliente.

**Onde falta atenção (temas transversais):**
1. **Testes/CI:** zero testes automatizados e sem pipeline de CI de código — a única defesa é o type-check do `next build` na Vercel. É a maior fragilidade estrutural.
2. **Posse residual:** apesar da onda recente de correções (cliente/goals/contratos/War Room/budget/platformAccounts), sobraram mutações legadas sem posse: `tasks.ts`, `operations.ts`, `alerts.markAlertRead`, `chat.ensureClientChat`, comentário/checklist em `operacional.ts`.
3. **Bordas externas de entrada:** webhook **WhatsApp inbound** ainda é fail-open; **callback OAuth do Nuvemshop** confia num `state` não assinado (IDOR de clientId); `leads/capture` sem rate-limit.
4. **Resiliência de cron:** os geradores semanais de **relatório** e **checklist** ainda não isolam falha por cliente/manager (regra 7) — um item quebra a rodada de domingo inteira.
5. **Observabilidade:** `lastRunAt` só existe nas recorrências; várias automações de status não gravam AuditLog.
6. **Dívida de organização (baixo risco / sem impacto no usuário):** `dal.ts` monolítico (~3.5k linhas), 9 telas com Prisma inline fora da DAL, pastas duplicadas `clientes/`↔`clients/`.

**Nota positiva confirmada:** o fluxo financeiro (entradas via `payments` + saídas via `financialTransactions` DEBIT→Expense) e o faturamento GA4 (`purchaseRevenue`, alinhado ao painel via `getClientKPIs`) estão corretos e sem dupla contagem.

---

## Tabela de travas priorizada

Severidade considera impacto × probabilidade. "Aplicar agora" = seguro de aplicar sem risco de produção.

### 🔴 Crítico / Alto

| # | Trava | Arquivo | Severidade | Aplicar agora | Risco regressão |
|---|-------|---------|-----------|---------------|-----------------|
| 1 | Webhook WhatsApp inbound **fail-open** (token só validado se header presente) | `src/app/api/webhooks/whatsapp/route.ts:18` | Alto | sim (mesmo padrão Asaas/Nuvemshop) | baixo |
| 2 | Callback OAuth Nuvemshop: `state` não assinado + `clientId` arbitrário (IDOR) | `src/app/api/nuvemshop/callback/route.ts:12` | Alto | sim | médio |
| 3 | `updateTaskStatus` sem posse/papel/AuditLog | `src/app/actions/tasks.ts:17,54` | Alto | sim | baixo |
| 4 | `createOperation` sem posse/AuditLog | `src/app/actions/operations.ts:17` | Alto | sim | baixo |
| 5 | Geradores semanais (relatório/checklist) sem try/catch por cliente (regra 7) | `weekly-report-generator.ts:852`, `weekly-checklist-generator.ts:149` | Alto | sim | baixo |
| 6 | Zero testes automatizados / sem CI de código | (ausente) `.github/workflows/` | Alto | sim | baixo |
| 7 | Nenhuma error boundary no app (erro derruba a tela) | `src/app/(dashboard)/` (sem `error.tsx`) | Alto/Médio | sim | baixo |

### 🟡 Médio

| # | Trava | Arquivo | Aplicar agora | Risco |
|---|-------|---------|---------------|-------|
| 8 | `getClientChat` faz `upsert` (escrita) dentro de `cache()` — leitura vira escrita a cada request | `src/lib/dal.ts:2233` | sim | médio |
| 9 | Posse ausente: `alerts.markAlertRead`, `chat.ensureClientChat`, comentário/checklist do operacional | `alerts.ts:7`, `chat.ts:58`, `operacional.ts:85,104` | sim | baixo |
| 10 | `leads/capture` público sem rate-limit + CORS reflete qualquer origin | `src/app/api/leads/capture/route.ts:32,117` | sim | baixo |
| 11 | Mutação de lead (PATCH/POST) sem checagem de papel | `src/app/api/comercial/leads/[id]/route.ts:25` | sim | baixo |
| 12 | Credenciais GA4/Google/Meta/Windsor só em env (regra 5 — usar IntegrationSetting) | `services/ga4/client.ts`, `google-ads/client.ts`, `meta-ads/client.ts` | sim (fallback env) | médio |
| 13 | `lastRunAt`/SyncLog só em ~5 de 29 serviços (regras 9/10) | `src/services/*` | sim | baixo |
| 14 | AuditLog ausente em automações de status (health/churn) e algumas mutações | `health-scorer.ts:481`, `churn-scorer.ts:151`, `interactions.ts`, `goals.ts` | sim | baixo |
| 15 | Modais/drawers sem `role=dialog`/focus-trap/Esc | `components/operacional/TaskDrawer.tsx` | sim | médio |
| 16 | `dal.ts` monolítico (~3.5k linhas / 52 exports) | `src/lib/dal.ts` | sim | médio |
| 17 | 2 fetches Meta sem timeout | `src/services/meta-ads/client.ts:176,200` | sim | baixo |

### 🟢 Baixo (organização / polimento)

| # | Trava | Arquivo |
|---|-------|---------|
| 18 | Índices compostos úteis: `AsaasPayment(status,dueDate)`, `Task(status,dueDate)`, `Alert(clientId,type)` | `prisma/schema.prisma` |
| 19 | 9 telas com Prisma inline fora da DAL | `financeiro/page.tsx`, `comercial/*`, `juridico`, `anti-churn`, `alerts`, `agency/metas`, `clients/*` |
| 20 | Pastas duplicadas `components/clientes/` vs `components/clients/` | `src/components/` |
| 21 | Estados vazios sem CTA (pergunta 3 das 6) + labels técnicos na UI | `comercial/dashboard`, `canais`, `operations`, `alerts/page.tsx` |
| 22 | Falha silenciosa no drag do Pipeline (`catch {}` sem toast) | `pipeline/PipelineBoard.tsx:56` |
| 23 | `LastUpdatedBadge` só no Cockpit (regra 10 — generalizar) | vários |
| 24 | "Sistema online" sempre verde (falsa saúde) | `Sidebar.tsx:196` |
| 25 | Deps: remover `next-auth` (0 imports), pinar `@anthropic-ai/sdk`, mover `@types/*`/`dotenv` p/ devDeps | `package.json` |
| 26 | FKs soltas em `Task` (leadId/contractId) e status como String vs enum | `prisma/schema.prisma` |
| 27 | Senhas default triviais no seed | `src/app/api/seed/route.ts:13` |

> ⚠️ Itens 1, 2, 10, 11 mudam comportamento de bordas externas (webhook/OAuth) — aplicar com confirmação dos segredos de produção (ZAPI_CLIENT_TOKEN) e teste do fluxo OAuth.

---

## Seções detalhadas por dimensão

## Stack & Dependências

Data: 2026-07-01 · Escopo: read-only · Verificação: apenas via CI (build = `prisma generate && npm run migrate:deploy && next build`)

### (a) O que existe

| Arquivo | Papel |
|---|---|
| `package.json` | Deps, scripts, config `prisma.seed` |
| `next.config.ts` | `compress`, `poweredByHeader:false`, `optimizePackageImports` p/ `lucide-react` e `@anthropic-ai/sdk` |
| `tsconfig.json` | `strict:true`, `target ES2017`, `moduleResolution bundler`, alias `@/*` |
| `eslint.config.mjs` | Flat config estendendo `eslint-config-next` (core-web-vitals + typescript) |
| `postcss.config.mjs` | Único plugin `@tailwindcss/postcss` (Tailwind v4) |
| `prisma.config.ts` | Schema, migrations path, seed via `tsx`, datasource `DATABASE_URL` |
| `vercel.json` | 4 crons + `maxDuration` por rota (`sync` 300s, `cron` 300s, `nuvemshop` 60s, `knowledge` 120s) |

Stack confirmada: Next `16.2.1` · React `19.2.4` · TS `^5` · Prisma `^7.5.0` + `@prisma/adapter-pg` · `pg 8` · `jose 6` (JWT httpOnly) · Tailwind v4 · `@anthropic-ai/sdk ^0.80.0`.

Modelos de IA em uso (ambos válidos e ativos no catálogo atual):
- `claude-sonnet-4-6` — `planoAcao.ts`, `weekly-report-generator.ts`, `ai/chat`, `ai/dashboard-chat`, `campaign-insight-generator.ts`
- `claude-haiku-4-5-20251001` — `actions/insights.ts` (ID datado; é o full ID correto de Haiku 4.5)

Auth de cron (`api/cron/*/route.ts`) valida `CRON_SECRET` via Bearer ou `x-cron-secret` e **falha fechado** se o env var não existir.

### (b) Pontos fortes

- **Build resiliente ao cold-start do Neon**: `migrate:deploy` tem 3 tentativas com backoff (12s/25s) — mitiga cold-start do Postgres serverless (regra 11).
- **Versões coerentes**: Next/React/eslint-config-next alinhados em 16.2.1 / 19.2.4; sem mismatch de major.
- **`strict: true`** no TS — captura classe inteira de bugs em CI.
- **`maxDuration` explícito** por família de rota no `vercel.json` — evita timeout silencioso de sync/cron longos (regra 6).
- **Segredos via env/`IntegrationSetting`** — nenhum segredo hardcoded nos configs; IA usa `process.env.ANTHROPIC_API_KEY`.
- **Cron auth fail-closed** — sem `CRON_SECRET`, toda requisição é rejeitada (regras 3/4).
- `poweredByHeader:false` — reduz fingerprint.

### (c) Riscos por severidade

**Crítico** — nenhum nesta dimensão.

**Alto**
- **`next-auth ^5.0.0-beta.30` é dependência de produção mas não é importada em nenhum arquivo `src`** (`package.json:41`). Dependência **beta** não usada aumenta superfície de supply-chain e pode introduzir breaking change num `npm install` futuro; o auth real é `jose` + cookie httpOnly. → remover se confirmado sem uso.

**Médio**
- **Sem pin de versão do Node** (sem `engines`, sem `.nvmrc`) — CI/Vercel e dev podem rodar majors diferentes; Next 16 exige Node ≥ 20.9. Divergência silenciosa entre ambientes (regra 11).
- **`@anthropic-ai/sdk ^0.80.0` com faixa `^` em SDK 0.x** (`package.json:17`) — por semver, `^0.80` permite minors 0.x que podem trazer breaking changes de API; um reinstall pode subir o SDK e quebrar `messages.create`. → pin exato ou `~0.80`.
- **`migrate:deploy` dentro do comando de build** (`package.json:8`) — acopla deploy da app à migração de schema; migration destrutiva/lenta pode derrubar o build. Aceitável hoje (migrations aditivas — regra 13), mas é ponto único de falha.
- **`pdf-parse ^2.4.5`** (`package.json:42`), usada em `admin/knowledge/upload` — histórico de issues em parsing de uploads. Garantir upload apenas ADMIN + limite de tamanho.

**Baixo**
- **`dotenv ^17` como dep de produção** (`package.json:37`) — só necessária em build/seed; runtime Vercel injeta env nativo. Poderia ser `devDependency`.
- **`@types/bcryptjs`, `@types/pg`, `@types/pdf-parse` em `dependencies`** (`package.json:32,33,55`) — sem impacto runtime, só organização/peso.
- **Sem gate de `npm audit` no CI** — CVEs transitivas passam silenciosas.

### 🔒 Travas / Fluidez

Melhorias concretas de baixo risco (não alteram runtime):

1. **Pinar `@anthropic-ai/sdk`** de `^0.80.0` para `0.80.0` (ou `~0.80.0`). SDK 0.x + `^` = risco de breaking minor. Aplicável agora, zero risco.
2. **Adicionar `engines.node` (`">=20.9.0"`) e `.nvmrc`** — alinha dev/CI/Vercel. Aplicável agora, baixo risco.
3. **Remover `next-auth`** das dependências (0 usos em `src`, verificado). Reduz superfície e ruído; validar no CI.
4. **Mover `dotenv` e os `@types/*` para `devDependencies`** — reduz `node_modules` de produção. Baixo risco.
5. **Step `npm audit --audit-level=high` não-bloqueante no CI** — visibilidade de CVEs sem travar deploy. Baixo risco.

---
*Fim — Stack & Dependências.*
## Arquitetura — Auditoria PERFORMLI

> Data: 2026-07-01 · Escopo: estrutura de diretórios, camadas, fonte da verdade, acoplamentos. Read-only.

### (a) Organização (com caminhos)

**Route groups** (`src/app`)
- `(auth)/login/` — fluxo de autenticação isolado (1 rota).
- `(dashboard)/` — 27 áreas, 32 `page.tsx`. Layout único protegido.
- `api/` — 44 `route.ts` em 17 subdomínios (admin, ai, asaas, comercial, cron, financeiro, leads, nuvemshop, sync, webhooks, whatsapp, etc).

**Camadas de dados**
- Leitura de tela: `page.tsx` → `src/lib/dal.ts` (52 exports, guard `requireSession`, `canViewAll`, filtro por `ClientAssignment`). 29 páginas consomem a DAL.
- Mutação: `src/app/actions/` (27 arquivos, 3.351 linhas). Padrão consistente: `requireSession()` + checagem `session.role` + posse via `assignment`. 24/27 usam `prisma` diretamente (esperado para mutação; a DAL cobre leitura).
- Persistência: `src/lib/prisma.ts` (singleton) → PostgreSQL. **Fonte da verdade canônica.**

**Serviços** (`src/services`, 29 unidades)
- Crons/monitores: `health-scorer`, `churn-scorer`, `antichurn-monitor`, `checkin-monitor`, `budget-monitor`, `warroom-monitor`, `inadimplencia-checker`, `contract-expiry-checker`, `lead-followup-checker`, `oscillation-detector`, `critical-account-detector`, `task-escalation`, `warroom-escalation`.
- Geradores: `weekly-report-generator`, `weekly-checklist-generator`, `campaign-insight-generator`, `recurrence-engine`, `resultado-engine`, `alert-dispatcher`, `report-prompts`.
- Integrações (subpastas): `meta-ads/`, `google-ads/`, `ga4/`, `nuvemshop/`, `asaas/`, `windsor/`, `zapi/`, `evolution/`, `notifications/`.
- Orquestrador: `src/app/api/cron/{daily,digest,recurrences,resultados}/route.ts`. `daily` chama ~40 awaits (355 linhas). Auth via `CRON_SECRET` (Bearer + `x-cron-secret`).

**Componentes** (`src/components`, 108 arquivos) — organizados por domínio, espelhando as áreas do dashboard + `ui/` (7 primitivos) e `layout/`.

**Fonte da verdade**: PostgreSQL via Prisma. ClickUp praticamente desacoplado — só 2 referências incidentais (`components/juridico/JuridicoPageTabs.tsx`, `api/admin/seed-contracts/route.ts`). Alinhado à diretriz estratégica.

### (b) Pontos fortes
- **DAL de leitura real**, com guard de auth e ownership embutidos (136 ocorrências de auth/role/assignment em `dal.ts`). Não é fachada.
- **Actions com padrão de segurança uniforme**: 90 chamadas `requireSession`, 49 checagens `session.role`, 29 de `assignment`. Cumpre a Regra 2 (auth+papel+posse).
- **Route groups limpos** — separação `(auth)`/`(dashboard)` correta; ponto único de proteção.
- **Serviços bem fatiados por responsabilidade** (monitor vs gerador vs integração), facilitando testar/desligar isoladamente.
- **ClickUp desacoplado** — exit strategy praticamente cumprida na camada de arquitetura.
- **Cron com secret** e handlers dedicados por cadência.

### (c) Riscos por severidade

**ALTO**
- `src/lib/dal.ts` **monolítico: 3.477 linhas**, 52 exports num único arquivo. Gargalo de merge, dificulta ownership e cache-invalidation localizada. Sem `error.tsx`/`not-found.tsx` em `src/app` (0 encontrados) — falhas de DAL/render sobem sem boundary operacional.
- **Prisma inline em telas, fora da DAL** — viola Regra 1 (toda leitura pela DAL). `src/app/(dashboard)/financeiro/page.tsx:41` (18 queries diretas, 389 linhas), `comercial/dashboard/page.tsx`, `comercial/page.tsx`, `juridico/page.tsx` (3), `anti-churn/page.tsx`, `alerts/page.tsx`, `agency/metas/page.tsx`, `clients/page.tsx`, `clients/[slug]/page.tsx`. Total: 9 telas. Financeiro é o pior caso: dado crítico (contas a receber) sem guard de ownership da DAL.

**MÉDIO**
- **Pastas duplicadas** `src/components/clientes/` (1 arquivo: `ClientesTable.tsx`) vs `src/components/clients/` (35 arquivos). Ambíguo pt/en; risco de import errado e código órfão. Idem áreas mistas no dashboard: `operacional/` vs `operations/`, `comercial/` + `pipeline/` coexistindo.
- **Resiliência de cron não garantida por serviço**: `src/services/health-scorer.ts` tem só 3 tokens try/catch; `daily` orquestra ~40 passos. Confirmar try/catch **por cliente** (Regra 7) em cada monitor, não só no orquestrador.
- **`lastRunAt`/`SyncLog` em apenas 5 dos 29 serviços** (Regra 9 — registrar última execução). Sem timestamp de execução compromete Regra 10 (tela mostra última atualização).

**BAIXO**
- Nomenclatura mista pt/en em rotas e pastas gera atrito cognitivo (dívida de convenção, não bug).
- Alguns actions (ex.: `platformAccounts`) importam prisma sem par de leitura na DAL — verificar se leituras associadas passam pela DAL.

### 🔒 Travas / Fluidez
- **TRAVA** — `financeiro/page.tsx` com 18 queries Prisma inline: dado financeiro crítico sem passar pela DAL, sem ownership uniforme. Bloqueia a garantia de "fonte única confiável" do módulo FIN.
- **TRAVA** — `dal.ts` de 3.477 linhas: qualquer evolução de leitura concorre no mesmo arquivo; alto risco de conflito e regressão silenciosa. Fatiar por domínio antes de crescer mais.
- **FLUIDEZ** — actions e route groups já seguem padrão seguro e coeso; ClickUp desacoplado. Migrar telas inline → DAL é mecânico e de baixo risco (não muda contrato de dados).
- **FLUIDEZ** — resolver duplicação `clientes/`↔`clients/` é trivial e destrava clareza de módulo.
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
- **Nenhuma `error.tsx` em todo `src/app`.** Zero error boundaries do App Router:
  qualquer exceção de RSC/DAL derruba a árvore para a tela de erro genérica do
  Next (mensagem técnica, sem "tentar de novo"). Viola "linguagem operacional".
- **Falha silenciosa no Pipeline (`pipeline/PipelineBoard.tsx:56`).** `catch {}`
  faz rollback do drag-and-drop **sem toast**: o card volta sozinho e nada
  explica o porquê — o "processo que quebra sem ninguém ver" que o sistema
  deveria eliminar.
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

1. **Criar `error.tsx` (dashboard) com copy operacional + "tentar de novo".**
   Hoje não há nenhuma error boundary; qualquer falha de RSC/DAL cai na tela
   nativa do Next. Baixo risco, alto ganho. (Obs.: `loading.tsx` do grupo
   `(dashboard)` já cobre rotas aninhadas via Suspense — não é lacuna.)
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
# Auditoria — Backend & Server Actions

Escopo: 26 arquivos em `src/app/actions/*.ts` + 44 rotas em `src/app/api/**/route.ts`.
Regra inegociável avaliada: toda mutação valida **auth + papel + posse**
(`requireSession` + `assertClientMutationAccess`) e grava **`writeAuditLog`**;
toda chamada externa tem **timeout**.

## Backend & Server Actions

### (a) Padrão + exemplos

O padrão canônico está bem implementado na maioria das actions "novas":

```ts
const session = await requireSession()
try { await assertClientMutationAccess(session, clientId, { allowCS: true }) }
catch (e) { return { error: (e as Error).message } }
// ...mutação...
await writeAuditLog({ actorId, actorRole, action, entityType, entityId, clientId })
return { ok: true }
```

- **Referência de ouro:** `operacional.ts` (`createOperacionalTask`,
  `submitTaskForValidation`, `decideTaskValidation`) — auth + papel + posse +
  transação + `AuditLog` + retorno `{ok}|{error}`.
- Também corretos: `checkin.ts`, `fichaCs.ts`, `warRoom.ts`, `antiChurn.ts`,
  `updateClient.ts`, `protocols.ts` (posse via `assertProtocolAccess`).
- `assertClientMutationAccess` (`src/lib/audit.ts`) centraliza RBAC+posse
  corretamente: ADMIN livre, CS só com `allowCS`, MANAGER só cliente atribuído,
  ANALYST nunca muta.

### (b) Pontos fortes

- Webhooks bem protegidos e **fail-closed**: `asaas/webhook` (token +
  503 sem env), `nuvemshop/webhooks` (HMAC SHA-256 + 503 sem secret).
- Crons (`cron/daily`, etc.) exigem `CRON_SECRET` (Bearer ou header) e usam
  **try/catch por etapa** — falha de um passo não derruba a rotina (regra #7).
- Rotas admin/knowledge, settings, financeiro, comercial checam
  `getSession`/papel.
- Clients de integração têm timeout: `meta-ads` (25s), `ga4`, `google-ads`,
  `asaas`, `nuvemshop`, `windsor`, `zapi`, `evolution`.
- `writeAuditLog` é append-only e nunca lança (não derruba a mutação).

### (c) Riscos por severidade (arquivo:linha)

#### 🔴 Alto — mutação de recurso de cliente sem posse

- **`actions/tasks.ts:17` `createTask`** e **`:54` `updateTaskStatus`** — só
  `requireSession()`. Qualquer papel (inclusive ANALYST) cria/altera tarefas de
  **qualquer** `clientId`; sem `assertClientMutationAccess`, sem `AuditLog`.
  (Contraste: `operacional.ts` faz certo — `tasks.ts` é a versão legada.)
- **`actions/operations.ts:17` `createOperation`** — só `requireSession()`;
  cria `Operation` para qualquer `clientId` sem posse/papel e sem `AuditLog`.
- **`api/nuvemshop/callback/route.ts:12`** — `state.clientId` vem do parâmetro
  `state` (base64 controlado pelo cliente) e é usado direto para criar
  `PlatformAccount`/gravar `accessToken`. Não há `requireSession` nem verificação
  de posse do `clientId`. Vincula loja/token a cliente arbitrário.

#### 🟠 Médio — posse/papel parcial ou ausência de auditoria

- **`actions/alerts.ts:7` `markAlertRead`** — só `requireSession()`, sem escopo:
  MANAGER/ANALYST marca lido alerta de cliente não atribuído. (`markAllAlertsRead`
  já filtra por assignment — replicar no `markAlertRead`.)
- **`actions/operacional.ts:85` `addTaskComment`** e **`:104`
  `toggleChecklistItem`** — validam sessão e existência, mas **não** posse do
  cliente da tarefa; qualquer usuário comenta/altera checklist de qualquer tarefa.
- **`actions/chat.ts:58` `ensureClientChat`** — **sem `requireSession`**;
  faz `upsert` em `ClientChat` a partir de `clientId` sem qualquer auth.
- **`actions/weeklyChecklist.ts:16` `toggleChecklistItem`** — escopo pelo
  `managerId = session.userId` (ok), mas sem `AuditLog` de conclusão de item.
- **`api/leads/capture/route.ts:30`** — endpoint público **por design** (form de
  landing), mas `Access-Control-Allow-Origin` reflete qualquer `origin` e não há
  rate-limit; risco de flood de `AgencyLead`. Aceitável se documentado + throttle.

#### 🟡 Baixo — auditoria ausente em mutação com posse OK

- **`actions/interactions.ts`** (add/delete/updatePipelineStage/updateCrmFields) —
  posse OK, mas **sem `writeAuditLog`** (regra #8). Inclui mutação sensível de CRM.
- **`actions/protocols.ts`** (status/briefing/notes) — posse OK, **sem `AuditLog`**
  (War Room é processo crítico; deveria auditar).
- **`actions/goals.ts:36/121`** upsert weekly/monthly — papel ADMIN OK, sem audit.
- **Raw fetch sem timeout:** `services/meta-ads/client.ts:176` (`debug_token`) e
  `:200` (`me/adaccounts`) usam `fetch` sem `AbortSignal` (o loop principal em
  `:69` tem timeout). Baixo impacto, mas viola regra #6.

### 🔒 Travas / Fluidez

Travas (bloqueiam segurança/consistência — corrigir antes de novas fatias):

1. `tasks.ts` sem posse/papel — mutação de tarefa de cliente arbitrário.
2. `nuvemshop/callback` confia em `clientId` do `state` — vínculo forjado.
3. `operations.ts` sem posse/papel/audit.
4. `alerts.markAlertRead` sem escopo; `chat.ensureClientChat` sem auth;
   `operacional` comment/checklist sem posse.

Fluidez (dívida de rastreabilidade — não bloqueiam, mas violam regra #8):

- Padronizar `writeAuditLog` em interactions/protocols/goals.
- Timeout nos 2 `fetch` crus do Meta client.
- Rate-limit/allowlist de origin no `leads/capture`.
# Auditoria — Dimensão Banco de Dados

> Escopo: `prisma/schema.prisma` (64 models) e `prisma/migrations` (46 migrations).
> Data: 2026-07-01. Read-only fora de `docs/`.

## Banco de Dados

### (a) Domínios de models

- **Auth/Team** — `User`, `Role`.
- **Clientes** — `Client`, `ClientAssignment`, `ClientInteraction`, `ClientStatusStreak`, `ClientChat`, `ClientChatMessage`, `ClientInsight`. Enums: status, businessType, resultado/etapa, ficha CS (nps/relacionamento/curva).
- **Plataformas/Métricas** — `PlatformAccount`, `MetricSnapshot`, `CampaignSnapshot`, `SyncLog`, `Goal`, `HealthScore`, `ChurnRiskScore`.
- **Nuvemshop** — `NuvemshopStore`, `NuvemshopOrder`.
- **Central Operacional (Task)** — `Task` + ~20 satélites (`TaskArea`, `POPProcess`, `POPStep`, `POPFriction`, `TaskList`, `TaskChecklistItem`, `TaskComment`, `TaskAttachment`, `TaskActivity`, `TaskDependency`, `TaskApproval`, `TaskCustomFieldDefinition/Value`, `TaskTemplate`+`Step`/`Field`, `TaskRecurrenceRule`, `TaskAutomationRule`, `AutomationLog`, `TaskWatcher`, `TaskAuxAssignee`, `TaskSavedView`, `TaskSLA`, `OperationalRoutine`).
- **War Room** — `CriticalProtocol`, `AuditLog`, `Alert`.
- **CSX/Relatórios** — `ClientWeeklyCheckin`, `WeeklyChecklist`, `WeeklyReport`, `MonthlyReport`.
- **Financeiro/Asaas** — `AsaasCustomer`, `AsaasPayment`, `AsaasSubscription`, `AsaasTransfer`, `FinancialCategory`, `Expense`.
- **Comercial/CRM** — `AgencyLead`, `AgencyActivity`.
- **IA/RAG** — `AIConversation`, `AIMessage`, `KnowledgeDocument`, `KnowledgeChunk`.
- **Config** — `IntegrationSetting`, `Contract`, `Operation`.

### (b) Pontos fortes

- **Idempotência recente exemplar.** Migrations de 2026-06-30+ usam `DO $$ ... EXCEPTION WHEN duplicate_object` para enums, `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`. Ex.: `20260630120000_warroom_and_auditlog`, `20260701020000_add_query_indexes`.
- **Integridade referencial coerente.** `onDelete: Cascade` em dados dependentes do `Client`; `SetNull` correto em vínculos opcionais (`AuditLog.actor/client`, `CriticalProtocol.responsible`, `AsaasCustomer.client`, `Contract.responsible`). AuditLog append-only preserva trilha mesmo com ator removido.
- **Idempotência de negócio.** Uniques de janela em quase todos os snapshots/relatórios (`MetricSnapshot @@unique([platformAccountId,date])`, `ClientWeeklyCheckin @@unique([clientId,weekStart])`, `Task.idempotencyKey @unique`) — evita duplicidade em cron.
- **Índices dedicados a filtros quentes** (status, dueDate, datas de vencimento) — `AsaasPayment` indexa `status`, `dueDate`, `paymentDate`; `Task` indexa 6 colunas.
- **Truque anti-NULL em unique**: `CampaignSnapshot.adSetId @default("")` evita buraco de unicidade com NULL (linha 1155).

### (c) Riscos por severidade

**ALTO — nenhum bloqueante encontrado.** Migrations aditivas, sem DROP destrutivo em produção.

**MÉDIO**

- **Migrations antigas não-idempotentes.** `20260321113638_init` e as de mar–mai/2026 usam `CREATE TYPE`, `CREATE INDEX` e `ADD COLUMN` crus (sem guarda). Evidência: 9 migrations sem `CREATE INDEX IF NOT EXISTS`; `init/migration.sql:2` `CREATE TYPE "Role"...` sem guarda. Risco só se um banco parcialmente migrado re-rodar essas migrations; em fluxo `migrate deploy` normal não afeta. Não reescrever migrations já aplicadas — apenas manter o padrão novo daqui pra frente.
- **FKs "soltas" em `Task`.** `Task.leadId` e `Task.contractId` (linhas 681–682) são `String?` sem relação FK ("sem FK" comentado). Sem integridade referencial nem `ON DELETE`: apagar um `AgencyLead`/`Contract` deixa `Task` apontando para id inexistente. Ainda sem uso no código (`grep` 0 refs), então baixo impacto atual; travar antes de virar feature.
- **Índice composto ausente em query quente de financeiro.** `inadimplencia-checker.ts:44` e `financeiro/summary/route.ts:102` filtram `AsaasPayment WHERE status='OVERDUE' AND dueDate<=today`. Existem índices separados de `status` e `dueDate`, mas não o composto `(status,dueDate)`. Volume baixo (~30 clientes) → otimização, não urgência.
- **`AlertType` sobrecarregado.** Enum único acumula alertas de sync, KPI, War Room, financeiro, checkin e antichurn (linhas 444–468), reusado também como `CriticalProtocol.trigger`. Acoplamento crescente; monitorar antes que vire enum gigante difícil de particionar por domínio.

**BAIXO**

- **Models órfãos (0 refs em `src/`).** `TaskSavedView`, `OperationalRoutine`, `TaskSLA`, `TaskAutomationRule`, `AsaasTransfer`, `TaskCustomFieldDefinition`. São scaffolding da Central Operacional / Asaas ainda não ligados. Não remover (roadmap), mas registrar como "reservado, não implementado".
- **`Client.tags`/`Task.tags` como `String[]`** sem índice GIN — busca por tag faz scan. Aceitável no volume atual.
- **Campos de status como `String` em vez de enum.** `AsaasSubscription.status`/`cycle`, `AsaasTransfer.status`, `FinancialCategory.type`, `Contract`/`Expense.source` (linhas 1391–1392, 1410, 1432, 1539) — perde validação no banco; comentários documentam valores esperados.
- **`AIMessage`, `ClientInsight`, `KnowledgeChunk`** sem índice na coluna de ordenação além do FK — leituras pequenas, ok.

### 🔒 Travas / Fluidez

**Índices aditivos seguros (aplicáveis agora, `CREATE INDEX IF NOT EXISTS`, risco baixo):**

- `AsaasPayment(status, dueDate)` — acelera régua de inadimplência (FIN-19), query já existente.
- `Task(status, dueDate)` composto — cockpit de tarefas atrasadas (hoje só índices simples).
- `Alert(clientId, type)` — filtros de alerta por tipo/cliente sem índice hoje.

**Travas (endereçar antes de virar feature):**

- Definir `onDelete` para `Task.leadId`/`Task.contractId` — via FK real com `SetNull` ou limpeza aplicativa documentada. Enquanto sem uso, é trava barata.

**Limpezas de baixo risco:**

- Anotar models órfãos como reservados (comentário no schema), não dropar.
- Migrar `String` → enum nos campos de status Asaas/Financeiro em migration aditiva futura (com backfill), quando houver janela.

> Nenhuma ação de escrita aplicada. Migrations já aplicadas NÃO devem ser reescritas.
## Integrações

Auditoria da dimensão **Integrações** do Performli — `src/services/*` e rotas `src/app/api`. Read-only. Data: 2026-07-01.

### (a) Tabela de integrações

| Integração | Finalidade | Arquivos principais | Config | Timeout | Eventos/Webhook |
|---|---|---|---|---|---|
| Asaas | Financeiro: entradas (payments→AsaasPayment), saídas (financialTransactions DEBIT→Expense source=ASAAS), customers, subs, transfers, balance | `services/asaas/{client,sync}.ts`, `api/asaas/{sync,webhook}` | **IntegrationSetting** (`ASAAS_API_KEY`,`ASAAS_SANDBOX`) c/ fallback env | 30s `AbortSignal.timeout` | Webhook header `asaas-access-token` vs `ASAAS_WEBHOOK_TOKEN` — **fail-closed 503** |
| Nuvemshop | Pedidos e-commerce → NuvemshopOrder + MetricSnapshot (conversions/revenue) | `services/nuvemshop/{client,sync}.ts`, `api/nuvemshop/{callback,webhooks}`, `api/sync/nuvemshop` | **env** (`NUVEMSHOP_APP_*`; token por loja em DB) | 30s | Webhook HMAC-SHA256 (`x-linkedstore-hmac-sha256`) vs `NUVEMSHOP_APP_SECRET` — **fail-closed 503** |
| GA4 | Métricas diárias → MetricSnapshot; `conversionValue = purchaseRevenue` (fallback totalRevenue) | `services/ga4/{client,sync,transformers}.ts`, `api/sync/ga4` | **env** (Service Account JWT; fallback OAuth) | 30s | — |
| Google Ads | Métricas por campanha → MetricSnapshot | `services/google-ads/*`, `api/sync/google-ads` | **env** (Service Account JWT + dev token) | 30s | — |
| Meta Ads | Insights conta/campanha → MetricSnapshot | `services/meta-ads/*`, `api/sync/meta` | **env** (`META_SYSTEM_TOKEN`; token por conta) | 25s (AbortController) | — |
| Windsor | GA4 legado (connector) | `services/windsor/*` | **env** (`WINDSOR_API_KEY`) | 25s | — |
| Z-API | WhatsApp: envio + QR + status | `services/zapi/client.ts`, `lib/whatsapp` | **IntegrationSetting** (`ZAPI_*`) | 30s | Webhook `client-token` (opcional) |
| Evolution | WhatsApp alternativo: envio + QR + webhook | `services/evolution/client.ts` | **IntegrationSetting** (`EVOLUTION_*`) | 30s | seta MESSAGES_UPSERT |
| Notifications | Digest diário WhatsApp por gestor | `services/notifications/daily-digest.ts` | **env** (`ZAPI_*`,`WHATSAPP_*`) | via lib | — |
| Leads capture | Endpoint público de captação | `api/leads/capture` | — | — | público (CORS `*`) |
| WhatsApp inbound | Cria lead a partir de msg recebida | `api/webhooks/whatsapp` | IntegrationSetting `ZAPI_CLIENT_TOKEN` | — | Z-API inbound |

### (b) Pontos fortes

- **Timeout em 100% das chamadas externas** — `AbortSignal.timeout(30_000)` ou `AbortController` (Meta/Windsor 25s), consistente.
- **Webhooks financeiros fail-closed**: Asaas (token) e Nuvemshop (HMAC) rejeitam 503 se secret ausente — evita webhook forjado de "pagamento recebido".
- **Resiliência no sync Asaas** (`asaas/sync.ts:231-245`): `Promise.allSettled` isola falha por sub-recurso; só lança se customers E payments falharem.
- **Sync por conta com try/catch individual** (GA4/Meta/Google/Nuvemshop): grava SyncLog RUNNING→SUCCESS/FAILED, cria alerta `SYNC_FAILED`, auto-dismiss em sucesso; falha de uma conta não derruba as demais.
- **Idempotência**: upserts por `externalId`/`asaasId`; Expenses Asaas não sobrescrevem categoria recategorizada (`asaas/sync.ts:191-207`).
- **Asaas e Z-API/Evolution usam IntegrationSetting** (regra 5) com fallback env.
- **Rotas de sync com auth dupla**: session ADMIN/MANAGER + ownership, ou `x-cron-secret`; ownership verificado por conta.

### (c) Riscos por severidade

**ALTO**
- **Webhook WhatsApp inbound fail-open** — `api/webhooks/whatsapp/route.ts:18-24`: `client-token` só é validado *se* o header vier. Sem header → aceita qualquer payload e **cria leads/atividades**. Diverge do padrão fail-closed dos webhooks financeiros; permite spam/injeção no CRM.
- **OAuth callback Nuvemshop com `state` não assinado e sem auth** — `api/nuvemshop/callback/route.ts:23-27`: `state` é base64 JSON `{clientId,userId}`, não assinado nem checado contra sessão. GET público cria PlatformAccount + registra webhooks → CSRF/vínculo forjado de loja.

**MÉDIO**
- **`leads/capture` público, CORS `*`, sem rate-limit/anti-spam** — `api/leads/capture/route.ts:32,117-123`. Dedup por telefone mitiga parcial; leads sem telefone passam livres.
- **GA4/Google Ads/Meta/Windsor usam só env vars, não IntegrationSetting** — `ga4/client.ts:146-159`, `google-ads/client.ts:36-85`, `meta-ads/client.ts:49`, `windsor/client.ts:57`. Regra 5 pede chaves dinâmicas; hoje trocar credencial exige redeploy.
- **Webhook Nuvemshop recalcula/sobrescreve MetricSnapshot `PAID`** — `api/nuvemshop/webhooks/route.ts:137-192`: fonte de verdade concorrente entre webhook e sync, sem reconciliação.

**BAIXO**
- **Email pessoal hardcoded no User-Agent** — `services/nuvemshop/client.ts:135` (`kyn.leonardo@gmail.com`). Não é segredo, mas deveria ser env obrigatória.
- **Asaas webhook 200 em erro interno sem AuditLog** — `api/asaas/webhook/route.ts:50-53`: erro só em `console.error`; pagamento pode falhar silenciosamente (viola regra 8).
- **Meta `validateToken`/`getAdAccounts` sem timeout** — `services/meta-ads/client.ts:176,200`: `fetch` sem `signal` (só insights têm timeout).

### 🔒 Travas / Fluidez

1. **Webhook WhatsApp fail-open** trava confiabilidade do CRM (leads forjados + follow-ups falsos). Correção simples, baixo risco.
2. **Callback Nuvemshop sem state assinado** trava segurança de onboarding de loja; exige assinar/verificar state contra sessão.
3. **Credenciais Google/Meta em env** travam autonomia operacional (troca de chave só com dev/redeploy) — contra "Arkza em processo". Migração p/ IntegrationSetting é aditiva.
4. **Falta AuditLog em webhooks financeiros** trava rastreabilidade da regra 8.
# Auditoria — Segurança

> Escopo: autenticação, RBAC, proteção de endpoints, segredos, exposição de dados.
> Método: read-only sobre `src/`. Data: 2026-07-01.

## (a) Modelo de auth / RBAC

- **Auth:** JWT HS256 assinado com `SESSION_SECRET`, armazenado em cookie
  `performli_session` httpOnly, `secure` em produção, `sameSite=lax`, 7 dias
  (`src/lib/session.ts`). `getSecretKey()` lança se `SESSION_SECRET` ausente —
  fail-closed correto.
- **Middleware (`src/middleware.ts`):** protege **páginas** por `PROTECTED_PREFIX`
  (redireciona p/ login se não autenticado). O matcher **exclui `/api`**
  (`(?!api|...)`), então a proteção das rotas de API depende inteiramente de
  cada handler chamar `getSession()` / checar segredo. Não há verificação de
  papel no middleware (só autenticação).
- **RBAC:** `ADMIN`/`CS` = `canViewAll` (leitura ampla). `MANAGER`/`ANALYST`
  = escopo por `assignments` (posse) na DAL (`src/lib/dal.ts`). Mutações
  sensíveis fazem checagem de papel no handler; posse via
  `assertClientMutationAccess` (`src/lib/audit.ts`).

## (b) Pontos fortes

- **Segredos:** nenhum hardcoded encontrado (grep de padrões). Chaves de
  integração via `IntegrationSetting` (ex.: `settings/asaas`) ou env.
- **Webhooks fail-closed corretos:** `asaas/webhook` (token
  `asaas-access-token`, 503 sem env) e `nuvemshop/webhooks` (HMAC SHA256,
  503 sem `NUVEMSHOP_APP_SECRET`).
- **Crons protegidos:** `cron/daily|digest|recurrences|resultados` exigem
  `CRON_SECRET` (Bearer ou `x-cron-secret`), fail-closed quando env ausente.
- **Seed protegido:** `api/seed` e `admin/seed-contracts` exigem
  `x-seed-secret`/sessão ADMIN.
- **Financeiro/contratos ADMIN-only:** `financeiro/summary`,
  `financeiro/expenses`, `financeiro/cashflow`, `admin/contract-fee`,
  `settings/asaas` checam `role !== 'ADMIN'`. Cockpit e DAL financeira
  (`getOverdueInvoices`, `getCockpitData`) só retornam dados p/ `canViewAll`.
- **Chave Asaas mascarada** na resposta do GET (`settings/asaas`).
- **Todas as ~45 rotas** de API têm `getSession()` ou checagem de segredo —
  nenhuma rota autenticada ficou totalmente aberta.

## (c) VULNERABILIDADES por severidade

### ALTA
1. **`nuvemshop/callback` sem autenticação + `clientId` controlado pelo
   chamador** — `src/app/api/nuvemshop/callback/route.ts:12-28`. O `state` é
   apenas base64 (não assinado/HMAC) e traz `clientId`. Quem obtiver um `code`
   OAuth válido pode vincular uma loja Nuvemshop a **qualquer** `clientId`
   arbitrário (IDOR / falta de verificação de posse + state não assinado).
   Fluxo OAuth deveria validar sessão e assinar/verificar o `state`.

### MÉDIA
2. **Webhook WhatsApp fail-OPEN** —
   `src/app/api/webhooks/whatsapp/route.ts:18-24`. A validação do
   `client-token` só ocorre **se o header estiver presente**. Sem header,
   qualquer um pode criar `AgencyLead`/`AgencyActivity` (spam/poluição de CRM).
   Deveria exigir o token (fail-closed) como os demais webhooks.
3. **`leads/capture` público sem rate-limit / CORS `*`** —
   `src/app/api/leads/capture/route.ts:32,117-122`. Endpoint público (esperado
   p/ landing pages) mas `Access-Control-Allow-Origin` reflete qualquer origin
   e não há rate-limit → abuso/inundação de leads. Mitigar com throttle/captcha.
4. **Mutação de lead sem checagem de papel/posse** —
   `src/app/api/comercial/leads/[id]/route.ts:25-26` (PATCH) e
   `comercial/leads/route.ts:41` (POST): exigem apenas sessão (qualquer papel,
   incl. ANALYST). CS deveria ser leitura ampla "sem mutações indevidas"
   (CLAUDE.md). DELETE já restringe a ADMIN/CS. Confirmar regra de negócio.

### BAIXA
5. **Senhas default no seed** — `src/app/api/seed/route.ts:13-15`
   (`admin123`/`gestor123`/`analista123`). Protegido por `SEED_SECRET`, mas se
   rodado em produção cria contas com senhas triviais. Restringir a dev /
   forçar troca.
6. **Erro cru exposto** — `api/seed/route.ts:121` retorna `String(err)` no
   corpo; vazamento menor de detalhes internos. Idem `settings/asaas`.
7. **`team/members` expõe lista de usuários a qualquer papel autenticado**
   (`route.ts:7`) — apenas id/name/role/avatar; baixo risco, aceitável.

## (d) 🔒 Travas / Fluidez

- **Trava real (ALTA):** assinar/verificar `state` e exigir sessão+posse no
  `nuvemshop/callback`. Sem isso, dados de loja podem ser injetados em clientes
  alheios. Aplicável agora, baixo risco de regressão.
- **Trava (MÉDIA):** tornar webhook WhatsApp fail-closed exigindo
  `ZAPI_CLIENT_TOKEN`. Aplicável agora; validar env antes do deploy p/ não
  derrubar recebimento.
- **Fluidez:** middleware não cobre `/api` por design (Next). Aceitável desde
  que todo handler continue checando sessão — recomenda-se um helper único
  (`requireApiSession(role)`) para evitar rota futura esquecer a checagem.
- **Fluidez:** centralizar checagem de papel de mutação em comercial/leads
  para alinhar com "CS sem mutações indevidas".
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
## Crons & Automação

> Escopo: `src/app/api/cron/*` + serviços de monitor/gerador em `src/services/*`.
> Data: 2026-07-01. Read-only (nada alterado fora de docs/).

### (a) Rotinas e o que fazem

**Rotas de cron (`vercel.json` → 4 schedules):**

| Rota | Schedule (UTC) | O que faz |
|------|----------------|-----------|
| `/api/cron/daily` | `0 11 * * *` (08h BRT) | Orquestra ~20 passos: syncs (Meta/GA4/GoogleAds/Nuvemshop/Asaas), health, oscilação, churn, anti-churn silencioso, check-ins, inadimplência, follow-up de lead, escalação de tarefa, budget, contas críticas, war room (escalação+monitor), contratos. Domingo: relatórios+checklists semanais. Segunda: sync de metas semanais. |
| `/api/cron/digest` | `30 11 * * *` (08h30 BRT) | Envia digest diário no WhatsApp. Separado do daily para que um sync lento não bloqueie o envio. |
| `/api/cron/recurrences` | `0 10 * * *` (07h BRT) | Gera tarefas recorrentes a partir de templates. Idempotente por `template:cliente:janela`. |
| `/api/cron/resultados` | `0 9 * * 1` (06h BRT seg) | Atualiza Resultado semanal (ROAS/GA4) de e-commerce e deriva Etapa. Idempotente por `Client.resultadoWeek`. |

**Desacoplamento check-in (confirmado):** `checkin-monitor.ts` só **lê** `weeklyCheckins`
e dispara alertas `CHECKIN_MISSING` / `CHECKIN_REJECTED_STALE`. Não cria nem preenche
check-in. O relatório/check-in do cliente é **manual**; o cron é puramente controle
interno. Desacoplados. ✅

### (b) Pontos fortes

- **Isolamento de passos no `daily`**: cada um dos ~20 passos tem `try/catch` próprio e
  grava resultado em `summary`; falha de um passo não derruba os demais (daily/route.ts:68-330).
- **try/catch POR cliente/item** presente em: health-scorer:481, churn-scorer:151,
  oscillation-detector:202, critical-account-detector:50, antichurn-monitor:34,
  checkin-monitor:55, warroom-monitor:63, recurrence-engine:76, resultado-engine:71,
  task-escalation:30, lead-followup-checker:46, inadimplencia-checker:54/90,
  warroom-escalation:42. Excelente cobertura.
- **CRON_SECRET** validado nas 4 rotas (Bearer ou `x-cron-secret`); rejeita se env ausente.
  `digest` loga aviso explícito quando falta env.
- **AuditLog** via `writeAuditLog` (append-only, nunca lança): critical-account-detector,
  budget-monitor, contract-expiry-checker, warroom-escalation.
- **AutomationLog** por resultado (SUCESSO/FALHA/DUPLICIDADE_EVITADA) em recurrence, resultado,
  task-escalation, lead-followup — ótima trilha de execução por cliente.
- **Idempotência real**: recurrence usa `Task.idempotencyKey` único (recurrence-engine:87);
  resultado usa `Client.resultadoWeek` (resultado-engine:73). Ambos com `?force=1`.
- `writeAuditLog` engole o próprio erro — auditoria nunca derruba a mutação (audit.ts:64).

### (c) Riscos por severidade

**🔴 ALTO**
- **`generateAllWeeklyReports` sem try/catch por cliente** — `weekly-report-generator.ts:852`.
  Loop chama `generateWeeklyReportForClient` sem isolar; uma exceção em um cliente aborta
  TODOS os relatórios de domingo. Contradiz a regra técnica #7 do CLAUDE.md. No daily o passo
  é envolto, mas isso mata a geração inteira, não só um cliente.
- **`generateAllWeeklyChecklists` sem try/catch por manager** — `weekly-checklist-generator.ts:149`
  e `buildChecklistItemsForManager:57`. Mesma falha: um manager quebra a rotina inteira.

**🟡 MÉDIO**
- **`lastRunAt` só existe em recorrências** — `recurrence-engine.ts:140` grava
  `TaskRecurrenceRule.lastRunAt`. As rotas `daily`, `digest`, `resultados` e todos os serviços
  de monitor NÃO registram última execução (regra #9). Nenhuma tela consegue responder "quando
  a rotina rodou por último" (regra #10) além de inspecionar `Alert.createdAt`. `SyncLog`
  (schema:1187) existe e está subutilizado aqui.
- **Health/churn/oscillation/antichurn/warroom-monitor não gravam AuditLog** — geram apenas
  Alert. A regra #8 pede AuditLog para automação crítica; churn/health que mudam status de
  cliente são críticos e ficam sem trilha de auditoria formal. AutomationLog também ausente.
- **Sem timeout global explícito no fan-out do `daily`** — passos rodam sequencialmente até
  `maxDuration: 300`s. Com ~30 clientes × vários syncs, risco de timeout que aborta passos
  finais (contratos, war room). O encadeamento sequencial amplifica.

**🟢 BAIXO**
- `digest` retorna 500 em falha; Vercel Cron pode re-tentar e reenviar mensagem duplicada
  (sem idempotência no digest). Recurrence/resultado estão protegidos por idempotência.
- `weekly-report`/`checklist` só têm dedup por `upsert` semanal; rodar 2x no domingo reprocessa
  tudo (custo, não correção).

### 🔒 Travas / Fluidez

| # | Trava | Arquivo:linha | Correção | Aplicável agora | Risco |
|---|-------|---------------|----------|-----------------|-------|
| 1 | Relatórios semanais sem try/catch por cliente | weekly-report-generator.ts:852 | Envolver `generateWeeklyReportForClient` em try/catch; contar falhas | sim | baixo |
| 2 | Checklists sem try/catch por manager | weekly-checklist-generator.ts:149 | Envolver `generateWeeklyChecklistForManager` em try/catch | sim | baixo |
| 3 | Rotinas sem `lastRunAt` (regra #9/#10) | daily/digest/resultados + monitors | Gravar `SyncLog` por rotina com timestamp/status | sim | baixo |
| 4 | Automações de status sem AuditLog (regra #8) | health-scorer.ts:481, churn-scorer.ts:151 | Adicionar `writeAuditLog` em mudanças críticas de status/score | sim | baixo |
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
- `PROJECT_STATE.md` — estado global detalhado (23 KB), "Última atualização:
  2026-06-30" (véspera; convém revisar após cada merge).

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
2. **PROJECT_STATE.md vivo** — mantido append-only pelo maestro, serve de fonte
   de verdade do progresso (cabeçalho em 2026-06-30).
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
