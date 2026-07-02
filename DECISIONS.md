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
