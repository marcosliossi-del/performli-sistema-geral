# Diagnóstico — Área de Clientes (Portal com Dashboard de KPIs)

> Fase 0 do master prompt. Código prevalece sobre docs. Data: 06/07/2026.

## 1. O que existe (mapa verificado no código)

| Área | Achado | Evidência |
|---|---|---|
| Stack | Next.js 16 App Router · React 19 · TS · Prisma 7 · Neon (pooled via @prisma/adapter-pg) · Vercel | package.json |
| Auth interno | JWT (jose, HS256) em cookie httpOnly `performli_session`; custom (sem NextAuth/Clerk) | src/lib/session.ts |
| Middleware | Whitelist PROTECTED_PREFIX → redireciona p/ /login interno. `/portal` NÃO está na lista (página se autoprotege) | src/middleware.ts |
| RBAC | enum Role (ADMIN/CS/GESTOR_TRAFEGO/…) + normalizeRole/can. Vários Record<Role,…> EXAUSTIVOS no código | src/lib/rbac |
| Dados de e-commerce | `MetricSnapshot` — agregado DIÁRIO por (clientId, platformAccountId, date). Plataformas: META_ADS, GOOGLE_ADS, TIKTOK_ADS, GA4, NUVEMSHOP | prisma/schema.prisma:356 |
| Chave de tenant | `MetricSnapshot.clientId` (FK Client, cascade) | schema:386 |
| Índices | `@@unique([platformAccountId,date])`, `@@index([clientId,date])` (composto JÁ EXISTE), `@@index([date])` | schema:389-391 |
| Fonte única de realizado | `aggregateSnapshots(snapshots, metric, businessType)` (health-scorer) + `getRealizado`/`resolveJanela` (lib/metas/realizado) — mesmas usadas por metas/saúde internas | src/services/health-scorer.ts:95+, src/lib/metas/realizado.ts |
| Métricas computáveis | FATURAMENTO (GA4 revenue), CONVERSIONS/pedidos, TICKET_MEDIO, TAXA_CONVERSAO (ga4Purchases/ga4Sessions), SESSÕES (ga4Sessions), INVESTMENT/SPEND, ROAS, CAC, CPS… | health-scorer.ts:95-192 |
| Fuso | Helpers SP: saoPauloDateString/saoPauloDayStart; padrão do sistema | src/lib/utils.ts |
| Gráficos | Recharts ^3.8.0 JÁ instalado | package.json |
| Validação | zod NÃO está no package.json → validação manual por whitelist | package.json |
| Cron | Sync diário Meta/Google/GA4 → MetricSnapshot (~1×/dia) → TTL de cache coerente: 15 min é sobra | vercel.json |

## 2. As 5 decisões de arquitetura (com justificativa)

1. **Auth do portal: MESMO mecanismo, NAMESPACE separado.** Reusa o padrão jose+JWT+cookie httpOnly do auth interno, mas com cookie próprio (`performli_portal`), payload próprio e model próprio `ClientPortalUser`. NÃO adicionamos valor `CLIENT` ao enum `Role`: (a) há `Record<Role,…>` exaustivos espalhados — adicionar valor quebraria compilação em cadeia (regressão real já vivida no projeto); (b) staff e cliente externo no mesmo namespace de sessão é risco de confusão de privilégio. Separação dura = isolamento nº 1 do projeto.
2. **Dados: reusar `aggregateSnapshots` como ÚNICA fonte de cálculo.** O portal mostra exatamente os mesmos números das telas internas (metas/saúde) — coerência operacional. MetricSnapshot já é agregado diário (poucas linhas/cliente/dia); agregar N≤90 dias × ≤5 contas no Node NÃO é "milhares de linhas" — é o padrão vigente do repo. Índice composto exigido já existe; nenhum índice novo (justificado: nada a criar).
3. **Guard central `getAuthorizedClient()`** (src/lib/portal/session.ts): resolve cookie→JWT→ClientPortalUser ativo→clientId. Chamado no topo de TODA página/action do portal. Defesa em profundidade: TODAS as queries filtram `clientId` explicitamente mesmo com o guard. Middleware ganha bloco `/portal` (cookie do portal ausente → redirect /portal/login). clientId JAMAIS vem de param/body/header.
4. **KPI grid orientado a configuração** (`src/lib/portal/kpi-registry.ts`): array tipado {key,label,format,chartType,provisional,metric}. Frontend renderiza a partir do registry; contrato de dados padronizado `{metric,value,previousValue,delta,deltaPct,series[]}`. Plugar a lista real futura = editar 1 arquivo; KPI cujo dado não existir no schema → NÃO inventar, listar como pendência.
5. **Login: e-mail + senha com convite do admin** (bcryptjs já no repo; padrão do seed de usuários internos). Admin cria acesso → senha temporária exibida UMA vez. Rate limit serverless-safe por contador no banco (failedAttempts/lockedUntil no ClientPortalUser) — sem estado em memória. Magic link descartado: exigiria fluxo de e-mail novo (Resend existe mas sem template/fluxo) — anotado como evolução.

