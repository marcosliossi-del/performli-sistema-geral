# HANDOFF — Fase 5 · A5-AUTOMATION

> Recorrência AGENDADA por task (D-010 mode `schedule`), motor de automação v0
> (gatilho → condição → ação) e revisão do overdue no cron diário. Ambiente: sem
> build local, npm bloqueado (sem node_modules), Postgres 16 local para validar
> SQL + Node 22 para simulação das funções puras. Roda em PARALELO com A6 (Fase 5).

---

## 1. O QUE FOI FEITO

### Recorrência agendada por task (missão §1)
- **`src/lib/tasks/recurClone.ts`** (NOVO) — montagem COMPARTILHADA do clone de
  recorrência, usada pelos DOIS caminhos (zero duplicação):
  - `RecurSourceTask` (tipo dos campos-fonte), `occurrenceKey(date)` (`yyyy-mm-dd`
    em America/Sao_Paulo), `recurIdempotencyKey(id, occ)` = `recur:{id}:{occ}`.
  - `createRecurrenceOccurrence({ source, rule, dueDate, actorId, carryRule })`:
    findUnique por idempotencyKey → cria clone (checklist desmarcado + auxAssignees
    + activity `recurred` + espelho `statusId`); **colisão P2002 → `skipped`, não
    `failed`**. `carryRule` decide se a ocorrência herda a regra.
- **`src/services/task-schedule-recurrence.ts`** (NOVO) — `runScheduledTaskRecurrences()`:
  busca tasks `recurrenceRule: { not: Prisma.DbNull }` + status ∉ {CANCELADO,
  CONCLUIDO}, `parseRecurrenceRule`, processa só `mode === 'schedule'`. Para cada
  série: âncora = `dueDate ?? createdAt`; enquanto `occurrenceKey(âncora) <= hoje`
  (loop com CAP 60 p/ catch-up) materializa a ocorrência (clone **inerte**,
  `carryRule:false`) e avança a âncora via `computeNextOccurrence`; ao final grava
  o novo `dueDate` da série (também registra a última execução via `updatedAt`).
  **try/catch POR task**, **AutomationLog por resultado** (SUCESSO /
  DUPLICIDADE_EVITADA / FALHA), retorno `{ verificadas, criadas, puladas, falhas }`.
- **`src/app/actions/tasks.ts`** — `updateTaskStatus` (clone on-complete)
  **REFATORADO** para chamar `createRecurrenceOccurrence(..., carryRule:true)`:
  removida a montagem duplicada do clone (~50 linhas). Comportamento visível
  preservado (mesma idempotencyKey, mesmos campos, best-effort).
- **`src/app/api/cron/recurrences/route.ts`** — passa a rodar os DOIS motores
  (templates + schedule) de forma isolada; `scheduled` no JSON de resposta; campos
  dos templates preservados no topo (contrato preexistente intacto).

### Motor de automação v0 (missão §2)
- **`src/services/task-automation.ts`** (NOVO) — `runTaskAutomations(event)`:
  - Eventos: `task.created` | `task.status_changed` (`{ taskId, from?, to? }`).
  - Condições v0 (`conditions` JSON, fallback legado `condition` string):
    `{ listId?, clientId?, status? }` (AND).
  - Ações v0: **`notify`** (cria `Alert` tipo `TASK_AUTOMATION` no cliente da
    task; dedupe leve por alerta não-lido idêntico) e **`assign`** (troca
    `assignedTo` + `TaskActivity`). Ação não suportada → FALHA registrada.
  - **try/catch por regra**, **AutomationLog por execução**, retorno
    `{ evaluated, matched, applied, skipped, failed }`.
- **`src/app/actions/tasks.ts`** — hook LEVE e best-effort DEPOIS da transação em
  `updateTaskStatus` (`task.status_changed`) e `createTask` (`task.created`);
  `try/catch` que NUNCA derruba a mutação (igual ao clone).

### Migrations (aditivas + idempotentes, validadas 2× no Postgres local)
- **`prisma/migrations/20260702020000_alert_type_task_automation/migration.sql`** —
  `ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_AUTOMATION';`
- **`prisma/migrations/20260702030000_task_automation_rule_config/migration.sql`** —
  `ADD COLUMN IF NOT EXISTS "conditions" JSONB` + `"actionConfig" JSONB` em
  `TaskAutomationRule`.
