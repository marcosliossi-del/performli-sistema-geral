# HANDOFF — Fase 4b · A4-VIEWS · AS VIEWS (Lista + Kanban + Filtros)

> Sub-fatia 4b do módulo Tasks ClickUp-class: evolução da Central de Tarefas
> (`/operacional`) para as views ClickUp-class — toggle Lista|Kanban, view Lista
> (grupos por status colapsáveis + edição inline), view Kanban (DnD entre/dentro
> de colunas), barra de filtros única. Optimistic + rollback + toast em 100% das
> mutações (D-001). @hello-pangea/dnd (D-002). Fractional (D-003). Sem 4ª
> superfície: evoluí `/operacional`, não criei rota nova. Ambiente: sem build
> local, node_modules ausente (validação de tipos resolve no Vercel).

## 1. O QUE FOI FEITO

### Leitura (DAL — não é action; extensão sancionada do shape de dados)
- `src/lib/dal.ts` — `getOperacionalBoard` + tipo `OperacionalTask` estendidos
  (aditivo, sem quebrar consumidores). Novos campos no `select`: `completedAt`,
  `clientId`, `assignedTo`, `tags`, `orderIndex`, `auxAssignees{userId}`,
  `checklist{done}` (→ `checklistDone`/`checklistTotal`), `_count{comments}` (→
  `commentCount`). Monta `assignees: {id,name}[]` (principal + auxiliares, D-005)
  resolvendo os nomes dos aux em UMA query em lote (evita N+1; `TaskAuxAssignee`
  não tem relação de user direta).

### Motor compartilhado (client-safe, puro)
- `src/components/operacional/taskBoard.ts` — "os dados são um só; as views são
  lentes". `TaskFilters` + `applyFilters` (AND), persistência localStorage de
  view e filtros (`loadView/saveView/loadFilters/saveFilters`), `isOverdue`/
  `matchesDue` por DIA no fuso `America/Sao_Paulo` (D-006, coerente com
  DueDateChip), `compareTasks` (orderIndex asc nulls-last → dueDate asc),
  `compareCompletedDesc`, ordens de pipeline (`PIPELINE_STATUS_ORDER`,
  `KANBAN_BASE_STATUS`, `CLOSED_STATUS`, `DONE_COLUMN_LIMIT=20`),
  `legacyStatusValue`/`STATUS_VALUE_OPTIONS`, `toTaskVM` (OperacionalTask →
  `TaskVM` da Fase 3), e o contrato `BoardHandlers` (interações otimistas).

### Componentes de view (usam os átomos da Fase 3)
- `TaskFiltersBar.tsx` — barra ÚNICA (Lista + Kanban + legadas). Status (multi),
  responsável (multi), prioridade (multi) via popover de checkboxes; cliente
  (select, com "Interno"); vencimento (Atrasadas | Hoje | Próximos 7 dias | Sem
  prazo, pílulas exclusivas); busca client-side; "Limpar (N)".
- `TasksListView.tsx` — grupos por status colapsáveis na ordem do pipeline;
  cabeçalho = pílula `StatusBadge` (Fase 3) + contagem; Concluído/Cancelado
  colapsados por default; criação rápida no rodapé do grupo "A fazer".
- `TaskListRow.tsx` — linha com edição inline compondo os átomos da Fase 3 em
  modo INTERATIVO: `StatusBadge` (troca de status, `updateTaskStatus`, try/catch
  do guard), `PriorityFlag` (`updateTaskFields`, `allowClear=false`),
  `DueDateEditor` (input no clique → `updateTaskFields`), `AssigneeAvatars`
  (`assignTask`/`unassignTask`); título → `/t/{id}`. Estático quando o papel não
  pode editar (RBAC na renderização).
- `TasksKanbanView.tsx` — colunas = status do pipeline (8 ativas sempre + as
  encerradas/extras só com tarefas); contador por coluna; `TaskCard` (Fase 3);
  DnD @hello-pangea/dnd: entre colunas → `updateTaskStatus`; dentro da coluna →
  `reorderTask(id, beforeOrderIndex, afterOrderIndex)` (null nas bordas);
  Concluído/Cancelado limitados às 20 mais recentes; criação rápida no rodapé de
  "A fazer".
- `DueDateEditor.tsx` — vencimento editável inline (chip → input date), toast
  próprio no erro (o chip não é átomo com toast).
- `QuickAddTask.tsx` — criação rápida (rodapé de grupo/coluna); cria SEMPRE em
  "A fazer" (createOperacionalTask); Enter cria, Esc fecha.

