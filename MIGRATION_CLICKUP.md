# MIGRATION_CLICKUP.md — Plano de migração ClickUp → Performli

> **Status: PLANO.** Nada aqui executa nada. Cada lote vira uma fatia própria
> (branch → PR → Vercel verde → guardião), no padrão do que já foi feito com o
> Suporte. Escrito pelo A8 na Fase 7 do `PROMPT_MESTRE_TASKS.md`.
>
> Data-base do plano: 2026-07-02. Piloto e datas de corte na §7.

---

## 1. Princípios (não negociáveis)

1. **Uma lista vive em UM sistema só** (BLOCO 7, risco #7). Enquanto uma lista
   não migra, ela continua 100% no ClickUp. No dia do corte, ela passa a ser
   100% Performli e a lista original é congelada (renomear no ClickUp para
   `[MIGRADA] …` e parar de editar). Nunca operar a mesma lista nos dois.
2. **Idempotência por chave determinística.** Todo item importado grava
   `Task.idempotencyKey` (`@unique`) no formato **`clickup-{lista}:{taskId}`**
   — mesmo padrão já em produção no Suporte (`clickup-suporte:{id}`,
   `src/services/seed-suporte.ts:113`). Rodar o import N vezes = zero duplicata.
3. **Não inventar dado.** Campo ausente no ClickUp fica ausente no Performli
   (ou entra em fila "precisa completar"), nunca é chutado. Padrão já usado no
   seed de carteiras.
4. **Importar só o ABERTO.** Tarefas concluídas/fechadas não viram `Task` — o
   histórico fica num export CSV arquivado do ClickUp (1 export por lista antes
   do corte, guardado no Drive). Importar cadáver polui a Central e não responde
   nenhuma pergunta operacional.
5. **Inteligência, não cópia** (CLAUDE.md). Custom fields do ClickUp NÃO viram
   custom fields genéricos: cada um é mapeado para o campo nativo do Performli
   que já responde à pergunta operacional (ou descartado com justificativa).
6. **Exit strategy explícita por lote:** cada lote registra qual rotina do
   ClickUp ele aposenta e quando o ClickUp deixa de ser necessário para ela.

---

## 2. O que JÁ migrou (lote 0 — em produção)

| O quê | Como | Evidência |
|---|---|---|
| **Hub de Suporte — 21 demandas reais** | `src/services/seed-suporte.ts` importa as 21 demandas abertas da lista *Suporte* do ClickUp (list_id `901109925274`) como `Task` `isSupport=true`; responsável resolvido por `User.externalId` (fallback Marcos `152690431`); idempotencyKey `clickup-suporte:{clickupId}` | PRs #102/#103; rotina do Suporte já roda no `/suporte` |
| **_Recorrentes - Tráfego (as ~15 fixas por cliente)** | **Não foi importada — foi RECRIADA como motor**: 15 `TaskTemplate` + `TaskRecurrenceRule` (`src/services/seed-operacao.ts:99-175`) com fan-out diário por cliente ativo (`src/services/recurrence-engine.ts`, cron 10:00 UTC), responsável resolvido por papel (`Client.gestorId/csId/crmId/supervisorId/headId`) | ~510 tarefas recorrentes geradas em produção; ClickUp **já não é necessário** para gerar recorrentes |
| **Carteiras (quem cuida de quem)** | `src/services/seed-carteiras.ts` preencheu ~30 clientes reais: gestor, tipo de negócio, plataformas, produtos, resultado/etapa, curva, NPS, investimentos, `ClientAssignment` primário | Clientes ativos com carteira preenchida |
| **Usuários com rastreio ClickUp** | `User.externalId String? @unique` (schema :28) — Marcos = `152690431` já mapeado; usado pelos seeds para resolver assignee | Base do mapeamento de responsáveis de TODOS os próximos lotes |

**Pré-requisito pendente do lote 0:** completar `User.externalId` dos demais
usuários (Leandro, Pablo, Kyn, Letícia, Red). Sem isso, tarefas do time cairiam
todas no fallback (Marcos) — inaceitável para as listas internas. É a PRIMEIRA
ação da §7.

---

## 3. Inventário do que resta (hierarquia ClickUp → destino Performli)

Hierarquia real do workspace (prints de 30/06, `docs/ux-clickup-referencia.md §1`
+ conversa do dono). list_ids: só o do Suporte é conhecido (`901109925274`);
os demais serão coletados na preparação (§7, D-0) — a coluna fica com `(coletar)`.

| Espaço ClickUp | Lista | Itens (~30/06) | Destino Performli | Lote |
|---|---|---|---|---|
| _Gestão Interna | **_Head de Performance** (Tarefas Head) | (coletar) | `Task` interna (sem cliente), `assignedTo` = Marcos | **1** |
| _Gestão Interna | **_Supervisor** (Tarefas Supervisor) | (coletar) | `Task` interna, `assignedTo` = Leandro | **1** |
| _Gestão Interna | **_Time de CS → Tarefas CS** | 6 | `Task` interna, `assignedTo` = Letícia | **1** |
| _Gestão Interna | **_Time de Performance** (Tarefas Gestores) | (coletar) | `Task` interna, `assignedTo` por externalId | **1** |
| _Gestão Interna | **_Time de CS → Suporte** | 19→21 | — **já migrada** (lote 0) | ✅ |
| _Gestão Interna | **Rotinas / Encontros & Rituais** | (coletar) | `Task` `type: REUNIAO` + `recurrenceRule` | **2** |
| _Gestão Interna | **Reuniões Gerais** | (coletar) | `Task` `type: REUNIAO` + `recurrenceRule` | **2** |
| _Administrativo | **Financeiro → Contas a Receber** | 31 | **NÃO importa como task** — Asaas já é a fonte (`AsaasPayment`/`AsaasSubscription`); só reconciliação | **4** |
| _Administrativo | **Financeiro → Contas a Pagar** | 12 | `Expense` (módulo financeiro existente) | **4** |
| _Administrativo | **Jurídico / Gestão de Contratos** | 17 | `Contract` (model existente, schema :1762) — reconciliar 17 × cadastrados | **3** |
| _Administrativo | **Objetivos & Metas (Q1-Q4)** | (coletar) | `Goal` + tela `/agency/metas` | **5** |
| _Administrativo | **CRM [Clientes Ativos] → Gestão de Clientes** | 41 | — carteiras JÁ preenchidas (lote 0); só reconciliação 41 × ~30 ativos | **4** (junto) |
| _Recorrentes - Tráfego | 1 lista por cliente (~15 tarefas cada) | ~30 listas | — **já substituída pelo motor** (lote 0); pendente só o desligamento formal por cliente | **6** |
| _Comercial & Vendas | pipeline comercial | (coletar) | `AgencyLead` (pipeline já existe em `/comercial`) — **adiar**: exige de-para de etapas, decisão própria | backlog |
| _Administrativo | Notas Fiscais · Processos | — | Processos: já coberto por `/processos` (21 POPs). Notas Fiscais: **fica no ClickUp** até existir módulo | backlog |
| _Gestão de Pessoas | RH · Contratação · Equipe | — | **Fica no ClickUp** — sem módulo destino no Performli; fora do escopo do módulo Tasks | fora |

---

## 4. Mapeamento campo a campo (comum a toda lista de tarefas)

Task do ClickUp (API v2, `GET /list/{list_id}/task?include_closed=false&subtasks=true`)
→ `Task` do Performli:

| Campo ClickUp | Campo Performli | Regra |
|---|---|---|
| `id` | `idempotencyKey` | `clickup-{lista}:{id}` — `{lista}` fixo por lote (§5); NUNCA reutilizar prefixo entre listas |
| `name` | `title` | trim; obrigatório |
| `description` / `text_content` | `description` | texto puro (o Performli renderiza sem HTML); anexar no fim: `Importada do ClickUp em {data}. Histórico completo: {url da task}` |
| `status.status` | `status` (enum `TaskStatus`) **+ `statusId`** | tabela abaixo; espelho D-004 obrigatório (usar `statusIdFor` de `src/lib/tasks/statusMap.ts`) |
| `priority` | `priority` | `urgent→CRITICA · high→ALTA · normal→MEDIA · low→BAIXA · null→MEDIA` |
| `assignees[0].id` | `assignedTo` | resolver por `User.externalId`; **sem match = fila de pendência do lote (não usar fallback silencioso em listas do time)**; no Suporte o fallback foi Marcos por decisão explícita |
| `assignees[1..n].id` | `TaskAuxAssignee` | mesmos resolvidos por externalId (D-005) |
| `due_date` (epoch ms) | `dueDate` | converter para UTC; ClickUp usa TZ do workspace (America/Sao_Paulo) |
| `start_date` | `startDate` | idem |
| `date_created` | `requestedAt` | preservar quando disponível (o `createdAt` será o do import) |
| `tags[].name` | `tags String[]` | lowercase; NÃO criar tag `escalado` (reservada ao motor de escalação) |
| `checklists[].items[]` | `TaskChecklistItem` | `label`, `done`, `order` sequencial; `required=false` (obrigatoriedade é conceito do Performli, decidida por template/POP, não importada) |
| `parent` (subtask) | `parentId` | importar em 2 passadas: pais → filhos |
| comentários | **não importa (v1)** | trilha fica no export CSV + link na descrição; importar comentários duplicaria autoria sem autor real |
| custom fields | caso a caso por lote (§5) | regra da §1.5 — mapear para campo nativo ou descartar com justificativa |
| — | `type` / `origin` | por lote (§5); `origin: 'MANUAL'` (padrão do seed do Suporte — o marcador de origem é o prefixo da idempotencyKey) |
| — | `clientId` | listas internas: `null`; quando a task citar cliente no título, o script tenta casar via `normalize` (helper exportado por `seed-carteiras.ts`, mesmo padrão do Suporte) e deixa em fila de revisão quando ambíguo |
| `list.id` | `TaskList.externalId` | criar/upsert 1 `TaskList` por lista migrada (`externalId @unique` já existe p/ isso, schema :803) e apontar `Task.listId` |

### De-para de status (ClickUp → `TaskStatus`)

| Status ClickUp (como aparece) | `TaskStatus` |
|---|---|
| `para fazer` / `PARA FAZER` / `to do` / `open` | `A_FAZER` |
| `em andamento` / `em execução` / `in progress` | `EM_ANDAMENTO` |
| `aguardando cliente` | `AGUARDANDO_CLIENTE` |
| `aguardando aprovação` / `em revisão` / `review` | `EM_VALIDACAO` |
| `bloqueado` | `BLOQUEADO` |
| `concluído` / `complete` / `closed` | **não importa** (§1.4) |
| qualquer outro | parar o lote e decidir — não mapear no chute; registrar o de-para novo nesta tabela |

> Financeiro usa pipelines próprios (`Para Receber / Atrasado / Pago`) — não
> passa por esta tabela: os destinos são models financeiros, não `Task` (§5.4).

---

## 5. Os lotes, um a um

### Lote 1 — Tarefas do time (Head · Supervisor · CS · Gestores)

- **Origem:** listas `_Head de Performance`, `_Supervisor`, `Tarefas CS` (6 itens),
  `_Time de Performance` (list_ids a coletar no D-0).
- **Destino:** `Task` interna (sem cliente), `type: 'DEMANDA_INTERNA'`.
- **Idempotência:** `clickup-head:{id}` · `clickup-supervisor:{id}` ·
  `clickup-cs:{id}` · `clickup-gestores:{id}`.
- **Particularidades:** `assignedTo` por `externalId` SEM fallback (tarefa sem
  assignee vai para fila de atribuição manual antes do corte); tarefas dos
  gestores que citarem cliente no título ganham `clientId` via `normalize`.
- **Onde o time passa a olhar:** `/meu-dia` e `/operacional` (filtro
  Cliente = "Interno").
- **Exit:** no corte, as 4 listas são congeladas no ClickUp. É o lote que tira a
  rotina DIÁRIA do time de dentro do ClickUp — vem primeiro de propósito.

### Lote 2 — Encontros & Rituais + Reuniões Gerais

- **Origem:** listas `Rotinas`/`Encontros & Rituais` e `Reuniões Gerais`
  (list_ids a coletar). O dossiê V2 mapeia ~11 rituais com participantes.
- **Destino:** 1 `Task` por ritual, `type: 'REUNIAO'` (enum :666), com
  **`recurrenceRule`** por task (D-010) — ex. War Room semanal:
  `{ "freq": "WEEKLY", "interval": 1, "byWeekday": [1], "mode": "onComplete" }`;
  pulses diários: `{ "freq": "DAILY", "interval": 1, "skipWeekends": true, "mode": "onComplete" }`.
  Dono do ritual = `assignedTo`; participantes = `TaskAuxAssignee` + `TaskWatcher`.
- **Idempotência:** `clickup-rituais:{id}` · `clickup-reunioes:{id}`.
  (As ocorrências futuras nascem do motor com `recur:{taskId}:{data}` — chave
  diferente por design; não misturar.)
- **Decisão embutida:** rituais NÃO viram templates por cliente
  (`TaskRecurrenceRule`) — são tarefas do TIME, recorrência individual resolve e
  o dono conclui → o motor gera a próxima. Pauta/ata do ritual = comentários.
- **Exit:** ClickUp deixa de agendar rituais; o ritmo semanal (War Room, pulses,
  check-ins de gestão) passa a rodar nas views do Performli — é o critério §2 do
  BLOCO 8.

### Lote 3 — Gestão de Contratos → `Contract`

- **Origem:** lista de contratos do Jurídico — **17 registros no ClickUp**.
- **Destino:** model `Contract` existente (schema :1762): `clientId`,
  `status (RASCUNHO/VIGENTE/RENOVACAO/CANCELADO)`, `type (FEE_MENSAL/PROJETO/AVULSO)`,
  `feeValue`, `setupFee?`, `startDate`, `endDate`, `noticeDays`, `autoRenew`,
  `documentUrl` (link do PDF no Drive), `notes`, `signedAt`.
- **Formato:** este lote é **RECONCILIAÇÃO, não import cego** — comparar os 17
  do ClickUp com os `Contract` já cadastrados (o cron daily já roda
  contract-expiry/renewal sobre eles). Saída: planilha de 3 colunas — (a) existe
  nos dois e bate → nada; (b) só no ClickUp → cadastrar; (c) diverge
  (valor/vigência) → o dono arbitra qual é a verdade ANTES de tocar no banco.
- **Mapeamento:** cliente por `normalize(nome)`; `fee mensal` → `feeValue`;
  vigência → `startDate`/`endDate`; status ClickUp assinado/vigente → `VIGENTE`.
- **Idempotência:** `Contract` não tem `externalId` — a chave natural é
  `(clientId, startDate, feeValue)`; registrar o id ClickUp em `notes`
  (`importado do ClickUp: {taskId}`). Se preferir chave dura, uma migration
  aditiva `Contract.externalId String? @unique` é aceitável (decisão do A0).
- **Exit:** contrato novo nasce no Performli; lista do ClickUp congelada.

### Lote 4 — Financeiro (Contas a Receber · Contas a Pagar) + reconciliação CRM

- **Contas a Receber (31 itens): NÃO importar como tarefa.** O POP FIN-19 já
  roda no Performli com fonte melhor que o ClickUp: `AsaasPayment` (pago/vencido/
  previsto), `AsaasSubscription` (MRR), inadimplencia-checker e a fila de
  cobrança no `/financeiro` (DRE). O status manual do ClickUp
  (`Para Receber/Atrasado/Pago`) é justamente o processo que o Asaas automatizou.
  **O que fazer:** reconciliar — todo cliente ativo com fee precisa ter cobrança
  viva no Asaas; item dos 31 sem correspondente no Asaas = cobrança fora do
  sistema → regularizar no Asaas (não no Performli). Nada é importado.
- **Contas a Pagar (12 itens): importar para `Expense`** (schema :1730):
  `description` ← nome da task; `value` ← valor; `date` ← vencimento;
  `category` ← de-para do "Tipo de Despesa" do ClickUp para `ExpenseCategory`;
  `recurring` ← flag quando a despesa é fixa mensal; `notes` ←
  `importado do ClickUp: {taskId}` (rastreio — `Expense.externalId` é RESERVADO
  ao id de transação Asaas, não usar); `source: 'MANUAL'`.
  Despesas fixas passam a ser lançadas todo mês no Performli (rotina FIN-20).
- **CRM Gestão de Clientes (41 itens): reconciliação apenas.** As carteiras já
  foram preenchidas (lote 0). Comparar os 41 do ClickUp com os ativos do
  Performli: diferença = clientes cancelados/pausados no ClickUp → conferir com
  `getCancelCandidates()` de `seed-carteiras.ts` (já existe para isso).
- **Exit:** Financeiro do ClickUp congelado; DRE/`/financeiro` vira a única tela
  de dinheiro. (Contas a Pagar recorrentes: avaliar depois automação própria —
  backlog, não bloqueia o corte.)

### Lote 5 — Q1-Q4 Objetivos → `Goal` + `/agency/metas`

- **Origem:** lista `Objetivos & Metas` (Q1, Q2, Q3, Q4).
- **Destino:** model `Goal` (schema :380): `clientId`, `metric (MetricType)`,
  `period (WEEKLY|MONTHLY)`, `targetValue`, `startDate`, `endDate`, `notes` —
  editável em massa na tela `/agency/metas` (ADMIN; actions `goals.ts`).
- **Tradução (não é cópia 1:1):** objetivo trimestral do ClickUp vira metas
  MENSAIS por cliente no Performli (o `Goal` não tem período QUARTERLY — decisão:
  quebrar o trimestre em 3 metas mensais, `notes: 'Q3/2026 — importado do ClickUp'`).
  Objetivos que não são metas de cliente (ex. meta interna de faturamento da
  agência) não têm model hoje → ficam registrados no doc do lote e viram decisão
  de produto (não criar model no import).
- **Escopo temporal:** importar apenas Q3/Q4 2026 (futuro). Q1/Q2 são história —
  ficam no export CSV.
- **Exit:** planejamento de metas passa a nascer em `/agency/metas`; o cron de
  weekly goals e o motor de resultado (ROAS→etapa) já consomem `Goal`.

### Lote 6 — Desligamento formal do _Recorrentes - Tráfego (por cliente)

Não há import (o motor já substitui a geração). O que falta é o **corte formal
por cliente**: arquivar a lista do cliente no ClickUp assim que ele entrar no
regime Performli. Começa pelo piloto (§6) e segue o calendário da §7. Tarefas
avulsas abertas na lista do cliente (não recorrentes) são importadas com
`clickup-cliente-{slug}:{id}` + `clientId` no dia do corte de cada lote.

---

## 6. Critério de aceite — piloto Bambola (BLOCO 8)

O gate de TODO o plano é o piloto do BLOCO 8 do prompt mestre:

1. **Cliente piloto: Bambola.** Por 2 semanas, a operação da Bambola roda 100%
   no Performli: recorrentes geradas pelo motor, demandas no Hub de Suporte,
   check-in semanal com validação da CS, tarefas avulsas na Central. A lista
   Bambola do ClickUp fica congelada no dia 1 do piloto.
2. **Aprovação do piloto exige, nas 2 semanas:** zero volta ao ClickUp para a
   Bambola; recorrências regenerando sozinhas por 2 ciclos; ritmo semanal
   (War Room/pulse/check-in) rodando nas views do Performli; nenhuma perda de
   demanda reportada pelo time.
3. **Só com o piloto aprovado** os demais ~29 clientes entram no calendário de
   corte por lote (§7). Piloto reprovado = lotes de cliente param, causas viram
   fatias de correção, piloto reinicia.
4. Cada lote de listas internas (1-5) tem aceite próprio, mais simples:
   **1 semana após o corte sem ninguém precisar reabrir a lista congelada.**

---

## 7. Calendário sugerido (datas de corte por lote)

Hoje = quinta 2026-07-02. Cortes sempre em SEGUNDA (semana começa limpa).
Enquanto o corte não chega, a lista segue viva SÓ no ClickUp (§1.1).

| Quando | O quê |
|---|---|
| **D-0 · sex 03/07 - sex 10/07** | Preparação: coletar list_ids das listas da §3 e `externalId` dos 5 usuários restantes (via API ClickUp `GET /team`); export CSV de arquivo de TODAS as listas; script base de import (§8) com dry-run |
| **seg 06/07 - dom 19/07** | **Piloto Bambola** (2 semanas; lista Bambola congelada em 06/07). Roda em paralelo à preparação — a infra do piloto já está em produção |
| **seg 13/07** | **Corte Lote 1** (tarefas do time) + **Corte Lote 2** (rituais/reuniões) — pequenos e do time interno, cabem juntos |
| **seg 20/07** | Gate do piloto Bambola (BLOCO 8) + **Corte Lote 3** (contratos, após reconciliação na semana anterior) |
| **seg 27/07** | **Corte Lote 4** (financeiro: reconciliação a receber + import a pagar + reconciliação CRM) e **Lote 5** (metas Q3/Q4 — início de trimestre, timing ideal) |
| **seg 27/07 · 03/08 · 10/08** | **Lote 6**: demais ~29 clientes em 3 ondas de ~10 (ordem: clientes dos gestores mais ativos no Performli primeiro), condicionado ao gate do piloto |
| **seg 17/08** | Revisão final: sobrou algo vivo no ClickUp além de RH/Notas Fiscais/Comercial (backlog)? Se não, downgrade/cancelamento do plano ClickUp entra na pauta do dono |

---

## 8. Execução técnica (padrão do script, para quando cada lote abrir)

Reusar o padrão que já funcionou (`src/services/seed-suporte.ts` +
`seed-carteiras.ts`), um service por lote:

1. **Fonte:** API ClickUp (`GET /list/{list_id}/task?include_closed=false&subtasks=true`)
   com token em `IntegrationSetting` (regra CLAUDE.md #5 — nunca hardcode) e
   timeout; OU snapshot JSON commitado no service (como o Suporte fez com os 21
   itens) — preferir snapshot para lote pequeno: revisável em PR, zero segredo.
2. **Dry-run primeiro:** o service aceita `{ dryRun: true }` e devolve o relatório
   (criaria/pularia/sem-responsável/sem-cliente) sem escrever. Rodar via rota
   admin protegida (padrão `api/admin/seed-operacao`: sessão ADMIN, 401/403).
3. **Upsert por `idempotencyKey`** (`findUnique` → `create`, colisão P2002 =
   pulada) + espelho `statusId` via `statusMapFor` + `TaskList` upsert por
   `externalId` + `AutomationLog`/`AuditLog` por item (CLAUDE.md #8).
4. **Try/catch por item** — 1 tarefa quebrada não derruba o lote (CLAUDE.md #7).
5. **Relatório do lote no PR:** criadas × puladas × pendências (sem responsável /
   cliente ambíguo) — pendências resolvidas ANTES do corte.

---

## 9. Riscos deste plano

| # | Risco | Mitigação |
|---|---|---|
| 1 | Dupla digitação durante a janela (alguém edita a lista congelada no ClickUp) | Renomear `[MIGRADA]` + remover da sidebar do ClickUp + comunicado no corte; aceite do lote = 1 semana sem reabertura |
| 2 | `externalId` de usuário faltando → assignee errado | Lote 1 NÃO tem fallback: item sem match trava na fila de pendência do dry-run |
| 3 | Nome de cliente do ClickUp não casa com `Client` (grafia) | `normalize` + fila de ambíguos revisada à mão (padrão seed-carteiras, que já reporta `notFound`) |
| 4 | Status ClickUp fora do de-para | Import para o lote e pede decisão (§4) — nunca mapeia no chute |
| 5 | Contratos divergentes (ClickUp × cadastrado) | Lote 3 é reconciliação com arbitragem do dono ANTES de escrever |
| 6 | Piloto reprova e os lotes de cliente já andaram | Lote 6 é condicionado ao gate de 20/07 — nenhuma onda de cliente antes disso |
| 7 | Recorrência importada duplicar com o motor | Rituais usam `clickup-*` (seed) e o motor usa `recur:{taskId}:{data}` — chaves disjuntas; recorrentes de cliente NUNCA são importadas (motor é a fonte) |