- **`prisma/schema.prisma`** — enum `AlertType += TASK_AUTOMATION`;
  `TaskAutomationRule += conditions Json?`, `actionConfig Json?` (campos legados
  `trigger`/`condition`/`actionType`/`templateId` **mantidos** — CLAUDE.md #13).

### Overdue no cron diário (missão §3)
- Verificado `markOverdueTasks` (Step 5d.5). **Decisão: NÃO incluir EM_ANDAMENTO**
  (ver §2). Nenhuma notificação nova de vencimento criada (o digest WhatsApp já
  cobre — audit §3). Sem alteração de código; decisão documentada.

---

## 2. DECISÕES TOMADAS

- **Integrei no cron `recurrences`, não no `daily`.** Audit §3: "recorrência NÃO
  roda no daily, é cron dedicado" (`recurrences` @ `0 10 * * *`). O `daily`
  (`0 11 * * *`) roda 1h DEPOIS — então o overdue (11:00) já vê o `dueDate` da
  série avançado pelo schedule (10:00), evitando marcar a série como ATRASADO
  indevidamente. Alternativa descartada: duplicar no daily (duas execuções/dia
  do mesmo motor).

- **Ocorrência agendada é INERTE (`carryRule:false`); on-complete herda a regra
  (`carryRule:true`).** É a chave anti-explosão. No on-complete a cadeia é gated
  pela conclusão (você conclui → gera a próxima → 1 a 1). No schedule a geração é
  por data e não-gated: se a ocorrência herdasse a regra viraria um SEGUNDO
  gerador e dobraria a cada dia. Então a **série** (task-fonte) mantém a regra e
  avança o `dueDate`; as ocorrências são tasks comuns que as pessoas trabalham.
  Documentado no código.

- **Âncora = `dueDate`; parar a série = concluir/cancelar/limpar recorrência.**
  O `dueDate` da série é "a data da próxima ocorrência a materializar" e avança a
  cada período. Query exclui CANCELADO/CONCLUIDO — dar CONCLUIDO/CANCELADO na
  série (ou `setTaskRecurrence(null)`) encerra a geração. "Independente de
  conclusão" (missão) = não ESPERA a conclusão para disparar; não significa que
  uma série concluída siga gerando.

- **Extraí `createRecurrenceOccurrence` em vez de duplicar.** A missão exige
  reuso. Um único ponto monta o clone; a idempotencyKey e o tratamento de P2002
  vivem lá → on-complete e schedule NÃO podem divergir.

- **Adicionei `conditions`/`actionConfig` (JSON aditivo) ao `TaskAutomationRule`.**
  O shape legado (`trigger`/`condition String?`/`actionType`/`templateId`) NÃO
  tem onde guardar os PARÂMETROS da ação (a quem atribuir, texto do alerta) — o
  motor seria não-funcional. Criar MODEL novo é proibido; colunas nullable
  aditivas no model existente são o caminho sancionado (migrations aditivas
  idempotentes) e convergem para o alvo BLOCO 3.1 (`conditions Json`/`actions
  Json`). `condition String?` legado é lido como fallback.

- **Novo `AlertType TASK_AUTOMATION`.** `Alert.clientId` é obrigatório e nenhum
  tipo existente descreve "regra de automação de tarefa". Enum aditivo idempotente
  (`ADD VALUE IF NOT EXISTS`), padrão já usado no repo (ex. `ANTICHURN_ACTION_NEEDED`).

- **`markOverdueTasks` NÃO passa a incluir EM_ANDAMENTO.** Marcar EM_ANDAMENTO →
  ATRASADO DESTRUIRIA o sinal de "em execução" (ATRASADO é *status*, não flag —
  audit §7.1 risco #1). Além disso, `escalateOverdueTasks` (Step 5e) JÁ cobre
  EM_ANDAMENTO vencida (filtro `status notIn [CONCLUIDO,CANCELADO]` + `dueDate <
  cutoff`): eleva prioridade, marca tag `escalado` e `delayReason` **sem** apagar
  o status. Logo, EM_ANDAMENTO vencida já aparece — sem sobrescrever status. A
  missão pedia "se fizer sentido operacional"; não faz.

- **Dedupe leve no `notify`** (alerta não-lido idêntico → DUPLICIDADE_EVITADA)
  para não spammar a cada mudança de status. Marcar o alerta como lido reabre o
  disparo. Throttle por tempo fica para v1.

---

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)

- **Ações além de `notify`/`assign`** (ex. `sendWhatsApp`, `createSubtask`,
  transição de status): fora do escopo v0 ("2 ações iniciais suficientes para
  provar o motor" — BLOCO 4/A5). `default` do switch já registra FALHA para tipos
  não suportados.
- **UI de configuração de regras de automação:** é do A4/produto. Aqui só o
  executor + colunas de config. Regras podem ser semeadas via SQL/seed.
- **Hook de automação em TODOS os pontos de criação de task** (recurrence-engine,
  warRoom, onboarding, etc.): pendurei só nas actions canônicas `createTask`/
  `updateTaskStatus`. Estender aos demais criadores é trabalho futuro (evita ruído
  e mantém o hook previsível).
- **`Notification` por usuário:** não existe o model (audit §2 lacuna). `notify`
  usa `Alert` (por cliente). Notificação in-app por usuário fica para quem criar
  o model.
- **AutomationLog no clone on-complete:** mantido como antes (best-effort, sem
  log) para não mudar comportamento/gerar ruído. O schedule loga (era requisito).
- **Timing-safe compare do CRON_SECRET:** dívida preexistente (audit §3), fora do
  escopo A5.

---

## 4. COMO VALIDAR

### Migrations (Postgres local) — idempotência 2×
```
service postgresql start
su postgres -c "psql -v ON_ERROR_STOP=1 -d performli_test -f prisma/migrations/20260702020000_alert_type_task_automation/migration.sql"     # 2×
su postgres -c "psql -v ON_ERROR_STOP=1 -d performli_test -f prisma/migrations/20260702030000_task_automation_rule_config/migration.sql"    # 2×
```
2ª execução emite apenas `NOTICE ... already exists, skipping` (idempotente).
Verificação:
```
su postgres -c "psql -d performli_test -tAc \"SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='AlertType' AND e.enumlabel='TASK_AUTOMATION';\""   # → 1
su postgres -c "psql -d performli_test -tAc \"SELECT column_name FROM information_schema.columns WHERE table_name='TaskAutomationRule' AND column_name IN ('conditions','actionConfig');\""   # → conditions, actionConfig
```

### Teste de mesa — IDEMPOTÊNCIA (3 execuções simuladas, VERIFICADO em Node 22)
Simulação fiel (`computeNextOccurrence` + `occurrenceKey` + `createRecurrenceOccurrence`
+ loop do schedule) contra um mock com `idempotencyKey` UNIQUE (colisão → `P2002`):

| Cenário | 3 execuções (mesmo dia) | Ocorrências no fim | Resultado |
|---|---|---|---|
| **A** WEEKLY seg, avanço do dueDate persistido | criadas 1 · 0 · 0 | **1** | dueDate avança p/ 2026-07-13 → runs 2/3 não fazem nada |
| **B** DAILY, avanço NÃO persistido (corrida/falha) | criadas 1 · puladas 1 · puladas 1 | **1** | idempotencyKey sozinha impede duplicata (2× DUPLICIDADE_EVITADA) |

Cenários extra verificados:
- **C** WEEKLY seg numa janela de 8 dias → disparou só em `2026-07-06` e
  `2026-07-13` (2 ocorrências, nunca nos outros dias).
- **D** catch-up (cron perdeu 01,02,03; hoje 04, DAILY) → materializa 4
  ocorrências, `dueDate` avança p/ `2026-07-05`; 2ª execução no mesmo dia = 0.
- **E** on-complete (`carryRule:true`): MONTHLY 31-jan → clamp `2026-02-28`;
  2ª chamada = `skipped` pela mesma key; clone HERDA a regra. Paridade OK.

Ambas as simulações estão como referência de mesa; a lógica pura copiada é
byte-a-byte a de `recurrence.ts`/`recurClone.ts`.

### Teste de mesa — MOTOR DE AUTOMAÇÃO (VERIFICADO em Node 22)
| # | Regra | Task | Resultado |
|---|---|---|---|
| 1 | assign se `listId=lst_X` (task.created) | lista X | atribui Pablo; 2ª exec → DUPLICIDADE_EVITADA |
| 2 | notify se `status=AGUARDANDO_CS` | cliente | cria 1 Alert; 2ª exec dedupe (não-lido) |
| 3 | notify se `status=CONCLUIDO` | status EM_ANDAMENTO | condição não bate → sem ação |
| 4 | notify sem condição | task **sem cliente** | FALHA (Alert exige clientId) |
| 5 | actionType `sendWhatsApp` | qualquer | FALHA (não suportado no v0) |
| 6 | regra inativa + trigger diferente | — | `evaluated=0` |

### Cron (fumaça, requer app rodando)
`GET /api/cron/recurrences` (com `CRON_SECRET`) → JSON `{ ok, force,
rulesProcessed, created, skipped, failed, scheduled:{ verificadas, criadas,
puladas, falhas } }`. Rodar 3× no mesmo dia → `scheduled.criadas>0` só na 1ª;
demais `puladas`/`0`. `AutomationLog` com SUCESSO/DUPLICIDADE_EVITADA por
ocorrência.

---

## 5. RISCOS ATIVOS

- **Tipos Prisma novos (`conditions`/`actionConfig`) só resolvem após `prisma
  generate`** (Vercel). Sem node_modules local, `tsc` acusaria "Cannot find
  module" (mesma situação da Fase 2). Zero `any`; nenhum erro de tipo real
  introduzido.
- **Série que perdeu MUITOS dias**: o loop tem CAP 60 ocorrências/série/execução
  para não estourar num único run (o resto entra nas rodadas seguintes). Cron
  Vercel é diário e confiável, então é borda.
- **`markOverdueTasks` @ 11:00 vs schedule @ 10:00**: a ordem importa — o schedule
  avança o `dueDate` da série antes do overdue rodar. Se os horários dos crons no
  `vercel.json` forem invertidos, uma série de recorrência com `dueDate` de hoje
  poderia ser marcada ATRASADA antes de materializar. Manter `recurrences` ANTES
  do `daily`.
- **Dedupe do `notify` por alerta não-lido**: se um alerta ficar não-lido por
  muito tempo, disparos legítimos repetidos são suprimidos até alguém marcá-lo
  como lido. Aceitável no v0; throttle temporal = v1.
- **Onde o executor de automação está pendurado**: SÓ em `createTask` e
  `updateTaskStatus` (best-effort). Mudanças de responsável/prazo por
  `updateTaskFields`, criações via cron/onboarding/warRoom NÃO disparam o motor.
  Isso é intencional (v0), mas é a primeira coisa a revisar se "a automação não
  disparou".
- **Dois motores de recorrência coexistem** (D-010): templates por cliente
  (`TaskRecurrenceRule`, dedupe `{tpl}:{cliente}:{janela}`) e regra por task
  (`Task.recurrenceRule`, dedupe `recur:{taskId}:{data}`). Não confundir.

---

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (guardião)

**Ler antes:** este handoff, `docs/handoffs/fase-2-a2.md`, DECISIONS.md D-006/D-010,
audit §3.

**Superfície de revisão (segurança/QA/regressão):**
- Crons já protegidos por `CRON_SECRET` (não alterei o auth). O executor de
  automação NÃO é rota pública — só é chamado por server actions autenticadas
  (`createTask`/`updateTaskStatus`, que já validam sessão+posse antes) e pelo
  cron. `runScheduledTaskRecurrences`/`runTaskAutomations` não recebem input do
  cliente (só `taskId` já validado no fluxo chamador).
- **Tenancy:** o schedule e o motor operam sobre tasks já filtradas pelo fluxo;
  o `assign` do motor troca `assignedTo` sem passar por `assertCan` — é uma AÇÃO
  DE SISTEMA (automação configurada por ADMIN), análoga ao cron. Se o guardião
  exigir, dá para validar que o `assignTo` pertence ao workspace, mas hoje o
  model de automação não tem dono/tenant.
- **Idempotência:** garantida pela `idempotencyKey @unique` + tratamento P2002
  (ver §4, cenários A/B). Rodar o cron N vezes/dia = zero duplicata.
- **Regressão:** `updateTaskStatus` preserva assinatura (`void`+`throw`) e
  comportamento visível; o clone on-complete só trocou de lugar (agora em
  `recurClone.ts`), mesma idempotencyKey e campos. Resposta do cron `recurrences`
  manteve os campos de topo (só adicionou `scheduled`).

**Contratos novos (não quebrar sem ADR):**
```ts
// src/lib/tasks/recurClone.ts
createRecurrenceOccurrence(params: { source: RecurSourceTask; rule: RecurrenceRule;
  dueDate: Date; actorId: string|null; carryRule: boolean })
  : Promise<{ outcome:'created'|'skipped'; idempotencyKey:string; taskId?:string }>
occurrenceKey(date: Date, tz?): string           // yyyy-mm-dd em America/Sao_Paulo
recurIdempotencyKey(sourceTaskId, occ): string    // `recur:{id}:{occ}`

// src/services/task-schedule-recurrence.ts
runScheduledTaskRecurrences(opts?: { now?: Date })
  : Promise<{ verificadas; criadas; puladas; falhas }>

// src/services/task-automation.ts
runTaskAutomations(event: { type:'task.created'|'task.status_changed';
  taskId: string; from?: string; to?: string })
  : Promise<{ evaluated; matched; applied; skipped; failed }>
```

**Veredito esperado:** APROVADO (gate Fase 5 — zero duplicata no cron; sem ❌ de
segurança introduzido por A5).