### Orquestração (evolução, não reescrita de conceito)
- `src/components/operacional/OperacionalBoard.tsx` — estado otimista local
  (`useState` semeado das props, D-001), toggle de view persistido (default
  Lista), filtros persistidos, handlers otimistas (optimistic → action →
  rollback + rethrow no erro; átomos/DnD exibem o toast). PRESERVA: deep-link
  `?task=` → `TaskDrawer` atual, `NovaTarefaModal`, e as views legadas
  Calendário / Por Cliente / Por Gestor. Novas views Lista/Kanban abrem o painel
  canônico `/t/{id}` (D-009); as legadas seguem no `TaskDrawer`.
- `src/app/(dashboard)/operacional/page.tsx` — passa `currentUser={{id,name}}`
  (para o item otimista da criação rápida). KPIs/cabeçalho intactos.

## 2. DECISÕES TOMADAS

- **Toggle Lista|Kanban preservando as 3 views legadas.** O `Segmented` mantém
  as 5 lentes (Lista, Kanban, Calendário, Por Cliente, Por Gestor); default e
  persistência em Lista. Remover Calendário/Cliente/Gestor violaria "preserve
  tudo" e a regra #12 (não remover função sem justificativa). Lista/Kanban são
  as novas ClickUp-class; as outras 3 seguem com os componentes legados.
- **Linha da Lista compõe os ÁTOMOS da Fase 3, não o `TaskRow`.** `TaskRow`
  (Fase 3) é display-only (sem props interativas). Para a exigência de edição
  inline, criei `TaskListRow` espelhando o layout do `TaskRow` e fiando os átomos
  interativos (StatusBadge/PriorityFlag/AssigneeAvatars/DueDateChip). Não alterei
  as props públicas do `TaskRow` (fase-3 §6). O Kanban usa `TaskCard` (Fase 3)
  direto — cards não editam inline (só DnD + abrir painel).
- **Criação rápida só no grupo/coluna "A fazer".** `createOperacionalTask` cria
  em `A_FAZER`. Criar-e-mover para outros status arriscaria fluxos com guard
  (ex.: `AGUARDANDO_CS` exige evidência via `submitTaskForValidation`). Ofereço
  quick-add apenas em "A fazer" (o mais simples e seguro). Demais grupos/colunas
  não têm quick-add.
- **Painel canônico `/t/{id}` nas views novas; `?task=`/`TaskDrawer` preservado.**
  Duas superfícies de detalhe coexistem por compat (o deep-link `?task=` externo
  continua abrindo o drawer atual; as views novas navegam ao slide-over da 4a).
- **Persistência de filtros em localStorage (não em `TaskSavedView`).** O model
  `TaskSavedView` (id, ownerId?, name, config Json) existe, mas NÃO há action de
  escrita e é proibido criar action nesta fatia. Persisti view+filtros por
  navegador (localStorage). Ver §Lacunas.
- **Colunas do Kanban derivadas p/ não sumir tarefa.** Sempre mostro as 8 ativas
  base; `AGUARDANDO_GESTOR`/`ATRASADO`/`CANCELADO` aparecem só quando têm tarefas
  (nenhuma tarefa fica sem coluna). Encerradas limitadas a 20 (ordem `completedAt`
  desc), com rótulo "mostrando as N mais recentes de M".
- **Handlers rethrow, não toastam (exceto quick-create e DnD).** Padrão único:
  optimistic → rollback → rethrow; o átomo interativo da Fase 3 mostra o toast.
  Onde não há átomo (DnD e DueDateEditor), o próprio wrapper toasta.
- **Sem virtualização.** Memoizei `filtered` e as derivações de grupos/colunas;
  ~500 linhas/cards renderizam sem travar no uso interno (dark, ~6-10 usuários).
  Se algum cliente ultrapassar muito isso, revisitar com virtualização (ADR novo).

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)

- **Salvar/nomear "views" persistidas em `TaskSavedView`** — sem action de
  escrita e proibido criar action aqui (lacuna registrada).
- **Multi-select + bulk actions na Lista** — o BLOCO 4 A4 marca como "pode ser
  fase 2 se o gate apertar". Fora do escopo desta fatia.
- **Reorder perfeito quando a coluna tem `orderIndex` majoritariamente NULL** —
  segui o contrato (passar orderIndex dos vizinhos, null nas bordas; ordenar por
  orderIndex asc nulls-last → dueDate asc). Ver §Riscos.
- **Edição inline no Kanban card** — cards abrem o painel `/t/{id}` (onde tudo é
  editável, 4a). Só a Lista edita inline; o Kanban edita status via DnD.
- **Não toquei em `src/app/actions/**`, `/suporte`, `/meu-dia`** (instrução).

