# HANDOFF — Próxima Sessão de IA (Performli)

> Documento de passagem de bastão. Objetivo: outra sessão de IA assume o projeto
> **imediatamente**, sem redescobrir contexto. Leia também `CLAUDE.md` (regras
> inegociáveis) e `PROJECT_STATE.md` (log de orquestração, append-only).

Stack: Next.js 16 · React 19 · TypeScript strict · Prisma 7 · PostgreSQL (Neon) ·
Auth JWT (jose) em cookie httpOnly · Tailwind v4. Deploy: Vercel.

---

## 1. Como iniciar (scripts)

Do `package.json`:

| Script | Comando | Uso |
|---|---|---|
| `dev` | `next dev` | desenvolvimento local |
| `build` | `prisma generate && npm run migrate:deploy && next build` | build de produção (Vercel) |
| `migrate:deploy` | `prisma migrate deploy` com **2 retries** (12s / 25s) | aplica migrations; retries cobrem cold-start do Neon |
| `start` | `next start` | servir build |
| `lint` | `eslint` | lint |
| `seed` | `tsx prisma/seed.ts` | seed (7 áreas + 21 POPs + templates recorrentes) |

> **IMPORTANTE — não há ambiente local funcional.** `node_modules` está vazio e o
> registry npm retorna 403 neste ambiente. Você **não** consegue rodar
> `npm install`, `build`, `lint` nem testes localmente. Ver seção 3.

### Variáveis de ambiente essenciais

Runtime obrigatório:
- `DATABASE_URL` — Postgres/Neon (datasource do Prisma).
- `SESSION_SECRET` — assina o JWT HS256 do cookie `performli_session` (`src/lib/session.ts`).
- `CRON_SECRET` — protege as 4 rotas de cron (Bearer ou `x-cron-secret`); **fail-closed**: sem ele, cron rejeita tudo.
- `ANTHROPIC_API_KEY` — features de IA (plano de ação, relatório semanal, chat). Não bloqueia o build; falha só em runtime.

Bootstrap/manutenção (usar com cuidado — ver dívidas):
- `SEED_SECRET` — libera `/api/seed` (cria admins com senhas fracas — bloquear em prod).
- `RESEND_*` — e-mail.

