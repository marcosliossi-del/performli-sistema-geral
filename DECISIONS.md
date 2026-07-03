# DECISIONS.md — Módulo Tasks ClickUp-class (Performli)

> ADRs do projeto PROMPT_MESTRE_TASKS.md. Formato: contexto → decisão → alternativa descartada → consequência.
> Só o A0-ORQUESTRADOR adiciona/altera entradas. Contratos públicos não mudam sem registro aqui.

---

## D-001 — Estado no cliente: server actions + optimistic local (sem TanStack Query)

- **Contexto:** o BLOCO 3.4 exige escolher UM padrão. O repo já usa, em 100% dos boards (PipelineBoard, SupportBoard, SupportList, OperacionalBoard), o padrão `useState` local + update otimista + rollback com toast em `{error}`/throw, com server actions puras.
- **Decisão:** manter **server actions + estado otimista local (`useState`/`useOptimistic`)**. Zero cache client-side global.
- **Descartado:** TanStack Query — introduziria segundo paradigma de dados, invalidação dupla (revalidatePath + queryClient) e dependência nova sem dor real (~6-10 usuários).
- **Consequência:** todo componente novo do módulo segue o padrão dos boards existentes; reconciliação é sempre `revalidatePath` cirúrgico + rollback local.

## D-002 — Drag-and-drop: @hello-pangea/dnd (já instalada)