## 4. COMO VALIDAR (quando o ambiente tiver deps)

1. `npx tsc --noEmit` — no ambiente só aparecem "Cannot find module" (sem
   node_modules/prisma gerado). Resolve no Vercel (install + `prisma generate`).
2. `/operacional`: toggle Lista|Kanban no topo; recarregar → mantém a última view
   (localStorage). Default Lista em navegador novo.
3. **Lista**: grupos por status colapsáveis; Concluído/Cancelado colapsados;
   clicar status/prioridade/prazo/responsável edita inline (otimista); forçar
   erro (concluir tarefa crítica sem evidência) → rollback + toast com o motivo;
   "+ Nova tarefa" em "A fazer" cria e aparece no topo do grupo.
4. **Kanban**: arrastar card entre colunas troca o status (otimista, rollback no
   guard); arrastar dentro da coluna reordena; contador por coluna; Concluído
   limitado a 20; "+ Nova tarefa" em "A fazer".
5. **Filtros** (compartilhados): combinar status+responsável+prioridade+cliente+
   vencimento+busca (AND); "Limpar (N)"; persistem ao recarregar.
6. Clicar no título (Lista) ou no card (Kanban) → slide-over `/t/{id}` (painel
   4a) sem perder a lista atrás; deep-link `?task=<id>` ainda abre o TaskDrawer.

## 5. RISCOS ATIVOS

- **Reorder dentro da coluna com `orderIndex` NULL (risco herdado do A2).**
  `orderIndex` é majoritariamente NULL (só preenchido on-write por `reorderTask`).
  Ao soltar entre dois itens sem índice, `orderBetween(null,null)`→chave inicial
  e, como `compareTasks` ordena "com índice antes de sem índice", o card sobe ao
  topo do bloco ativo em vez de parar exatamente no ponto solto. Auto-melhora à
  medida que itens ganham índice. Mitigação futura (fora desta fatia, exige
  action): semear `orderIndex` em lote por coluna. Drag ENTRE colunas (status) é
  perfeito.
- **Estado otimista não re-semeia das props no meio da sessão** (padrão D-001/
  LeadKanban). `revalidatePath` das actions atualiza o server; a próxima
  navegação/refresh traz o estado fresco. Sem flicker; coerente com os boards
  existentes.
- **Interceptação `/t/{id}` (risco #4 do 4a).** Se o App Router renderizar a
  página cheia em vez do slide-over, degrada graciosamente (navegação funcional).
  Nenhuma regressão no `?task=`.
- **Cast `as unknown as React.HTMLAttributes` no `dragHandleProps`** (fricção de
  tipos @hello-pangea/dnd × prop da Fase 3). Props são spread num elemento; cast
  seguro, sem `any`.

## 6. LACUNAS DE ACTIONS (para o A0 arbitrar / A2 se necessário)

1. **Sem action de escrita para `TaskSavedView`** — não é possível salvar/nomear
   filtros por usuário no banco. Persisti em localStorage. Se "views salvas"
   virar requisito: falta `saveTaskView`/`listTaskViews`/`deleteTaskView`
   (owner = userId, `config Json` = TaskFilters + view). NÃO criei action.
2. **Criar tarefa direto em status ≠ A_FAZER** — `createOperacionalTask` fixa
   `A_FAZER`. Para quick-add em qualquer grupo/coluna sem create-then-move,
   faltaria um parâmetro de status na action (com validação dos fluxos que
   exigem evidência). Optei por quick-add só em "A fazer".

## 7. INSTRUÇÕES PARA O GUARDIÃO

- **Contratos NÃO alterados:** props públicas dos átomos da Fase 3 (só consumidas),
  assinaturas das actions (só chamadas), rota `/operacional`, deep-link `?task=`.
- **Arquivos NOVOS:** `taskBoard.ts`, `TaskFiltersBar.tsx`, `TasksListView.tsx`,
  `TaskListRow.tsx`, `TasksKanbanView.tsx`, `DueDateEditor.tsx`, `QuickAddTask.tsx`.
- **Arquivos ALTERADOS:** `OperacionalBoard.tsx` (reescrito preservando legados +
  drawer + deep-link), `src/lib/dal.ts` (`getOperacionalBoard`/`OperacionalTask`
  aditivo), `operacional/page.tsx` (+`currentUser`).
- **Ponto a vigiar em runtime:** clique no título/card abre slide-over `/t/{id}`
  (não navega para a página cheia); reorder dentro da coluna (limitação NULL
  acima); guard bloqueia conclusão de tarefa crítica com rollback + toast.
