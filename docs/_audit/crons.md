## Crons & Automação

Auditoria read-only da dimensão Crons & Automação do PERFORMLI. Escopo:
`src/app/api/cron/*` e serviços de monitor/gerador em `src/services`.

### (a) Rotinas existentes

**Rotas de cron (`vercel.json`):**

| Rota | Schedule (UTC) | Faz |
|------|----------------|-----|
| `/api/cron/daily` | `0 11 * * *` (08:00 BRT) | Orquestra ~20 passos: syncs (Meta/GA4/GoogleAds/Nuvemshop/Asaas), health, oscilação, churn, anti-churn, check-ins, inadimplência, follow-up de leads, escalação de tarefas, budget, contas críticas, war room (escalação+monitor), contract expiry; domingo gera weekly reports/checklists; segunda sincroniza metas semanais. |
| `/api/cron/digest` | `30 11 * * *` (08:30 BRT) | Envia digest diário via WhatsApp (Z-API). Separado para não depender do sync. |
| `/api/cron/recurrences` | `0 10 * * *` | Gera tarefas recorrentes de templates. Idempotente por `idempotencyKey`. |
| `/api/cron/resultados` | `0 9 * * 1` (segunda) | Atualiza Resultado semanal (ROAS/GA4) e deriva Etapa. Idempotente por `Client.resultadoWeek`. |

**Serviços com try/catch POR item + logging (fortes):** `warroom-escalation`,
`warroom-monitor`, `inadimplencia-checker`, `lead-followup-checker`,
`task-escalation`, `antichurn-monitor`, `checkin-monitor`, `recurrence-engine`,
`resultado-engine`.

### (b) Pontos fortes

- **Auth consistente:** todas as 4 rotas exigem `CRON_SECRET` via `Bearer` ou
  `x-cron-secret`, e rejeitam quando o env não está setado (`return false`).
- **Isolamento por passo no daily:** cada um dos ~20 passos do `runDailySync`
  tem `try/catch` próprio — a falha de um passo (ex: sync Meta) não derruba os
  demais. Retorna `summary` por passo (`ok/error`).
- **Idempotência real** onde importa: `recurrence-engine` (idempotencyKey +
  AutomationLog "duplicidade evitada"), `resultado-engine` (`resultadoWeek`),
  dedup de alertas por janela em quase todos os monitores.
- **AutomationLog / AuditLog** presentes nos serviços mais críticos
  (recurrence, resultado, lead-followup, task-escalation, warroom-escalation).
- **`lastRunAt`** gravado por regra em `recurrence-engine.ts:140`.
- **digest separado do sync** — decisão arquitetural correta (timeout de sync
  não impede envio do digest).

### (c) Riscos por severidade

#### 🔴 Alto

- **Loops "all" sem try/catch por cliente** — a regra inegociável nº 7 é
  violada nos runners batch. Um cliente com dado corrompido aborta TODA a
  sub-rotina (embora o `try` do passo no daily contenha o estrago no nível do
  passo, todos os demais clientes daquele passo são perdidos):
  - `health-scorer.ts:477` (`recalculateAllClientsHealth` — loop `for` chama
    `recalculateClientHealth` + `updateStreak` sem try/catch).
  - `churn-scorer.ts:147` (`scoreAllClientsChurnRisk`).
  - `oscillation-detector.ts:199` (`detectOscillationsForAll`).
  - `budget-monitor.ts:36` (loop `for goals` — sem try/catch por goal).
  - `critical-account-detector.ts:46` (loop `for clients`).
  - `contract-expiry-checker.ts:25` (loop `for expiring`).
  - `weekly-report-generator.ts:945` (`generateAllWeeklyReports`).
  - `weekly-checklist-generator.ts:57` e `:149` (loops por cliente/manager).

#### 🟡 Médio

- **Sem `lastRunAt` / SyncLog no nível das rotinas do daily.** Nenhuma rota de
  cron nem os serviços batch (health, churn, oscilação, budget, critical,
  contract, weekly) gravam `lastRunAt` global. Só `recurrence-engine` e
  `resultado-engine` registram. Viola regras nº 9 e 10 (tela precisa mostrar
  última atualização). O `summary` do daily não é persistido — some quando a
  resposta HTTP retorna. `grep` confirmou: sem `lastRunAt/SyncLog/AuditLog` em
  `src/app/api/cron/`.
- **Contas críticas / budget / contract não geram AuditLog.** Criam `Alert`
  (automação crítica) mas sem `AuditLog` (regra nº 8). `critical-account-detector.ts:190`
  tem try/catch isolado só para uma sub-ação, não para o loop.
- **`daily` sem timeout explícito por sync externo visível aqui.** O timeout
  precisa existir dentro de cada `syncAll*` (não auditado nesta dimensão) —
  verificar se cada chamada externa respeita a regra nº 6. `maxDuration: 300`
  no `vercel.json` protege a função, mas não substitui timeout por chamada.

#### 🟢 Baixo

- **`digest` retorna 500 em falha** — correto para observabilidade, mas o
  Vercel Cron pode reexecutar; `sendDailyDigest` deve ser idempotente/dedup
  (não verificado nesta dimensão).
- **Sem `runtime`/`dynamic` explícito** nas rotas de cron (risco de cache de
  rota estática em edge cases do Next). Baixo, mas vale forçar
  `export const dynamic = 'force-dynamic'`.

### 🔒 Travas / Fluidez

- **Trava dura:** os 8 loops batch sem try/catch por cliente são o maior risco
  de "falha silenciosa" — exatamente o que o sistema deveria eliminar. Um único
  cliente quebra o lote inteiro e ninguém vê (o passo só reporta `ok:false` com
  a mensagem do primeiro erro).
- **Trava de observabilidade:** sem `lastRunAt`/SyncLog persistido, é impossível
  a tela responder "qual rotina não rodou" — pergunta operacional central do
  CLAUDE.md. O `summary` volátil precisa virar registro em `SyncLog`/`AutomationLog`.
- **Fluidez boa:** padrão de dedup de alertas por janela é consistente e evita
  spam; separação digest/sync é madura; idempotência dos engines novos
  (recurrence/resultado) é exemplar e deve ser o modelo para os demais.
