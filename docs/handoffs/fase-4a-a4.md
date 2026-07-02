# HANDOFF — Fase 4a · A4-VIEWS · O PAINEL DA TASK

> Sub-fatia 4a do módulo Tasks ClickUp-class: painel slide-over com URL própria
> (`/t/[taskId]`), a tela onde TUDO da task é editável (D-009, anti-feature
> 2.11 §5). Optimistic + rollback + toast em 100% das mutações (D-001).
> Ambiente: sem build local, npm bloqueado, node_modules ausente.

## 1. O QUE FOI FEITO

### Rota (D-009 — rota interceptada, protótipo primeiro / risco #4)
- `src/app/(dashboard)/t/[taskId]/page.tsx` — **página cheia standalone** (server).
  `requireSession` → `loadTaskPanel` → `notFound()` se null (não existe OU sem
  acesso) → `<TaskPanel variant="page">`. Alvo robusto de deep-link/refresh.
- `src/app/(dashboard)/@modal/(.)t/[taskId]/page.tsx` — **rota interceptada**
  (server): mesmo loader, `<TaskPanel variant="slideover">`. Só dispara em
  navegação suave a partir de qualquer tela do grupo `(dashboard)`.
- `src/app/(dashboard)/@modal/default.tsx` — slot vazio (null) para toda rota
  que não é `/t/[taskId]` e para navegação dura/refresh.
- `src/app/(dashboard)/layout.tsx` — passa a receber o slot `modal` e repassa ao
  shell (aditivo).
- `src/components/layout/DashboardShell.tsx` — prop opcional `modal`, renderizada
  ao fim do shell (é `fixed`, não desloca layout).
- `src/middleware.ts` — `/t/` adicionado ao `PROTECTED_PREFIX` (redirect no edge
  com callbackUrl; o server component já protegia via `requireSession`).

### Painel
- `src/components/tasks/TaskPanel.tsx` (client) — componente único com prop
  `variant: 'page' | 'slideover'`. Chrome do slide-over: overlay + `<aside>`
  lateral direito com `useModalA11y` (Esc/click-fora → `router.back()`, foco
  preso, scroll travado). Seções na ordem do BLOCO 4 A4:
  1. **Header**: `InlineEdit` do título · `StatusBadge` interativo
     (`updateTaskStatus`, try/catch do guard) · `PriorityFlag` interativo
     (`allowClear=false`) · `AssigneeAvatars` interativo (`assignTask`/
     `unassignTask`) · datas início/vencimento (inputs `date` + botão limpar →
     `updateTaskFields`) · botão Seguir/Seguindo (`toggleWatcher`) · link do
     cliente (`/clients/[slug]`) · badge de suporte/categoria quando `isSupport`.
  2. **Recorrência** (`RecurrenceEditor`, arquivo próprio).
  3. **Descrição**: `AutoTextarea` (cresce com o conteúdo) salva no blur
     (`updateTaskFields`), placeholder "Adicionar descrição…".
  4. **Checklist**: `ChecklistBlock` (reuse) com `onToggle → toggleChecklistItem`.
  5. **Dependências**: listas "Bloqueada por"/"Bloqueia" com títulos + status;
     `DependencyPicker` (busca nas tarefas do mesmo cliente) → `addTaskDependency`
     (erro de ciclo cai no toast).
  6. **Abas Comentários | Atividade**: `CommentThread` (`addTaskComment`,
     otimista com append) e `ActivityFeed` (últimas 30 activities).
  7. **Rodapé**: origem, pedido em, criada em, atualizada (regra UX #10) +
     flags "Exige evidência"/"Exige validação".
- `src/components/tasks/RecurrenceEditor.tsx` (client) — editor ClickUp-like:
  resumo ("Repete toda semana (segunda) · ao concluir" ou "Não se repete"),
  dropdown frequência, intervalo numérico, chips de dias (WEEKLY, domingo-first
  0..6), toggle "Ignorar dias não úteis" (`skipWeekends`), modo fixo
  `onComplete` com texto explicativo, botões "Salvar" (`setTaskRecurrence`) e
  "Não repetir" (`setTaskRecurrence(null)`, vermelho). Monta o objeto no shape
  EXATO do `parseRecurrenceRule`. Exporta `describeRecurrence(rule)`.

### Leitura
- `src/lib/tasks/panel.ts` (`server-only`) — `loadTaskPanel(taskId, session)`:
  select EXPLÍCITO da task inteira + resolução de nomes + usuários selecionáveis
  + candidatas a dependência (mesmo cliente, ou internas do próprio usuário) +
  escopo por papel. Retorna `TaskPanelResult | null`. Datas em ISO string;
  `recurrenceRule` já parseada via `parseRecurrenceRule`.

### Deep-links existentes (não removidos)
- `TaskDrawer` (operacional) ganhou link "Abrir painel completo →" para `/t/{id}`;
  o mecanismo `?task=` do `OperacionalBoard` segue intacto.
- `SupportList`: o título da linha agora é `<Link href="/t/{id}">`.

## 2. DECISÕES TOMADAS
- **Tudo dentro do grupo `(dashboard)`.** A página cheia (`(dashboard)/t/...`) e
  o interceptor (`(dashboard)/@modal/(.)t/...`) vivem no MESMO grupo. Grupos são
  transparentes na URL → ambos no nível raiz → `(.)` casa. Evita a ambiguidade
  clássica de interceptação atravessando fronteira de route group. Bônus: a
  página cheia herda sidebar/topbar e a proteção do layout.
- **`(.)t` (mesmo nível), não `(..)`.** O slot `@modal` e o segmento `t` são
  ambos nível raiz (grupo transparente). Padrão canônico do "modal de foto" do
  Next, adaptado para um grupo.
- **Um `TaskPanel` com `variant`, chrome separado por sub-componente.**
  `useModalA11y` só é chamado dentro do `<SlideOver>` (hook não-condicional no
  componente que o usa). `PanelSections` concentra todo o estado otimista.
- **Prioridade sem "limpar" (`allowClear=false`).** `updateTaskFields.priority`
  não é nullable no contrato do A2; o sistema legado sempre tem prioridade
  (default MEDIA). Não force null.
- **Dependência = candidata BLOQUEIA a atual.** `addTaskDependency(dep.id, taskId)`
  (dep é blocking, task é waiting) → entra em "Bloqueada por".
- **Escopo de leitura no loader.** ADMIN/CS tudo; MANAGER/ANALYST exigem
  assignment (task com cliente) ou serem responsável/aux (task interna). Sem
  acesso → `null` → `notFound()` (não revela existência). `canEdit = role !==
  'ANALYST'` (UX; backend valida por action, CS permitido via `allowCS`).

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)
- **Adicionar itens de checklist pelo painel.** Só existe `toggleChecklistItem`
  no backend; não há action de criar item. `ChecklistBlock` renderiza sem
  `onAdd` (toggle-only). Ver §Lacunas.