Chaves de integração — **preferir `IntegrationSetting` (tabela no DB)**, não env
hardcoded (regra CLAUDE.md #5). Padrão dos serviços: lê `IntegrationSetting`
primeiro, fallback `process.env`. Cobre: Asaas (`ASAAS_API_KEY`, `ASAAS_SANDBOX`,
`ASAAS_WEBHOOK_TOKEN`), WhatsApp Z-API (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`,
`ZAPI_CLIENT_TOKEN`) e Evolution (`EVOLUTION_URL/KEY/INSTANCE`), Meta
(`META_SYSTEM_TOKEN`, `META_APP_ID/SECRET`), Google Ads / GA4
(`GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`,
`GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`),
Windsor (`WINDSOR_API_KEY`), Nuvemshop (`NUVEMSHOP_APP_ID/SECRET/USER_AGENT`).

---

## 2. Build / Deploy

- Deploy na **Vercel**. O build roda `prisma generate && npm run migrate:deploy && next build`.
- `migrate:deploy` tem retry embutido para **cold-start do Neon** (banco demora a acordar): tenta, espera 12s, tenta, espera 25s, tenta.
- `next.config.ts` **não** ignora erros (`ignoreBuildErrors`/`eslint.ignoreDuringBuilds` desligados) → **erro de type/lint QUEBRA o build**. É o único gate automático (não há CI nem testes).
- `vercel.json`: 4 crons + `maxDuration` por rota (sync/cron 300s, nuvemshop 60s, knowledge 120s).

### VERIFICAÇÃO = só via CI da Vercel

Não existe `node_modules` local, test runner, nem `.github/workflows`. A **única**
forma de saber se o código compila é abrir PR e **aguardar o build da Vercel ficar
verde**. Nunca faça merge sem o check verde. Trate o build da Vercel como seu
compilador remoto.

---

## 3. Fluxo de trabalho (fatia vertical)

Uma fatia = um POP / uma tela / uma correção coesa. Nunca misture escopos.

```
branch (feat/...)  →  commit  →  push  →  abrir PR
   →  AGUARDAR build Vercel VERDE  →  merge squash  →  próxima fatia
```

- Trabalhe sempre em branch (`feat/<slice>`), nunca direto em `main` (`main` = produção).
- Após o merge, **atualize `PROJECT_STATE.md`** (append-only) com o que foi entregue e models novos.
- Orquestração por agentes (ver `CLAUDE.md`): auditoria → lacunas → arquitetura (GATES) → escrita → `guardiao` (aprova/reprova, nunca conserta). Nenhum agente de escrita roda antes das arquiteturas aprovadas.

---

## 4. Armadilhas conhecidas e recorrentes (leia antes de commitar)

Estas quebraram builds antes. Como não há verificação local, cada uma custa um
ciclo de PR/CI perdido.

1. **Filtros de enum no Prisma.** NÃO faça cast `as string[]` em arrays de enum
   dentro de `where`. Tipar com `Prisma.XWhereInput['campo']` ou construir o
   objeto inline com os literais do enum. Cast para `string[]` estoura o
   type-check do Prisma 7.
2. **`import type { ReactNode }`** — importe o tipo nomeado
   (`import type { ReactNode } from 'react'`) em vez de usar `React.ReactNode`
   (que exige `import React` e falha no lint/type em vários componentes).
3. **Imports não usados do `lucide-react`.** Remova ícones importados e não
   usados **antes** do commit — o lint (`eslint-config-next`) reprova e quebra o
   build da Vercel.
4. **`globals.css` (Tailwind v4) — camada de overrides.** A retematização central
   (paleta ciano-petróleo Arkza) funciona por overrides de classes de cor
   arbitrárias **sem `@layer`**, que por isso vencem as utilities do Tailwind v4.
   Overrides **camadados** (`@layer`) NÃO reescrevem as utilities. Mexeu na
   paleta? Mantenha as regras fora de `@layer` ou nada muda. É frágil por design —
   toque com cuidado.
5. **Migrations aditivas e idempotentes.** SEMPRE. Enums:
   `CREATE TYPE ... EXCEPTION WHEN duplicate_object` e
   `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. Colunas:
   `ADD COLUMN IF NOT EXISTS`. Índices: `CREATE INDEX IF NOT EXISTS`. Nunca
   edite migration já aplicada em produção (histórico imutável). Migrations
   antigas com `ALTER TYPE ADD VALUE` sem guarda existem — só quebram em replay
   do zero, não corrigir.

---

## 5. Arquivos críticos (cuidado redobrado)

- **`src/lib/dal.ts` (~3.5k linhas)** — monólito de TODA leitura de tela
  (`import 'server-only'`, `requireSession` via `cache()`, `unstable_cache` em
  poucos pontos). Ponto de contenção de merge; risco de import acidental de
  lógica de mutação. Alterar por fatia; não refatorar em bloco.
- **`src/middleware.ts`** — proteção de rota por **allowlist manual**
  (`PROTECTED_PREFIX`). Página nova cujo path não comece por um prefixo listado
  fica **pública por omissão**. Ao criar rota nova sob `(dashboard)`, confirme
  que o prefixo está protegido. O matcher exclui `api/` → cada rota de API
  protege a si mesma via `getSession()`.
- **`src/app/globals.css`** — design system + camada de overrides (ver armadilha 4).
- **`src/lib/audit.ts`** — helpers canônicos: `assertClientMutationAccess(session, clientId, {allowCS})` (auth+papel+posse) e `writeAuditLog(...)` (append-only). USE-OS em toda mutação.

---

## 6. Regras inegociáveis (resumo do `CLAUDE.md`)

Toda implementação DEVE respeitar (a lista completa está no `CLAUDE.md`):

- **Toda mutação valida auth + papel + posse.** Use
  `assertClientMutationAccess`. Nunca crie bypass de autorização. Referência de
  ouro: `src/app/actions/warRoom.ts` `saveWarRoomPlan`.
- **Toda chamada externa tem timeout** (`AbortSignal.timeout`). Regra #6.
- **Loops de cron têm try/catch POR cliente/processo** — falha em um cliente não
  derruba o lote. Regra #7.
- **Automação crítica gera `AuditLog`.** Regra #8.
- **Rotina recorrente registra `lastRunAt`.** Regra #9.
- **Tela com dado crítico mostra última atualização** (`LastUpdatedBadge`). Regra #10.
- Não quebrar produção (#11); não remover funcionalidade sem justificativa
  registrada (#12); migrations aditivas (#13); tarefa só "concluída" com
  evidência mínima (#14).
- **UX:** cada tela responde às 6 perguntas (o que ver / o que está errado / o
  que fazer agora / responsável / prazo / impacto). Linguagem operacional, nunca
  técnica.

---

## 7. Dívidas prioritárias herdadas da auditoria (top 10)

Extraído de `docs/_audit/*.md`. Ordem por gravidade/risco.

1. **Bypass de autorização em mutações (CRÍTICO).** Mutam clientes NÃO atribuídos
   com só `requireSession()`: `src/app/actions/updateClient.ts`,
   `interactions.ts` (pipeline/CRM), `contracts.ts`, `goals.ts` (`createGoal`),
   `protocols.ts`, `tasks.ts`, e `api/clients/[clientId]/budget/route.ts`
   (MANAGER sem checar posse). Correção mecânica: inserir
   `assertClientMutationAccess` + `writeAuditLog`. **Trava de merge.**
2. **Webhooks fail-open (CRÍTICO).** Asaas (`api/asaas/webhook`), WhatsApp Z-API
   (`api/webhooks/whatsapp`) e Nuvemshop (`api/nuvemshop/webhooks`) só validam
   assinatura **se o secret existir** → sem env, aceitam payload forjado (dinheiro
   e CRM em risco). Tornar fail-closed: se o secret de produção não está setado,
   negar (401).
3. **`/api/nuvemshop/install` público cria Client sem sessão (CRÍTICO).**
   `src/app/api/nuvemshop/install/route.ts` — injeta cliente canônico anônimo.
   Exigir sessão ou `state` assinado.
4. **Model ID de IA inválido (CRÍTICO runtime).** `claude-sonnet-4-6` não existe
   no catálogo Anthropic → 404 em `src/app/api/ai/chat/route.ts` e
   `src/services/weekly-report-generator.ts` (linhas 325/555/786/916). Trocar por
   alias válido (`claude-sonnet-4-5`) e validar `claude-haiku-4-5`.
5. **Timeouts ausentes em integrações (ALTO).** Sem `AbortSignal`:
   `src/services/evolution/client.ts`, `zapi/client.ts`, `ga4/client.ts`,
   `google-ads/client.ts`, `nuvemshop/client.ts`, e os métodos crus do
   `meta-ads/client.ts`. Também os 7 clientes Anthropic (sem `timeout`/`maxRetries`
   — centralizar em `src/lib/anthropic.ts`). Viola regra #6; pode pendurar o cron.
6. **Loops de cron sem try/catch por cliente (ALTO).** Violam regra #7:
   `health-scorer.ts:477`, `churn-scorer.ts:147`, `oscillation-detector.ts:199`,
   `budget-monitor.ts:36`, `critical-account-detector.ts:46`,
   `contract-expiry-checker.ts:25`, `weekly-report-generator.ts:945`,
   `weekly-checklist-generator.ts:57/149`. Um cliente corrompido derruba o lote.
7. **Sem `lastRunAt`/`SyncLog` persistido nas rotinas do daily (MÉDIO).** Só
   `recurrence-engine` e `resultado-engine` registram. O `summary` do daily some
   com a resposta HTTP → impossível a tela responder "qual rotina não rodou"
   (regras #9/#10). Persistir em `SyncLog`/`AutomationLog`.
8. **Telas com Prisma inline, fora da DAL (MÉDIO).** ~9 páginas importam
   `@/lib/prisma` direto (`comercial` — SEM `requireSession`, expõe todos os
   leads; `financeiro` com 18 queries inline; `juridico`, `anti-churn`,
   `clients`, `alerts`, `agency/metas`). Viola regra #1. Mover para `dal.ts` por
   fatia. `comercial/page.tsx` é trava de segurança.
9. **Performance do Client 360 (ALTO percebido).** `clients/[slug]/page.tsx`
   dispara ~17 queries com `force-dynamic` global + só `cache()` (não
   `unstable_cache`) → cada navegação paga cold-start do Neon; sem `loading.tsx`.
   `getClientChat` faz `upsert` (escrita) no caminho de leitura. Adicionar
   `loading.tsx`, `unstable_cache` (revalidate 30–120s) nas queries pesadas, tirar
   o write do render.
10. **Zero testes / zero CI (ALTO estrutural).** Nenhum `*.test.ts`, nenhum
    runner, nenhum `.github/workflows`. Auth/RBAC, mutações com posse e os
    engines de cálculo não têm rede de regressão. Adicionar Vitest + smoke test
    da decisão papel+posse e do `resultado-engine`; CI mínimo (`npm ci` + lint +
    build). Menor esforço, maior retorno.

Dívidas menores registradas nas auditorias: índices aditivos faltando
(`SyncLog`, `AgencyLead(status,deletedAt)`, `Client(status/pipelineStage)`);
`Task.assignedTo onDelete Cascade` apaga histórico; `Task.leadId/contractId` FKs
lógicas sem constraint; `next-auth` beta aparentemente órfão; `@types/*` em
`dependencies`; acessibilidade de modais/drawers (sem `role="dialog"`/focus-trap);
`loading.tsx` em só 6 de ~34 rotas.

---

## 8. Estado atual

**Fase:** build da Central Operacional concluído (Blocos 1–7 merged em produção)
+ redesign UX iOS + polimento. Detalhe completo e append-only em `PROJECT_STATE.md`.

**Entregue e em produção (merged):**
- POPs: WAR-14 (War Room ↔ Task), WAR-16, FIN-19 (DRE), CSX-13, OPE-06 (check-in
  semanal com validação da CS), OPE-07 (prestação de contas), CSX-10 (fila
  `/validacoes`), ONB-04/ONB-05 (onboarding + 30 dias), CAP-01 (follow-up).
- Central Operacional: hierarquia Área→POP→Lista→Tarefa (Task + ~20 satélites),
  motor de recorrência (`/api/cron/recurrences`), automação por evento (Bloco 6),
  `/operacional` (Lista/Kanban/Calendário/Por Cliente/Por Gestor), `/meu-dia`,
  `/minha-semana`, `/aceite` (KPIs de integridade operacional).
- Automação Resultado: `resultado-engine` (ROAS/GA4 semanal → Resultado + Etapa),
  `/api/cron/resultados`, surfacing na carteira e na página do cliente.
- IA: `generatePlanoAcao` (plano de ação com dados reais, sem inventar métrica).
- **Redesign UX iOS/Apple:** skin global (`globals.css`), sidebar por departamentos
  (estilo ClickUp, colapsável), TaskDrawer 2 colunas, views idênticas ao protótipo,
  fonte SF (San Francisco), paridade visual com o protótipo aprovado.
- **Inovações de fluidez:** ⌘K Command Palette (`globalSearch` role-scoped),
  toasts globais (pub/sub), skeletons (`loading.tsx` em rotas pesadas), Ficha de CS,
  Central de Comunicação (canais/chat por cliente).

**O que falta / próximos passos:**
- **Correções de segurança das auditorias** (top 3–4 acima) — ainda não aplicadas;
  são a maior prioridade e travam qualidade.
- 15 dos 21 POPs restantes aguardando fatia (mapeados em `docs/mapa-pops.md`).
- WAR-15 (`WarRoomDecision`) proposto, não implementado.
- Timeouts, try/catch por cliente, `lastRunAt`, testes/CI — dívidas 5, 6, 7, 10.
- Design system travado em `docs/ux/` (tokens definitivos) para continuar o refino.

Referências: `PROJECT_STATE.md` (progresso), `docs/mapa-pops.md`,
`docs/mapa-lacunas.md`, `docs/_audit/*.md` (10 auditorias por dimensão).
