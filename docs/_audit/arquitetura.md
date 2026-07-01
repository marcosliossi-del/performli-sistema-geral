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
