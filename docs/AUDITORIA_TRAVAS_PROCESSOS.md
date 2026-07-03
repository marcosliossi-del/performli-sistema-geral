# AUDITORIA DE TRAVAS — GESTÃO DE PROCESSOS E PROJETOS

> **Pergunta-guia:** onde o fluxo PRENDE — estado sem saída, ação impossível,
> processo que morre em silêncio, usuário sem entender o porquê?
>
> Método: 4 auditores read-only em paralelo (ciclo de vida da task ·
> recorrências/templates/checklists · POPs/check-in/onboarding/offboarding ·
> UX das telas). Toda trava tem evidência `arquivo:linha`.
> Data: 2026-07-04 · Base: main pós-PR #146.

---

## 🔴 TRAVA CRÍTICA SISTÊMICA (corrigir JÁ)

### T-01 · `completionNotes` obrigatório sem NENHUM campo na UI
- **Evidência:** guard exige em `task-completion-guard.ts:73` para TODA tarefa
  crítica (requiresEvidence OU requiresReview OU riskScore≥4 OU **priority
  CRITICA**); nenhum input existe em tela nenhuma (grep: só o reconciler Asaas
  escreve o campo).
- **Consequência:** **qualquer tarefa CRÍTICA é impossível de concluir pela
  UI** — em todas as superfícies, inclusive pela aprovação da CS
  (`operacional.ts:532` reaplica o guard). Todas as tasks das automações
  anti-churn nascem CRÍTICAS → todas travadas. É a continuação direta do bug
  "erro ao concluir tarefa".
- **Agrava:** T-02 (evidência digitada no drawer é PERDIDA ao clicar "Concluir"
  — só o "Enviar para CS" a persiste; `TaskDrawer.tsx:356` vs `:94`) e T-03
  (o painel canônico `/t/[taskId]` não tem campo de evidência, nem
  completionNotes, nem enviar/aprovar — só o badge "Exige evidência";
  `TaskPanel.tsx:609`).
- **Correção (Fatia T1):** textarea "O que foi feito" gravando
  `completionNotes` no fluxo de conclusão; persistir a evidência no Concluir;
  portar o bloco evidência+validação para o TaskPanel.

---

## 🟠 TRAVAS ALTAS

| # | Trava | Evidência | Correção |
|---|-------|-----------|----------|
| T-04 | Check-in **PREENCHIDO nunca validado some do radar** — monitor só cobra ausente e reprovado-stale | `checkin-monitor.ts:158-240` | Alerta "check-in entregue há N dias sem validação da CS" (dedupe semanal) |
| T-05 | Check-in **reprovado de semana passada não tem via de reenvio** — submit sempre grava na semana corrente | `checkin.ts:38` | Aceitar a semana-alvo no reenvio (janela de correção pós-reprovação) |
| T-06 | Cliente **novo no meio da semana** dispara CHECKIN_MISSING no dia 1 e pode disparar a task CRÍTICA de 2ª semana | `checkin-monitor.ts:128-140,159` | Guarda por idade (entra na régua só se existia no início da semana; reincidência exige existir na anterior) |
| T-07 | **Offboarding incompleto**: cliente CHURNED mantém tasks de AUTOMACAO, manuais, metas, alertas e **CriticalProtocol ativo** — ruído eterno | `client-offboarding.ts:104-114` | Cancelar tasks AUTOMACAO abertas + encerrar protocolo no offboarding |
| T-08 | **War Room de cliente cancelado segue sendo cobrada/escalada** pelo monitor | `warroom-monitor.ts:53-54` | Filtrar `client.status != CHURNED` + encerrar no offboarding (T-07) |
| T-09 | **Troca de gestor não migra recorrentes nem War Room** — S2-017 só cobriu origin AUTOMACAO | `assignments.ts:80-88` | Incluir origin RECORRENCIA + atualizar `CriticalProtocol.responsibleId` |
| T-10 | **Série de recorrência morre em silêncio com painel VERDE** — `lastRunAt` avança mesmo com 100% de falha | `recurrence-engine.ts:289` vs `dal.ts:3818` | `lastRunAt` só com ≥1 criado (ou `lastSuccessAt` separado no sinal) |
| T-11 | **Clone on-complete que falha é invisível** — só console.error, sem AutomationLog | `tasks.ts:247-249` | AutomationLog FALHA no catch |
| T-12 | **Kanban de Suporte engole demandas** em 5 status (AGUARDANDO_*, BLOQUEADO, ATRASADO somem sem aviso) + contador do header diverge do board | `SupportBoard.tsx:24-31`, `suporte/page.tsx:97` | Coluna catch-all "Outros" + contador honesto |

## 🟡 TRAVAS MÉDIAS

