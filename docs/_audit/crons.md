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
