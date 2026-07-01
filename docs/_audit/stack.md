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
