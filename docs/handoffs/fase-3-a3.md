# HANDOFF — Fase 3 · A3-UI-SYSTEM

## 1. O QUE FOI FEITO

Vocabulário visual do módulo Tasks (componentes de domínio) + playground interno.
Todos client components onde há interação; tokens/tipos são módulos puros.

Arquivos criados (`src/components/tasks/`):
- `tokens.ts` — labels/cores/grupos do enum legado, meta de prioridade, cor
  determinística de avatar e tag, iniciais. **Zero hex novo**: tudo em `var(--ak-*)`.
- `Popover.tsx` — popover leve reutilizável (Esc/clique-fora fecham, devolve foco).
- `StatusBadge.tsx` — pílula de status; união discriminada `custom | legacy`;
  variante interativa com dropdown de troca. Export `resolveStatus`, `StatusValue`.
- `PriorityFlag.tsx` — bandeira de prioridade + variante dropdown.
- `AssigneeAvatars.tsx` — stack até 3 +N; variante popover com busca multi-select.
- `DueDateChip.tsx` — chip de prazo (futuro/hoje/atrasado/sem prazo) + ícone Repeat.
- `TagChip.tsx` — chip de tag (paleta suave por hash) + remoção opcional.
- `TaskRow.tsx` — linha densa da view Lista (borda esquerda vermelha p/ atrasada).
- `TaskCard.tsx` — card do Kanban (contadores checklist/comentários, grip de drag).
- `ChecklistBlock.tsx` — itens marcáveis (toggle otimista + rollback), progresso, add inline.
- `CommentThread.tsx` — thread texto-puro (whitespace-pre-wrap, **sem HTML**), menções @ em azul.
- `ActivityFeed.tsx` — timeline action→frase pt-BR com from→to.
- `CustomFieldInput.tsx` — switch por `CustomFieldType` real do schema.
- `InlineEdit.tsx` — texto→input (Enter salva, Esc cancela, blur salva se mudou).
- `ConfirmDialog.tsx` — confirmação com `useModalA11y`, ação destrutiva vermelha.
- `types.ts` — `TaskVM`/`TaskTagVM` (view-models de row/card).
- `index.ts` — barrel de exports.

Playground (`src/app/(dashboard)/dev/components/`):
- `page.tsx` — server, `requireSession` + `redirect('/')` se `role !== 'ADMIN'`. Não vai ao Sidebar.
- `Playground.tsx` — client, todos os componentes em todos os estados (normal, interativo,
  vazio, atrasado, pending, erro) com mocks inline.

## 2. DECISÕES TOMADAS

- **Cores dinâmicas via `var(--ak-*)` + `color-mix`**, não hex. Respeita a allow-list
  congelada da auditoria UX. Fundos/bordas de badges usam `color-mix(in srgb, <cor> N%, transparent)`.
- **Status: união discriminada** `{ kind:'custom', status:{name,color,group} } | { kind:'legacy', status: TaskStatus }`,
  normalizada por `resolveStatus`. Grupos DONE/CLOSED (`CLOSED_GROUPS`) recebem check no lugar do dot.
  Mapa legado→grupo segue D-004.
- **Valor de custom field como `string | null`** (shape de `TaskCustomFieldValue.value`).
  MULTISELECT serializa em JSON array-string. Tipos reais usados: TEXT, NUMBER, CURRENCY,
  PERCENT, DATE, BOOLEAN, SELECT, MULTISELECT, URL, USER_REF, CLIENT_REF (o briefing citava
  MONEY/DROPDOWN/CHECKBOX — **não existem no schema**; mapeados p/ CURRENCY/SELECT/BOOLEAN).
- **Callbacks async**: pending local + erro repassado via `onError` (fallback `toast(msg,'err')`).
  Nunca engole erro. Toggle de checklist e assignee fazem rollback otimista.
- **DueDateChip** calcula dia no fuso `America/Sao_Paulo` (D-006), coerente com o servidor.
- **Popover próprio** (sem lib) para os 3 seletores — evita dependência nova (regra #9).

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)

- Sem fiação a dados/actions reais — é Fase 4 (A4). Componentes são 100% controlados por props.
- Menções `@` no CommentThread são só realce visual; extração/autocomplete de usuários é A2/A4.
- Watchers, dependências (badge "bloqueada por"), anexos: fora do briefing desta fase.
- `assigneeId` por item de checklist (ClickUp permite): não exposto no MVP visual.
- CustomFieldInput não valida `required` (só marca com `*`) — validação é do servidor (A2).