## 3. O que será criado (tudo ADITIVO)

- `prisma`: model `ClientPortalUser` (+migration aditiva) — id, clientId FK, email @unique, name, passwordHash, active, failedAttempts, lockedUntil, lastLoginAt, timestamps, @@index([clientId]).
- `src/lib/portal/session.ts` — sessão do portal (jose, cookie `performli_portal`, 7d) + `getAuthorizedClient()`.
- `src/lib/portal/kpis.ts` — `getPortalKpis(clientId, period)` e tipos; períodos: `7d|14d|30d|mes_atual|mes_anterior` (whitelist manual), janelas na parede SP, comparação vs. período anterior equivalente, série diária p/ gráfico. Cache `unstable_cache` com chave [clientId, period], TTL 900s.
- `src/lib/portal/kpi-registry.ts` — 7 KPIs provisórios (`provisional: true`): faturamento, pedidos, ticket_medio, sessoes, taxa_conversao, investimento, roas.
- `src/app/actions/portalAuth.ts` — login/logout do portal (rate limit por banco, AuditLog).
- `src/app/actions/portalAccess.ts` — ADMIN: criar acesso (senha temporária), revogar/reativar, reset de senha, listar por cliente (AuditLog em tudo).
- `src/app/portal/*` — layout próprio (SEM sidebar interna), login, dashboard (Server Components + Suspense por card, mobile-first 390px, pt-BR R$/dd-mm, estados loading/vazio/erro).
- `src/app/(dashboard)/portal-acessos/page.tsx` + componente — gestão admin (criar/revogar/reset/último login), entrada no Sidebar.
- `src/middleware.ts` — bloco `/portal` (público: /portal/login; resto exige cookie portal válido).
- `tests/portal-tenant-isolation.test.md` + script — prova de isolamento (ver §5 do prompt; execução real depende de deps/CI, registrado como evidência estática + roteiro).

## 4. Contrato entre agentes (interfaces congeladas)

```ts
// src/lib/portal/session.ts
export type PortalSession = { portalUserId: string; clientId: string; email: string; name: string }
export async function getPortalSession(): Promise<PortalSession | null>
export async function getAuthorizedClient(): Promise<{ session: PortalSession; client: { id: string; name: string; slug: string } }> // redirect('/portal/login') se ausente

// src/lib/portal/kpis.ts
export type PortalPeriod = '7d' | '14d' | '30d' | 'mes_atual' | 'mes_anterior'
export type KpiPoint = { date: string; value: number | null }        // date 'YYYY-MM-DD' (SP)
export type KpiData = { metric: string; value: number | null; previousValue: number | null; delta: number | null; deltaPct: number | null; series: KpiPoint[] }
export async function getPortalKpis(clientId: string, period: PortalPeriod): Promise<Map<string, KpiData>>
export function normalizePeriod(raw: string | undefined): PortalPeriod  // default '30d'

// src/lib/portal/kpi-registry.ts
export type KpiFormat = 'currency' | 'number' | 'percent' | 'ratio'
export type KpiDef = { key: string; metric: string; label: string; format: KpiFormat; chartType: 'line' | 'bar'; provisional: boolean; helpText: string }
export const KPI_REGISTRY: KpiDef[]
```

## 5. Divergências doc×código encontradas
- Nenhum doc anterior descreve auth externo — não há divergência, há lacuna (este doc passa a ser a referência).
- `MetricSnapshot` não tem coluna `sessions`; sessões vêm do mapeamento GA4 dentro de `aggregateSnapshots` (ga4Sessions). Registrado para não induzir queries diretas erradas.