| # | Trava | Evidência |
|---|-------|-----------|
| T-13 | AGUARDANDO_CS/EM_VALIDACAO sem SLA — CS omissa = task some do radar; approval órfão se o gestor puxa de volta | `task-escalation.ts:34,129` |
| T-14 | GESTOR com task de cliente fora da carteira: vê no Meu Dia mas toda ação lança erro; sem rota de devolução | `tasks.ts:153,32` |
| T-15 | Usuário desativado mantém tasks presas — reatribuição não valida `active` e desativação não realoca | `tasks.ts:354` vs `:88` |
| T-16 | Template desativado/apagado zera as regras sem log | `recurrence-engine.ts:254` |
| T-17 | Papel fora do fan-out (ADMIN/ANALYST) gera zero tasks silenciosamente; rótulos UI≠engine | `recurrence-engine.ts:24,264` |
| T-18 | Motor A de recorrência usa fuso do SERVIDOR (não SP) e **pula dia 29-31 em meses curtos** | `recurrence-engine.ts:37-46,186` |
| T-19 | `/recorrencias`: sem editar/excluir regra (só pausar, só ADMIN), "próxima execução" é texto fixo, falhas invisíveis; Motor B (D-010) não aparece em tela nenhuma | `recurrences.ts:14`, `recorrencias/page.tsx:174` |
| T-20 | Recorrência schedule acumula ocorrências abertas ao infinito; onComplete congela sem sinal dedicado | `task-schedule-recurrence.ts:38` |
| T-21 | WeeklyChecklist: cron de domingo falha → semana sem checklist, sem retry nem regeneração manual, sem alerta | `daily/route.ts:419` |
| T-22 | Onboarding não re-disparável se falhar por completo; cliente sem gestor manda tudo para o admin criador sem sinal | `clients.ts:124`, `client-onboarding.ts:108` |
| T-23 | Status PAUSED: silencia TODOS os crons sem log e é inalcançável pela UI (feature fantasma) | `schema:62`, `interactions.ts:69` |
| T-24 | `/processos` é decorativa — 100% catálogo estático, nada do banco (falsa sensação de status) | `processos/page.tsx:48-118` |
| T-25 | Comentário/checklist do drawer engolem `{error}` (toast de sucesso incondicional) | `TaskDrawer.tsx:84-90` |

## 🟢 TRAVAS BAIXAS
T-26 idempotencyKey perpétua impede renascer task cancelada (warroom-diagnostico, onboarding-30d) · T-27 ATRASADO ausente dos seletores (estado "solto") e listas de status divergem entre painel e board · T-28 checklist dominical depende do health da mesma rodada (vazio ambíguo) + comentário diz segunda e código domingo · T-29 popId decorativo (sem consumo funcional) · T-30 recorrência sem data real de próxima execução na tela · T-31 sinal "recorrente onComplete parada" inexistente · T-32 escala BLOQUEADO sem dono/critério de saída formal (saível por dropdown — risco operacional, não trava dura).

## O que foi verificado e ESTÁ SÃO
Optimistic com rollback no kanban (operacional e suporte); papéis escondidos/explicados corretamente nas telas; mensagens do guard operacionais; contrato {ok}|{error} pós-hotfix; idempotência dos dois motores de recorrência; try/catch por item em todos os crons; reprovação de check-in exige nota; reenvio na mesma semana funciona; checklist obrigatório tem aviso e saída.

---

## PLANO DE CORREÇÃO (fatias com guardião)

| Fatia | Escopo | Travas |
|-------|--------|--------|
| **T1 — Destravar conclusão (URGENTE)** | Campo "O que foi feito" (completionNotes) no fluxo de conclusão; evidência persistida no Concluir; bloco evidência+validação no TaskPanel; erros de comment/checklist tratados | T-01, T-02, T-03, T-25 |
| **T2 — Processos que não morrem em silêncio** | Cobrança de check-in sem validação; reenvio de semana passada; guarda de cliente novo; offboarding completo (AUTOMACAO+protocolo); monitor ignora CHURNED; troca de gestor migra RECORRENCIA+responsibleId | T-04..T-09 |
| **T3 — Recorrências confiáveis** | lastRunAt honesto; AutomationLog no clone; log de template inativo/papel inválido; fuso SP + clamp mensal; suporte: coluna catch-all + contador; próxima execução real na tela | T-10..T-12, T-16..T-18, T-30 |
| **T4 — Arestas** | SLA de validação; usuário desativado; ATRASADO nos seletores; regeneração de checklist; onboarding re-disparável; idempotency cancelada | T-13, T-15, T-21, T-22, T-26, T-27 |
| **Backlog decidir com Marcos** | PAUSED (definir semântica ou remover), /processos viva, tela do Motor B, edição de regras/templates | T-19, T-20, T-23, T-24 |