- **Contexto:** BLOCO 0 §9 prefere `@dnd-kit`; porém `@hello-pangea/dnd` ^18 já está no package.json. Os kanbans atuais (Pipeline, Suporte) usam drag nativo HTML5.
- **Decisão:** o kanban novo do módulo usa **@hello-pangea/dnd** (reaproveitar > reescrever; regra de ouro #1 vence a preferência do §9). Boards legados em drag nativo permanecem até serem absorvidos pelo módulo.
- **Descartado:** `@dnd-kit` — duas libs de DnD no bundle é dependência desnecessária (regra #9).
- **Consequência:** reordenação dentro da coluna e entre colunas com a mesma lib; se @hello-pangea limitar a virtualização futura, revisitar em ADR novo.

## D-003 — Fractional indexing: lib `fractional-indexing`

- **Contexto:** BLOCO 3.2 trava ordenação manual por chave lexicográfica. Não existe nenhuma ordenação manual persistente no schema atual (auditoria Fase 0).
- **Decisão:** adotar a lib **`fractional-indexing`** (minúscula, zero deps) para `orderIndex String` em Task/Status/List.
- **Descartado:** implementação própria (risco de edge cases de colação) e `Int position` com reshuffle (proibido pelo prompt mestre).
- **Consequência:** dependência nova justificada aqui (regra #9). Todo drag = 1 UPDATE.

## D-004 — Convergência de status: FK aditiva com espelho do enum (2 etapas)

- **Contexto:** o alvo é `Status`/`StatusSet` FK por List; hoje `TaskStatus` é enum de 11 valores usado por dezenas de superfícies (Hub de Suporte, recorrência, guard, counts, cockpit, escalação). Dropar/renomear é proibido (regra #2).
- **Decisão:** convergência em **duas etapas**: (1) criar `StatusSet`/`Status` + `Task.statusId String?` NULO, backfill mapeando enum→Status do set padrão Arkza, mantendo `Task.status` enum funcionando como espelho (mutações escrevem nos dois); (2) só depois que 100% das superfícies lerem `statusId`, deprecar o enum em migration separada (fase futura, fora do MVP).
- **Descartado:** big-bang (migrar tudo de uma vez) — quebraria Hub de Suporte e as 510 tarefas recorrentes em produção.
- **Consequência:** durante a convivência, o mapeamento semântico é `Status.group`: A_FAZER→NOT_STARTED · EM_ANDAMENTO/EM_VALIDACAO/AGUARDANDO_*/AJUSTES_SOLICITADOS/BLOQUEADO/ATRASADO→ACTIVE · CONCLUIDO→DONE · CANCELADO→CLOSED. O A1 detalha no schema-diff.

## D-005 — Multi-assignee: M:N aditivo com `assignedTo` como espelho do principal

- **Contexto:** alvo é `TaskAssignee` M:N; hoje `Task.assignedTo String` (obrigatório) alimenta counts, meu-dia, escalação, recorrência.
- **Decisão:** criar `TaskAssignee` aditivamente; `assignedTo` permanece como **responsável principal** (primeiro assignee) e continua sendo escrito em toda mutação. Leituras novas usam M:N; leituras legadas seguem funcionando.
- **Descartado:** tornar `assignedTo` nullable/removê-lo no MVP.
- **Consequência:** "Minhas tarefas" consulta via OR (assignedTo OU TaskAssignee) até a Fase de limpeza.

## D-006 — Timezone: UTC no banco, America/Sao_Paulo em todo cálculo de servidor

- **Contexto:** risco #3 do BLOCO 7. Crons diários existentes já calculam "hoje" no servidor.
- **Decisão:** armazenar UTC; todo cálculo de "hoje/atrasada/próxima ocorrência" usa TZ explícita `America/Sao_Paulo` (helper único em `lib/`); testes de borda domingo→segunda e virada de mês obrigatórios no gate da Fase 5.

## D-007 — Tenancy: Workspace único "Arkza" criado desde já, enforcement gradual

- **Contexto:** regra de ouro #6 (multi-tenant dia zero) vs sistema atual single-tenant sem `workspaceId` em lugar nenhum.
- **Decisão:** A1 cria `Workspace` + `WorkspaceMember` com 1 registro (Arkza) e FK `workspaceId` nas tabelas NOVAS do módulo. Tabelas legadas ganham `workspaceId` opcional com backfill, sem obrigatoriedade no MVP. Helper `assertCan` já nasce checando workspace.
- **Consequência:** virar SaaS = tornar as FKs obrigatórias + login multi-workspace; nada de reescrita.

## D-008 — WIP preservado: edição inline pré-prompt-mestre

- **Contexto:** havia uma fatia de edição inline de campos (TaskDrawer/SupportList + updateTaskFields) em andamento quando o prompt mestre chegou; foi interrompida no meio.
- **Decisão:** preservada SEM merge na branch `wip/task-edit-inline`. A Fase 4 (A4-VIEWS) decide aproveitar o código ou substituir pelo painel slide-over canônico.
- **Consequência:** nenhum código não-verificado na main; a demanda do usuário (editar prazo/responsável/descrição + recorrência na task) é atendida pelo módulo nas Fases 2 e 4.

## D-009 — Painel da task: slide-over com rota própria /t/[taskId]

- **Contexto:** anti-feature 2.11 §5 (sem modais aninhados) + deep-links já implementados hoje via `?task=<id>`.
- **Decisão:** painel slide-over com rota interceptada `/t/[taskId]` (parallel routes). Os deep-links `?task=` existentes continuam funcionando e passam a redirecionar para `/t/[taskId]` quando o painel novo entrar (Fase 4).
- **Consequência:** protótipo da rota interceptada é a PRIMEIRA entrega da Fase 4 (risco #4 do BLOCO 7).

## D-010 — Recorrência por task: campo `Task.recurrenceRule Json?` (migration aditiva na Fase 2)

- **Contexto:** o alvo (BLOCO 2.10/3.1) e o pedido explícito do dono (recorrência estilo ClickUp na task individual) exigem regra NA task; o motor existente (`TaskRecurrenceRule`) é template+cliente, inadequado para regra individual. A Fase 1 não incluiu o campo.
- **Decisão:** o A2 adiciona `Task.recurrenceRule Json?` (shape `{ freq: 'DAILY'|'WEEKLY'|'MONTHLY', interval, byWeekday?: number[], mode: 'onComplete'|'schedule', skipWeekends?: boolean }`) com migration aditiva idempotente própria, e implementa `computeNextOccurrence` puro + clone on-complete com dedupe `recur:{originTaskId}:{occurrenceDate}`.
- **Descartado:** reusar TaskRecurrenceRule para regras por task (acoplaria o motor de templates a um caso individual).
- **Consequência:** dois mecanismos de recorrência coexistem com papéis claros: templates por cliente (15 fixas) e regra individual por task (ClickUp-style).

## D-011 — RBAC v2: mapeamento de papéis e estratégia aditiva

- **Contexto:** o projeto RBAC v2 adota a matriz oficial ADMIN · SUPERVISOR_TRAFEGO · ANALISTA_TRAFEGO · CS · GESTOR_TRAFEGO. O enum `Role` (schema; no banco `pg_type='Role'`) hoje tem ADMIN, CS, MANAGER, ANALYST, com **usuários reais** em produção. Remover valor de enum é destrutivo (não-aditivo) e a regra do repo exige migrations aditivas + não quebrar produção.
- **Decisão:** transição **aditiva em duas migrations Postgres separadas** (limitação: valor de enum recém-criado não é usável na mesma transação):
  (a) `20260702060000_rbac_roles_add_values` — `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS` para SUPERVISOR_TRAFEGO, ANALISTA_TRAFEGO, GESTOR_TRAFEGO;
  (b) `20260702061000_rbac_roles_data_migration` — `UPDATE "User"` remapeando **MANAGER→GESTOR_TRAFEGO** e **ANALYST→ANALISTA_TRAFEGO** (ADMIN/CS inalterados). SUPERVISOR_TRAFEGO é papel novo sem dados legados.
  Os valores legados **MANAGER e ANALYST permanecem no enum** como legado até uma limpeza futura (migration própria, quando nenhum código/dado os referenciar). Código NOVO usa exclusivamente os nomes novos.
- **Descartado:** (1) renomear os valores do enum in-place — Postgres `ALTER TYPE RENAME VALUE` existe mas quebraria todo o código TS que compara literais `'MANAGER'`/`'ANALYST'` de uma vez (big-bang, viola "não quebrar produção"); (2) drop/recreate do enum — destrutivo.
- **Consequência:** durante a convivência, o BANCO não terá mais linhas MANAGER/ANALYST após (b), mas o CÓDIGO ainda compara esses literais — o Agente 3 varre e adapta (lista completa no HANDOFF_AGENTE_1). Seeds que ainda gravam papéis legados (`seed-operacao.ts`, `prisma/seed.ts`, `api/seed/route.ts`) devem ser atualizados para os nomes novos para não reintroduzir legado. A remoção final dos valores legados do enum é uma decisão/ADR futura.

## D-012 — Semântica de metas: SPEND, B2B e valor zero (decisões do dono, 2026-07-02)

- **SPEND (meta de investimento) = "menor é melhor" — MANTIDO.** Contexto: o cliente libera um teto de verba (ex.: 10k); investir menos e entregar o faturamento é segurança para a empresa. Investir 7k de 10k é PONTO POSITIVO. O health-scorer trata SPEND como LOWER_IS_BETTER e o budget-monitor alerta ao APROXIMAR do teto (90%), nunca por gastar menos. Finding S2-023 da auditoria de metas encerrado como comportamento intencional.
- **B2B mede como NEGÓCIO LOCAL.** Os B2B da Arkza buscam leads: métrica-resultado na plataforma de anúncio, crescimento +20% na projeção do dia 1, saúde medida pelas plataformas de anúncio (não GA4), sem faturamentoEsperado/roasMinimo. Só ECOMMERCE segue faturamento GA4 (+15%).
- **Meta com valor ≤ 0 = "sem meta".** Não grava; zeradas antigas (bug de cálculo) removíveis pelo botão "Limpar metas zeradas" em Configurações (AuditLog goals.limpezaZeradas).
- **Consequência:** relatórios/digest de B2B ainda usam template e-commerce (exibição, não cálculo) — fatia futura se o dono quiser o relatório no formato local.

## D-013 — Canais de investimento fixos e tela única (decisões do dono, 2026-07-03)

- **Canais de investimento permanecem Meta/Google/TikTok (colunas fixas).** A agência é nichada e clientes novos são 100% e-commerce nesses canais — modelar canais extensíveis (Pinterest/LinkedIn/etc.) foi avaliado e DESCARTADO como engenharia antecipada. Se surgir cliente multicanal, reavaliar (alternativa barata: coluna "outros canais").
- **Métricas de meta seguem no enum MetricType (não configuráveis por tabela).** Métrica nova sob demanda = migration aditiva rápida. Configuração por tabela só se o Performli virar produto multi-agência.
- **Tela única = Cockpit.** O Painel Analítico (/dashboard) foi fundido no Cockpit (grid de saúde, oscilações, alertas recentes, selo de sync) e /dashboard virou redirect. Widgets não migrados (WeeklyChecklistCard pessoal, ManagerCards, DashboardAIChat) preservados no repo; o fluxo canônico de check-in vive em /check-ins.

## D-014 — Score de churn v2 PROVISÓRIO e informativo + reexecução automática do backtest (FASE 1.4)

- **Contexto:** o backtest do score de churn v2 rodou em produção em 2026-07-03 (docs/churn-score-backtest.md) com **coorte insuficiente** (4 clientes churned < 8 exigidos) → recall T-6 0% e falso-positivo 0%, resultado **indicativo, não conclusivo**. A regra de decisão do doc manda: sem as metas (recall >= 60% e FP <= 20%) atingidas com coorte válida, os pesos entram como **FAIXAS PROVISÓRIAS** + reexecução em ~90 dias.
- **Decisão:**
  1. **v2 é APENAS INFORMATIVO.** O cálculo semanal corrente do v2 (`src/services/churn-scorer-v2.ts`, chamado no MESMO step do cron logo após o v1) grava o resultado DENTRO de `ChurnRiskScore.factors.v2` (`{ score, faixa, breakdown, provisional: true, versaoPesos }`) — SEM migration (campo Json já existe). O score v1 (`ChurnRiskScore.score`) e as demais chaves de `factors` ficam INTOCADOS. O antichurn-monitor (>=60) e a fila anti-churn (>=40) continuam lendo exclusivamente o v1. O v2 **não dispara** Alert, task, War Room, nem altera limiar de automação.
  2. **No cálculo "hoje" os fatores de estado atual entram de verdade.** Diferente do backtest (foto retroativa, ficha/staleness/feedback zerados por falta de histórico versionado), o cálculo semanal usa `refDate = agora` e sobrepõe fichaCs/stalenessFicha/feedbackReincidencia a partir do estado ATUAL do Client — sem look-ahead, pois é presente. A base reconstruível é reusada de `computeScoreV2At`.
  3. **Cockpit — seção informativa "Exposição a churn (provisório)"** (gate = papéis de visão ampla, como as seções de saúde): top 8 clientes ordenados por **Índice de Exposição = feeAmount × v2/100** DESC. O Índice é exibido em reais **por cliente**, rotulado "Índice de Exposição" com tooltip "não é previsão de receita perdida", e **NUNCA somado/totalizado** ("R$ em risco" como total é proibido). Selo de provisoriedade explícito + estado vazio operacional ("Aguardando primeiro cálculo semanal").
  4. **Reexecução automática como mecanismo (não intenção):** o cron cria — idempotentemente (Task.idempotencyKey `auto:churn-backtest-rerun:2026-10`) e só depois de existir AuditLog `churn.backtest.run` — uma task ALTA/AUTOMACAO ao ADMIN (dueDate 2026-10-01) para reexecutar o backtest com ~90 dias a mais de histórico. `Task.clientId` é nullable → a task fica sem cliente (é tarefa da agência).
- **Candidatos a ganhar peso na recalibração:** performanceRecente e idadeContrato (a heurística de idade é provisória, sem mediana dos churned; a performance recente separou pouco na coorte mínima).
- **Consequência:** o v2 acumula série temporal semanal em `factors.v2` sem risco para a operação (informativo puro); a recalibração de out/2026 vira uma task garantida por mecanismo, não por lembrete manual. Consumidores existentes de `factors` (getClientChurnHistory na DAL, ai-client-context) leem chaves específicas e toleram a chave `v2` extra — nenhum quebra.