- **Editar tags / subtasks / anexos / custom fields no painel.** Fora do escopo
  A4-4a (o TaskPanel foca no editável do BLOCO 4 A4). Tags têm action
  (`updateTaskFields.tags`) mas UI de edição de tags fica para a 4b se pedida.
- **Menções → notificação/watcher a partir do comentário.** `addTaskComment` não
  extrai menções (pendência já registrada pelo A2). O `CommentThread` só realça
  `@` visualmente.
- **`router.refresh()` pós-mutação.** Evitado: o estado otimista local já
  reflete; as actions revalidam as listas server-side.

## 4. COMO VALIDAR (quando o ambiente tiver deps)
1. `npx tsc --noEmit` — sem `node_modules`/prisma gerado aqui; erros são só
   "Cannot find module". Resolve no Vercel (install + `prisma generate`).
2. Deep-link direto: abrir `/t/<id>` no navegador (ou refresh nessa URL) →
   página cheia com sidebar; sem overlay.
3. Interceptação: em `/operacional` (Lista) ou `/suporte`, clicar no título →
   slide-over lateral sobre a lista (contexto atrás preservado); Esc/click-fora
   → volta à lista sem reload; "Abrir painel completo →" leva à página cheia.
4. Edição otimista: trocar status/prioridade/responsável/datas/descrição/
   recorrência → muda na hora; forçar erro (ex.: concluir task crítica sem
   evidência) → rollback + toast com o motivo.
5. Recorrência: configurar WEEKLY seg+qua, salvar → resumo atualiza; concluir a
   task → clone on-complete (verifica o A2/`updateTaskStatus`).

## 5. RISCOS ATIVOS
- **Interceptação + route group é a peça sensível (risco #4).** Se o App Router
  do Next 16 renderizar a página cheia em vez do slide-over na navegação suave
  (ou não preservar o `children`), a **degradação é graciosa**: vira navegação
  para a página cheia funcional. O `?task=` do OperacionalBoard continua
  intocado. Nenhuma regressão. → PONTO A VIGIAR no gate do guardião: confirmar
  em runtime que o clique no título abre slide-over (não navega a página cheia).
- **`router.back()` em visita direta à página cheia** pode não ter histórico; o
  botão "Voltar" fica inócuo nesse caso (não sai do app na prática).
- **Nome de responsável em `unassignTask` do principal**: o backend promove um
  aux a principal; a UI só remove o usuário da lista plana (visualmente correto).

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (A4-4b · VIEWS)

**Ler antes:** este handoff, `docs/handoffs/fase-3-a3.md` (catálogo de props),
`docs/handoffs/fase-2-a2.md` (assinaturas de action), D-009.

**Contrato de navegação (não quebrar):**
- Abrir o painel = `<Link href="/t/{taskId}">` (ou `router.push`). Interceptação
  cuida do slide-over em nav suave; refresh/deep-link cai na página cheia.
- Toda tela com lista que quiser o painel só precisa linkar para `/t/{id}` — o
  slot `@modal` já está montado no layout do `(dashboard)`.

**Contrato de dados (reuso pela 4b):**
- `loadTaskPanel(taskId, session)` em `@/lib/tasks/panel` centraliza fetch +
  escopo. Tipos exportados: `TaskPanelResult`, `TaskPanelData`, `PanelUser`,
  `PanelDependency`, `PanelComment`, `PanelActivity`, `PanelChecklistItem`.
- `TaskPanel` é `variant`-agnóstico; a 4b não deve duplicar o painel.

**Lacunas de actions encontradas (para o A0 arbitrar / A2 se necessário):**
1. **Sem action para criar/renomear/remover item de checklist** — só
   `toggleChecklistItem`. O painel exibe checklist toggle-only. Se a 4b/UX pedir
   adicionar item pelo painel, falta `addChecklistItem`/`removeChecklistItem`.
2. **Sem action para remover dependência** — existe `addTaskDependency`, não há
   `removeTaskDependency`. O painel só adiciona; não desfaz. Registrar como
   micro-tarefa do A2 se a remoção for requisito.
3. **`updateTaskFields.priority` não é nullable** — impossível "sem prioridade"
   pelo painel (`allowClear=false`). Se ClickUp-parity exigir limpar prioridade,
   o A2 precisa aceitar `priority: null`.
4. **Comentário não retorna o registro criado** — o painel usa id temporário
   otimista; sem `id` real até o próximo load. Aceitável; anotado.