## 4. COMO VALIDAR

1. `npx tsc --noEmit` — zero erro em `src/components/tasks/**` e `dev/components/**`
   (os 20 erros restantes são de `src/lib/tasks/recurrence.ts`, WIP do A2, fora do meu escopo).
2. Logado como ADMIN, acessar `/dev/components`. Como não-ADMIN, deve redirecionar para `/`.
3. Conferir cada seção: interativos abrem dropdown/popover; "erro" dispara toast vermelho;
   "pending" mostra spinner; vazios mostram texto pt-BR; TaskRow/TaskCard atrasados com borda vermelha.

## 5. RISCOS ATIVOS

- `color-mix` exige navegador moderno (ok p/ uso interno Arkza). Se precisar suportar antigo, trocar por rgba.
- Enum `TaskStatus`/`TaskPriority` legado: quando a convergência D-004 avançar, `LEGACY_STATUS`
  em `tokens.ts` pode ser aposentado — hoje é o mapa fonte de labels/cores do enum.

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (A4-VIEWS)

- Ler: `src/components/tasks/index.ts` (superfície pública), `types.ts` (`TaskVM`), este handoff.
- Montar `TaskVM` na camada de leitura; componentes não consultam dados.
- Contrato de callbacks async: devem **rejeitar/lançar** em erro (o componente cuida de pending/rollback/toast).
- Deep-link/painel: `onOpen(taskId)` do TaskRow/TaskCard deve navegar p/ `/t/[taskId]` (D-009).
- `dragHandleProps` do TaskCard recebe os props do handle do @hello-pangea/dnd (D-002).
- Não alterar props públicas sem registrar em DECISIONS.md (BLOCO 6).

---

## CATÁLOGO DE PROPS (contrato para o A4)

### StatusValue (união discriminada)
`{ kind:'custom', status:{ id?, name, color, group } } | { kind:'legacy', status: TaskStatus }`

### StatusBadge
`{ value: StatusValue; size?:'sm'|'md'; className? }` +
interativo: `{ interactive:true; options: StatusValue[]; onChange(next):Promise; onError?; disabled? }`

### PriorityFlag
`{ priority: TaskPriority|null; showLabel?; size?; className? }` +
interativo: `{ interactive:true; onChange(next|null):Promise; allowClear?; onError?; disabled? }`

### AssigneeAvatars
`{ assignees: AssigneeUser[]; max?=3; size?=24; className? }` +
interativo: `{ interactive:true; options: AssigneeUser[]; onToggle(userId,willAssign):Promise; onError?; disabled? }`
`AssigneeUser = { id; name; avatarUrl? }`

### DueDateChip
`{ dueDate: Date|string|null; recurring?; size?; className? }`

### TagChip
`{ label; color?; size?; onRemove?; className? }`

### TaskRow
`{ task: TaskVM; selected?; onSelectChange?(checked); onOpen?(taskId); className? }`

### TaskCard
`{ task: TaskVM; onOpen?(taskId); dragHandleProps?: HTMLAttributes; className? }`

### ChecklistBlock
`{ items: ChecklistItemVM[]; onToggle(itemId,done):Promise; onAdd?(name):Promise; title?; onError?; className? }`
`ChecklistItemVM = { id; name; done }`

### CommentThread
`{ comments: CommentVM[]; onSubmit?(body):Promise; currentUser?; onError?; className? }`
`CommentVM = { id; author:{id,name}; body; createdAt }`

### ActivityFeed
`{ activities: ActivityVM[]; className? }`
`ActivityVM = { id; action; actorName?; fromValue?; toValue?; createdAt }`
actions reconhecidas: created · status_changed · field_changed · priority_changed · escalated · recurred · commented (+ fallback).

### CustomFieldInput
`{ def: CustomFieldDef; value: string|null; onChange(next):Promise; onError?; className? }`
`CustomFieldDef = { id; key; label; type: CustomFieldType; options?: string[]; required? }`

### InlineEdit
`{ value; onSave(next):Promise; placeholder?; as?:'text'|'heading'; inputClassName?; displayClassName?; onError?; ariaLabel? }`

### ConfirmDialog
`{ open; title; body?; confirmLabel?; cancelLabel?; destructive?; onConfirm():Promise|void; onClose(); onError? }`

### TaskVM (types.ts)
`{ id; title; status: StatusValue; priority: TaskPriority|null; assignees: AssigneeUser[]; tags: TaskTagVM[]; dueDate: Date|string|null; recurring?; overdue?; clientName?; checklist?:{done,total}; commentCount? }`
