## Stack & Dependências

Auditoria read-only da dimensão Stack & Dependências do PERFORMLI. Data: 2026-07-01.

### (a) O que existe e como funciona

- **`package.json`** — App Next.js 16 (`next@16.2.1`, `react@19.2.4`), Prisma 7 (`prisma`/`@prisma/client`/`@prisma/adapter-pg@^7.5.0`, driver `pg@^8.20.0`), Tailwind v4 (`tailwindcss@^4`, `@tailwindcss/postcss@^4`), auth JWT via `jose@^6.2.2` + `bcryptjs@^3.0.3`, IA via `@anthropic-ai/sdk@^0.80.0`, e-mail via `resend@^6.9.4`, UI Radix + `lucide-react` + `recharts@^3.8.0` + `@hello-pangea/dnd`. PDF via `pdf-parse@^2.4.5`.
- **Build script** (`package.json:7`): `prisma generate && npm run migrate:deploy && next build`. `migrate:deploy` (`package.json:8`) roda `prisma migrate deploy` com 2 retries (12s / 25s) para cold-start do banco Neon — resiliência boa.
- **`next.config.ts`** — `compress`, `poweredByHeader:false`, e `optimizePackageImports` para `lucide-react` e `@anthropic-ai/sdk`. Minimalista.
- **`tsconfig.json`** — `strict:true`, `moduleResolution:"bundler"`, `target:ES2017`, path alias `@/*`. Correto para Next 16.
- **`vercel.json`** — 4 crons (daily 11h, digest 11h30, recurrences 10h, resultados seg 9h) e `maxDuration` por rota (sync/cron 300s, nuvemshop 60s, knowledge 120s). Alinhado à regra de cron do CLAUDE.md.
- **`prisma.config.ts`** — schema/migrations/seed padrão, datasource via `DATABASE_URL`.
- **`eslint.config.mjs`** — flat config com `eslint-config-next` core-web-vitals + typescript.
- **`postcss.config.mjs`** — apenas `@tailwindcss/postcss` (padrão Tailwind v4, sem `autoprefixer` explícito, correto na v4).
- **`@anthropic-ai/sdk`** — instanciado em 7 pontos (`src/app/api/ai/chat/route.ts:8`, `dashboard-chat/route.ts:5`, `knowledge/upload/route.ts:9`, `src/services/weekly-report-generator.ts:16`, `campaign-insight-generator.ts:18`, `src/app/actions/planoAcao.ts:8`, `insights.ts:7`).

### (b) Pontos fortes

- Versões modernas e coerentes entre si (Next 16 + React 19 + eslint-config-next 16.2.1 casados).
- `prisma generate` no build evita client desatualizado no deploy; retries de migrate mitigam cold-start Neon.
- `maxDuration` por rota respeita limites de serverless para syncs/crons longos.
- `strict` TS ligado; `server-only` presente para proteger código server.
- `next.config.ts` enxuto, sem `ignoreBuildErrors`/`eslint.ignoreDuringBuilds` (build falha de verdade se houver erro — bom para o gate CI Vercel).

### (c) Riscos / Dívidas

**Crítico**
- **Model ID de IA provavelmente inválido — quebra em runtime.** `model: 'claude-sonnet-4-6'` em `src/app/api/ai/chat/route.ts:158` e `src/services/weekly-report-generator.ts:325,555,786,916`. Não existe modelo `claude-sonnet-4-6` no catálogo Anthropic (os válidos são `claude-sonnet-4-5` / `claude-sonnet-4-20250514` etc.). Toda chamada a esses fluxos (chat IA, relatório semanal) retorna 404 `not_found_error` da API. Falha silenciosa que só aparece quando o usuário aciona a feature. Verificar também `claude-haiku-4-5-20251001` (data-suffix suspeito; o alias estável é `claude-haiku-4-5`).

**Alto**
- **Clientes Anthropic sem `timeout` — viola regra técnica 6 do CLAUDE.md.** Todas as 7 instâncias (`new Anthropic()` / `new Anthropic({ apiKey })`) não passam `timeout` nem `maxRetries`. "Toda chamada externa tem timeout" é inegociável. Uma chamada travada pode consumir os 300s de `maxDuration` do cron e derrubar a rotina.
- **`apiKey` inconsistente entre instâncias.** Algumas usam `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` (chat/dashboard/upload) e outras `new Anthropic()` sem apiKey explícita (`weekly-report-generator.ts:16`, `campaign-insight-generator.ts:18`, `planoAcao.ts:8`, `insights.ts:7`), dependendo do fallback implícito para `ANTHROPIC_API_KEY`. Funciona, mas frágil — se a env mudar de nome, metade quebra e metade não.

**Médio**
- **`next-auth@^5.0.0-beta.30` como dependência de produção, aparentemente não usado.** `next-auth` só aparece em `package.json`; a auth real usa `jose` (`src/middleware.ts`, `src/lib/session.ts`). Dependência beta pesada e sem uso aumenta superfície de risco/tamanho de bundle. Confirmar e remover se órfã.
- **Dependência em versão beta em produção.** `next-auth@5.0.0-beta.30` é beta; se de fato for usada em algum ponto, é risco de breaking change num `beta`.
- **`@types/*` como dependencies (não devDependencies).** `@types/bcryptjs`, `@types/pg`, `@types/pdf-parse` estão em `dependencies` (`package.json:32-33,55` — pdf-parse está em dev). Types não são runtime; pertencem a devDependencies. Impacto baixo (Vercel instala tudo), mas polui o grafo de produção.

**Baixo**
- **Ranges `^` em libs críticas.** `next` e `react` estão pinados exatos (bom), mas Prisma/pg/anthropic usam `^`. Com build que roda `prisma generate` + `migrate deploy` sem lockfile determinístico garantido, um minor de Prisma pode alterar comportamento. Existe `package-lock.json` — verificar se Vercel usa `npm ci` (respeita lock) e não `npm install`.
- **`@anthropic-ai/sdk@^0.80.0`** — SDK pré-1.0, minors podem trazer breaking changes; range `^` só protege até o próximo major (não existe major aqui). Pinar.
- **Sem `engines` no `package.json`.** Node do Vercel não está fixado; um bump de Node default do Vercel pode mudar comportamento sem aviso.
- **Sem `autoprefixer` / browserslist explícito** — aceitável no Tailwind v4, mas documentar alvo de browsers seria bom.

### 🔒 Travas / Fluidez

Melhorias concretas de baixo risco (ordenadas por retorno):

1. **Corrigir os model IDs de IA** (`chat/route.ts:158`, `weekly-report-generator.ts:325,555,786,916`): trocar `claude-sonnet-4-6` por um alias válido (`claude-sonnet-4-5`) e validar `claude-haiku-4-5-20251001`. Trava contra quebra silenciosa das features de IA. Baixo risco, alto impacto.
2. **Centralizar a criação do cliente Anthropic** num único módulo `src/lib/anthropic.ts` que exporte `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 })`, e importar nos 7 pontos. Elimina a inconsistência de apiKey e cumpre a regra de timeout de uma vez.
3. **Adicionar `engines.node`** ao `package.json` (ex.: `"node": ">=20"`) para travar a versão de runtime no Vercel.
4. **Remover `next-auth`** se confirmado órfão (grep mostra uso zero fora do package.json) — reduz bundle e superfície beta.
5. **Mover `@types/*` para `devDependencies`** — higiene do grafo de produção.
6. **Pinar `@anthropic-ai/sdk`** em versão exata (SDK <1.0) e garantir `npm ci` no deploy (respeita `package-lock.json`).
