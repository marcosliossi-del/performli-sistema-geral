# PERFORMLI — SISTEMA DE GESTÃO DE TAREFAS CLICKUP-CLASS
## Prompt Mestre Multi-Agente para Claude Code (Fable Ultra Code)

> **Versão:** 1.0 · **Projeto:** Performli (Arkza OS) · **Objetivo:** Recriar dentro do Performli a ideologia completa de gestão de tarefas do ClickUp, adaptada à operação da Arkza, com arquitetura própria, sem dependência externa.
>
> **Como usar este documento:** cole este arquivo na raiz do repositório como `PROMPT_MESTRE_TASKS.md`. Inicie a sessão do Claude Code com a instrução: *"Leia PROMPT_MESTRE_TASKS.md integralmente. Assuma o papel de A0-ORQUESTRADOR e execute o BLOCO 5 (Ordem de Execução), delegando aos agentes do BLOCO 4 conforme os gates de cada fase."*

---

# BLOCO 0 — REGRAS DE OURO (LEITURA OBRIGATÓRIA ANTES DE QUALQUER CÓDIGO)

**Objetivo:** garantir que nenhum agente escreva código sem alinhamento com o estado real do repositório.

1. **Auditar antes de criar.** O Performli já possui schema Prisma, sistema de tasks funcional e design system dark cyan-teal. Nenhum agente cria tabela, componente ou rota sem antes rodar auditoria do que existe (`prisma/schema.prisma`, `app/`, `components/`, `lib/`). Reaproveitar > reescrever.
2. **Migrations sempre aditivas e reversíveis.** Nunca dropar coluna/tabela com dados. Renomeações acontecem em duas migrations (adicionar nova → migrar dados → deprecar antiga).
3. **Uma fase por vez, com gate de validação.** Nenhuma fase inicia sem o gate da anterior aprovado (BLOCO 5). O A0-ORQUESTRADOR é o único que autoriza avanço de fase.
4. **Tipagem estrita ponta a ponta.** TypeScript `strict: true`, zero `any` não justificado, tipos derivados do Prisma (`Prisma.TaskGetPayload`), validação de entrada com Zod em toda server action.
5. **Optimistic UI é lei.** Toda mutação de tarefa (status, prioridade, assignee, drag-and-drop) atualiza a interface instantaneamente e reconcilia com o servidor depois. A percepção de velocidade é o que fez o ClickUp perder usuários — o Performli vence exatamente aqui.
6. **Multi-tenant desde o dia zero.** Toda query filtra por `workspaceId`. Nenhuma rota confia em ID vindo do cliente sem verificar pertencimento ao workspace do usuário autenticado.
7. **Audit trail em tudo.** Toda mutação relevante gera registro em `Activity`. Sem exceção. É a base do feed de atividade, das automações e da confiança operacional.
8. **Handoff documentado.** Todo agente encerra sua fase produzindo um handoff no formato do BLOCO 6 (compatível com o framework FABLE5 da Arkza). Sem handoff, a fase não conta como concluída.
9. **Sem dependência desnecessária.** Antes de instalar pacote, justificar por escrito no handoff. Preferências: `@dnd-kit` para drag-and-drop, `@tanstack/react-query` ou server actions puras + `useOptimistic`, `date-fns` para datas, `zod` para validação.
10. **Português nos textos de UI, inglês no código.** Nomes de variáveis, tabelas e funções em inglês; labels, toasts e mensagens visíveis em PT-BR.

---

# BLOCO 1 — CONTEXTO E MISSÃO

## 1.1 Contexto de negócio

- **Empresa:** Arkza, agência de tráfego pago (Meta Ads / Google Ads) com ~30 clientes ativos de e-commerce de moda.
- **Problema:** o ClickUp é hoje o hub operacional (CRM, tasks de clientes, POPs, automações de health tracking), mas gera custo, limite de customização, lentidão e dependência de plataforma externa.
- **Missão do Performli:** tornar-se o sistema operacional interno da Arkza. Este projeto entrega o módulo central: **gestão de tarefas com a mesma ideologia do ClickUp**, porém mais rápido, mais simples de operar e desenhado para o fluxo real da agência (clientes → entregas semanais → responsáveis → status → automações).
- **Usuários:** ~6-10 pessoas internas (Head, Supervisor, Gestor de Tráfego, Automação/CRM, CS, Monitoramento). Não é SaaS público neste momento — mas a arquitetura multi-tenant fica pronta para virar produto no futuro.

## 1.2 Stack técnica (imutável neste projeto)

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind, design system dark cyan-teal existente |
| ORM | Prisma 7 |
| Banco | PostgreSQL |
| Jobs | Vercel Cron (já usado para automações) |
| Deploy | Vercel |

## 1.3 Definição de sucesso do projeto

1. Um gestor consegue, sem treinamento, criar lista de cliente, popular tarefas recorrentes semanais, atribuir responsáveis, mover status via kanban e ver o que está atrasado — em menos de 2 minutos.
2. Paridade conceitual com ClickUp nos pilares: hierarquia, status customizados, prioridades, múltiplos responsáveis, datas, subtarefas, checklists, comentários, tags, custom fields, visualizações (lista + kanban no MVP), recorrência e feed de atividade.
3. Latência percebida de mutação < 100ms (optimistic UI) e carregamento de lista com 500 tarefas < 1,5s.
4. Zero perda de dados em migrations; auditoria completa de mudanças.

---

# BLOCO 2 — ANATOMIA DO CLICKUP (O MODELO MENTAL A REPLICAR)

**Objetivo deste bloco:** todos os agentes devem internalizar como o ClickUp pensa gestão de tarefas antes de projetar qualquer coisa. Este é o "domain model" do projeto.

## 2.1 Hierarquia estrutural

```
Workspace (empresa)
└── Space (área: Operação, Comercial, CS, Interno)
    └── Folder (agrupador opcional: ex. "Clientes Ativos")
        └── List (unidade de trabalho: ex. "Cliente Bambola")
            └── Task (tarefa)
                └── Subtask (tarefa filha, recursiva)
                    └── Checklist (itens simples, sem status próprio)
```

**Regras ideológicas do ClickUp que o Performli deve preservar:**

- **A List é o coração.** Toda task pertence a exatamente uma "home list". É na List que vivem os status, a ordenação padrão e o contexto de trabalho. No caso da Arkza: 1 List = 1 cliente (ou 1 processo interno).
- **Folder é opcional.** Lists podem viver direto no Space. O sistema não pode obrigar Folder.
- **Task em múltiplas listas (fase 2).** O ClickUp permite adicionar uma task a listas adicionais sem mudar a home list. Modelar isso desde o schema (tabela de junção), mesmo que a UI venha depois.
- **Subtarefas são tasks completas.** Têm status, assignee, datas, prioridade e podem ter suas próprias subtarefas (profundidade prática: limitar a 3 níveis no Performli para não degradar UX).
- **Checklist ≠ subtask.** Checklist é lista de itens marcáveis dentro da task, sem status, sem assignee obrigatório (ClickUp permite assignee por item — replicar como opcional). Serve para POPs: o passo a passo do POP vira template de checklist.

## 2.2 Anatomia completa de uma Task

Campos nativos que o Performli deve suportar:

| Campo | Comportamento ClickUp | Decisão Performli |
|---|---|---|
| Nome | Texto livre, editável inline | Igual, edição inline em todas as views |
| Descrição | Rich text | MVP: markdown com preview; fase 2: editor rich text |
| Status | Um por task, definido pelo pipeline da List | Igual (ver 2.3) |
| Prioridade | Urgent / High / Normal / Low / none | Igual, com cores fixas (ver 2.4) |
| Responsáveis | Múltiplos assignees | Igual (M:N) |
| Watchers | Seguem sem serem responsáveis | Igual (M:N separado) |
| Datas | Start date + Due date, com hora opcional | Igual; overdue calculado no cliente e no servidor |
| Estimativa de tempo | Time estimate | Fase 2 |
| Time tracking | Timer + entradas manuais | Fase 2 (schema pronto desde já) |
| Tags | Livres, por Space, com cor | MVP |
| Custom fields | Tipados por List/Space | MVP com tipos: text, number, dropdown, date, checkbox, url, money (ver 2.6) |
| Dependências | Waiting on / Blocking | MVP no schema; UI simples (badge "bloqueada por X") |
| Relacionamentos | Link livre entre tasks | Fase 2 |
| Anexos | Upload de arquivos | Fase 2 (schema pronto) |
| Comentários | Thread + menções + assigned comments | MVP: comentários + menções; assigned comments fase 2 |
| Recorrência | Regras ao concluir ou por agenda | MVP (já existe base com Vercel Cron — auditar e integrar) |
| Cover/ordem | Ordenação manual persistente | MVP com fractional ordering (ver 3.2) |

## 2.3 Status — a peça mais importante da ideologia ClickUp

O ClickUp trata status como **pipeline customizável por List** (herdável de Space/Folder). Isso é o que diferencia de um todo-app comum e é inegociável no Performli.

**Modelo a implementar:**

- Cada status tem: `name`, `color`, `orderIndex` e **`group`** (categoria semântica). Grupos fixos: `NOT_STARTED`, `ACTIVE`, `DONE`, `CLOSED`.
- O grupo é o que dá semântica ao sistema: relatórios de "concluídas" somam grupos `DONE + CLOSED`; automações do tipo "quando concluir" disparam ao entrar em `DONE`; recorrência regenera task ao entrar em `DONE/CLOSED`.
- **StatusSet (template de pipeline):** conjunto nomeado de status reutilizável. Ex. Arkza: `Backlog → A Fazer → Em Execução → Em Revisão → Aguardando Cliente → Concluído`. Uma List usa um StatusSet; editar o set propaga para todas as listas que o usam (com migração segura de tasks em status removidos → exigir status de destino).
- Mover status = drag no kanban, dropdown na lista, ou atalho de teclado. Sempre gera `Activity`.
- **Regra de proteção:** não permitir deletar status com tasks nele sem escolher destino. Não permitir List sem pelo menos 1 status em `NOT_STARTED` e 1 em `DONE`.

## 2.4 Prioridades

Enum fixo (não customizável — decisão ClickUp correta, manter):

| Prioridade | Cor | Semântica Arkza |
|---|---|---|
| URGENT | vermelho `#ef4444` | Cliente em risco / incidente |
| HIGH | amarelo `#f59e0b` | Entrega da semana |
| NORMAL | azul `#3b82f6` | Rotina |
| LOW | cinza `#6b7280` | Backlog |
| (none) | — | Sem flag |

Prioridade é filtrável, ordenável e visível como bandeira em toda view.

## 2.5 Responsáveis, watchers e menções

- **Assignees (M:N):** avatares empilhados no card; filtro "Minhas tarefas" é a view mais usada do sistema — precisa ser instantânea.
- **Watchers (M:N):** recebem notificações de atividade sem aparecer como responsáveis. Autowatch: criador da task e quem comenta viram watchers automaticamente (comportamento ClickUp).
- **Menções (@):** em comentários e descrição. Mencionar adiciona como watcher e gera notificação.

## 2.6 Custom Fields

Ideologia ClickUp: campos definidos no nível da List (ou Space), valores no nível da Task.

**Arquitetura obrigatória (duas tabelas):**
- `CustomFieldDefinition` — pertence a List/Space: `name`, `type`, `options` (JSON para dropdown), `orderIndex`, `required`.
- `CustomFieldValue` — pertence à Task + Definition: valor tipado serializado em JSON + colunas espelho (`valueText`, `valueNumber`, `valueDate`) para permitir filtro/ordenacão via SQL sem parse de JSON.

**Tipos MVP:** `TEXT`, `NUMBER`, `MONEY`, `DATE`, `DROPDOWN`, `CHECKBOX`, `URL`. **Fase 2:** `LABELS` (multi-select), `PEOPLE`, `RATING`, `FORMULA`, `RELATIONSHIP`.

**Caso de uso Arkza imediato:** List de cliente com fields "Verba mensal (MONEY)", "Plataformas (DROPDOWN)", "Dia de reunião (DROPDOWN)", "Link do dashboard (URL)".

## 2.7 Dependências e relacionamentos

- `TaskDependency`: `blockingTaskId` → `waitingTaskId`, com `type` (`BLOCKS`, `WAITING_ON` — direções da mesma aresta; `LINKED` para relação livre).
- Regra: detectar ciclos na criação (A bloqueia B que bloqueia A = rejeitar).
- UI MVP: badge "🔒 Bloqueada por [task]" no card + aviso ao tentar concluir task que bloqueia outras (informativo, não impeditivo).

## 2.8 Comentários, atividade e notificações

- **Comment:** autor, corpo (markdown), menções extraídas, timestamps, edição com flag `editedAt`, soft delete.
- **Activity (audit log):** tabela append-only: `taskId`, `actorId`, `type` (enum: CREATED, STATUS_CHANGED, ASSIGNEE_ADDED, PRIORITY_CHANGED, DUE_DATE_CHANGED, COMMENTED, etc.), `before`/`after` (JSON). Alimenta o feed lateral da task ("timeline") e futuras automações.
- **Notification:** destinatário, origem (Activity), lida/não lida. MVP: sino in-app com contador. Fase 2: digest por e-mail/WhatsApp via Z-API.

## 2.9 Visualizações (Views)

Ideologia ClickUp: **os dados são um só; as views são lentes.** Toda view compartilha o mesmo motor de filtro/ordenação/agrupamento.

| View | MVP? | Notas |
|---|---|---|
| **Lista** | ✅ | Agrupada por status (padrão), colunas configuráveis, edição inline, colapso de grupos |
| **Board (Kanban)** | ✅ | Colunas = status; drag-and-drop entre colunas e reordenação dentro da coluna; WIP count por coluna |
| **Calendário** | Fase 2 | Tasks por due date, drag para reagendar |
| **Tabela** | Fase 2 | Estilo planilha, bulk edit |
| **Gantt/Timeline** | Fase 3 | Dependências visuais |
| **Minhas Tarefas (Home)** | ✅ | Cross-list: tudo do usuário logado, agrupado por Hoje / Atrasadas / Próximas / Sem data |

**Motor de filtros (compartilhado):** status, assignee, prioridade, tags, due date (ranges + "atrasadas"), custom fields. Filtros combináveis com AND. Persistir configuração de view por usuário (`ViewPreference`).

## 2.10 Automações e recorrência

- **Recorrência (MVP):** regra na task (`recurrenceRule`: RRULE simplificada — daily/weekly/monthly + dias da semana). Comportamento ClickUp "recur on complete": ao entrar em status `DONE/CLOSED`, o sistema clona a task (resetando status para o primeiro do pipeline, recalculando datas, mantendo assignees/checklists) — implementar como server action síncrona no evento + varredura diária via Vercel Cron para agendadas por data.
- **Automações (Fase 2, mas modelar agora):** motor gatilho → condição → ação. Tabela `Automation`: `listId`, `trigger` (JSON), `conditions` (JSON), `actions` (JSON), `active`. Casos Arkza: "quando status = Aguardando Cliente por 3 dias → notificar CS"; "quando task criada na lista X → atribuir Pablo".

## 2.11 O que NÃO copiar do ClickUp (anti-features)

Decisões deliberadas de simplificação — documentar para nenhum agente "melhorar" na direção errada:

1. **Sem Goals/Portfolios/Whiteboards/Docs** neste módulo. Docs do Performli é outro módulo.
2. **Sem permissões granulares por task** no MVP. RBAC por workspace + space basta (OWNER, ADMIN, MEMBER, GUEST-cliente futuro).
3. **Sem 15 tipos de view.** Lista + Kanban + Minhas Tarefas resolvem 95% da operação Arkza.
4. **Sem sprint points/agile nativo.** Não é o fluxo da agência.
5. **Sem o excesso de modais aninhados do ClickUp.** Task abre em painel lateral (slide-over) sobre a view, URL própria (`/t/[taskId]`) para deep-link — nunca perder o contexto da lista atrás.

---

# BLOCO 3 — ARQUITETURA TÉCNICA ALVO

**Objetivo:** referência canônica de dados e padrões. O A1-ARQUITETO-DADOS parte daqui, audita o schema existente e produz o diff.

## 3.1 Schema Prisma de referência (esqueleto canônico)

> ⚠️ **Não aplicar cegamente.** O Performli já tem schema. Este esqueleto define o *alvo conceitual*; o agente A1 produz a migration de convergência.

```prisma
// ===== ESTRUTURA =====
model Workspace {
  id        String   @id @default(cuid())
  name      String
  members   WorkspaceMember[]
  spaces    Space[]
  createdAt DateTime @default(now())
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(MEMBER) // OWNER, ADMIN, MEMBER, GUEST
  workspace   Workspace     @relation(fields: [workspaceId], references: [id])
  user        User          @relation(fields: [userId], references: [id])
  @@unique([workspaceId, userId])
}

model Space {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  color       String?
  icon        String?
  orderIndex  String   // fractional ordering
  folders     Folder[]
  lists       List[]   // lists sem folder
  archived    Boolean  @default(false)
}

model Folder {
  id         String  @id @default(cuid())
  spaceId    String
  name       String
  orderIndex String
  lists      List[]
  archived   Boolean @default(false)
}

model List {
  id          String   @id @default(cuid())
  spaceId     String
  folderId    String?  // opcional — ideologia ClickUp
  name        String
  description String?
  orderIndex  String
  statusSetId String
  statusSet   StatusSet @relation(fields: [statusSetId], references: [id])
  tasks       Task[]    @relation("HomeList")
  extraTasks  TaskList[] // tasks em múltiplas listas (fase 2)
  customFields CustomFieldDefinition[]
  archived    Boolean  @default(false)
}

// ===== STATUS =====
model StatusSet {
  id          String   @id @default(cuid())
  workspaceId String
  name        String   // "Pipeline Cliente Arkza"
  statuses    Status[]
  isDefault   Boolean  @default(false)
}

model Status {
  id          String      @id @default(cuid())
  statusSetId String
  name        String
  color       String
  group       StatusGroup // NOT_STARTED, ACTIVE, DONE, CLOSED
  orderIndex  String
  tasks       Task[]
}

enum StatusGroup { NOT_STARTED ACTIVE DONE CLOSED }

// ===== TASK =====
model Task {
  id           String    @id @default(cuid())
  listId       String    // home list
  list         List      @relation("HomeList", fields: [listId], references: [id])
  parentTaskId String?   // subtasks recursivas
  parent       Task?     @relation("Subtasks", fields: [parentTaskId], references: [id])
  subtasks     Task[]    @relation("Subtasks")

  name         String
  description  String?   @db.Text
  statusId     String
  status       Status    @relation(fields: [statusId], references: [id])
  priority     Priority? // URGENT, HIGH, NORMAL, LOW
  startDate    DateTime?
  dueDate      DateTime?
  orderIndex   String    // posição na lista/coluna (fractional)

  assignees    TaskAssignee[]
  watchers     TaskWatcher[]
  tags         TaskTag[]
  checklists   Checklist[]
  comments     Comment[]
  activities   Activity[]
  fieldValues  CustomFieldValue[]
  dependenciesOut TaskDependency[] @relation("Blocking")
  dependenciesIn  TaskDependency[] @relation("Waiting")

  recurrenceRule Json?   // { freq, interval, byWeekday, mode: "onComplete"|"schedule" }
  timeEstimateMin Int?
  completedAt  DateTime?
  archived     Boolean   @default(false)
  createdById  String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([listId, statusId])
  @@index([dueDate])
  @@index([parentTaskId])
}

enum Priority { URGENT HIGH NORMAL LOW }

model TaskAssignee { taskId String; userId String; @@id([taskId, userId]) /* + relations */ }
model TaskWatcher  { taskId String; userId String; @@id([taskId, userId]) /* + relations */ }
model TaskList     { taskId String; listId String; @@id([taskId, listId]) /* multi-list, fase 2 */ }

// ===== TAGS =====
model Tag     { id String @id @default(cuid()); spaceId String; name String; color String; @@unique([spaceId, name]) }
model TaskTag { taskId String; tagId String; @@id([taskId, tagId]) }

// ===== CHECKLIST =====
model Checklist     { id String @id @default(cuid()); taskId String; name String; orderIndex String; items ChecklistItem[] }
model ChecklistItem { id String @id @default(cuid()); checklistId String; name String; done Boolean @default(false); assigneeId String?; orderIndex String }

// ===== CUSTOM FIELDS =====
model CustomFieldDefinition {
  id        String          @id @default(cuid())
  listId    String
  name      String
  type      CustomFieldType // TEXT NUMBER MONEY DATE DROPDOWN CHECKBOX URL
  options   Json?           // dropdown options: [{id, label, color}]
  required  Boolean         @default(false)
  orderIndex String
}

model CustomFieldValue {
  taskId       String
  definitionId String
  value        Json
  valueText    String?   // colunas espelho p/ filtro SQL
  valueNumber  Float?
  valueDate    DateTime?
  @@id([taskId, definitionId])
  @@index([definitionId, valueText])
  @@index([definitionId, valueNumber])
}

// ===== DEPENDÊNCIAS =====
model TaskDependency {
  id             String @id @default(cuid())
  blockingTaskId String
  waitingTaskId  String
  type           String @default("BLOCKS")
  @@unique([blockingTaskId, waitingTaskId])
}

// ===== COLABORAÇÃO =====
model Comment {
  id        String    @id @default(cuid())
  taskId    String
  authorId  String
  body      String    @db.Text
  mentions  Json?     // userIds extraídos
  editedAt  DateTime?
  deletedAt DateTime?
  createdAt DateTime  @default(now())
}

model Activity {
  id       String       @id @default(cuid())
  taskId   String
  actorId  String
  type     ActivityType
  before   Json?
  after    Json?
  createdAt DateTime    @default(now())
  @@index([taskId, createdAt])
}

model Notification {
  id         String   @id @default(cuid())
  userId     String
  activityId String
  readAt     DateTime?
  createdAt  DateTime @default(now())
  @@index([userId, readAt])
}

// ===== VIEWS & AUTOMAÇÕES =====
model ViewPreference { id String @id @default(cuid()); userId String; listId String?; config Json; @@unique([userId, listId]) }
model Automation     { id String @id @default(cuid()); listId String; name String; trigger Json; conditions Json; actions Json; active Boolean @default(true) }
```

## 3.2 Ordenação manual: fractional indexing (decisão travada)

Toda ordenação manual (tasks na lista, cards na coluna, status no pipeline, listas no space) usa **fractional indexing** (strings lexicográficas estilo LexoRank, ex. lib `fractional-indexing`). Motivos: mover 1 item = 1 UPDATE (nunca reindexar a lista inteira), zero conflito em edição concorrente, drag-and-drop trivialmente otimista. Proibido usar `Int position` com reshuffle.

## 3.3 Padrões de API (Server Actions)

- **Organização:** `app/actions/tasks.ts`, `statuses.ts`, `lists.ts`, `comments.ts`... Uma action = uma responsabilidade.
- **Contrato padrão de toda action:**
  1. `auth()` → usuário da sessão;
  2. Zod parse do input;
  3. verificação de tenancy (o recurso pertence ao workspace do usuário?);
  4. mutação em `prisma.$transaction` quando tocar mais de uma tabela;
  5. gravação de `Activity` na mesma transação;
  6. `revalidatePath`/`revalidateTag` cirúrgico;
  7. retorno tipado `{ ok: true, data } | { ok: false, error }` — nunca lançar exceção crua para o cliente.
- **Leitura:** Server Components com queries Prisma otimizadas (`select` explícito, nunca `include` cego). Lista de tarefas carrega payload enxuto; painel da task carrega o payload completo sob demanda.

## 3.4 Estado no cliente

- Mutações com `useOptimistic` (React 19) ou cache do TanStack Query — escolher UM padrão no início (decisão do A0 na Fase 0, baseada no que o repo já usa) e aplicar em 100% do módulo.
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable`. No drop: atualiza UI → calcula novo `orderIndex` fracionário no cliente → dispara action → reconcilia. Em erro: rollback + toast.
- Painel de task (slide-over) com rota interceptada (`@modal`/parallel routes do App Router) para deep-link `/t/[taskId]` sem perder a view.

## 3.5 Permissões (RBAC mínimo viável)

| Papel | Pode |
|---|---|
| OWNER | Tudo + billing/config workspace |
| ADMIN | Gerir spaces, lists, status sets, automações, membros |
| MEMBER | CRUD de tasks, comentar, mover status, editar custom values |
| GUEST (futuro) | Ver lists específicas, comentar (portal do cliente) |

Enforcement no servidor (helper `assertCan(user, action, resource)`), nunca só na UI.


---

# BLOCO 4 — AGENTES ESPECIALIZADOS

**Objetivo:** definir o time de subagentes (`.claude/agents/`) com identidade, escopo, entradas, saídas, critérios de validação e riscos. O A0 delega; nenhum agente sai do próprio escopo.

> **Formato:** cada seção abaixo é também o conteúdo-base do arquivo do agente em `.claude/agents/<id>.md` (Apêndice A traz os frontmatters prontos).

## A0 — ORQUESTRADOR

- **Identidade:** tech lead do projeto. Não escreve código de feature; planeja, delega, valida gates, resolve conflitos entre agentes e mantém o estado do projeto.
- **Entradas:** este documento + estado atual do repositório.
- **Responsabilidades:**
  1. Executar a Fase 0 (auditoria) pessoalmente;
  2. Decidir questões em aberto (ex.: padrão de estado do cliente — 3.4) e registrar em `DECISIONS.md` (ADR curto: contexto → decisão → consequência);
  3. Abrir cada fase com briefing ao agente responsável (objetivo, contexto, arquivos relevantes, critérios do gate);
  4. Fechar cada fase validando o gate (BLOCO 5) e arquivando o handoff em `docs/handoffs/`;
  5. Manter `PROJECT_STATE.md` atualizado: fase atual, pendências, riscos ativos.
- **Critério de qualidade:** nenhuma fase avançada com gate reprovado; zero decisão arquitetural implícita (tudo em DECISIONS.md).
- **Risco a vigiar:** scope creep — agentes "melhorando" além do MVP. Cortar e registrar como backlog.

## A1 — ARQUITETO-DADOS (schema & migrations)

- **Escopo:** `prisma/schema.prisma`, migrations, seeds, índices.
- **Missão:** convergir o schema existente para o alvo do BLOCO 3.1 sem perda de dados.
- **Instruções:**
  1. Ler o schema atual e produzir `docs/schema-diff.md`: tabela alvo × existe? × diferença × ação (criar / alterar / migrar dados / manter);
  2. Gerar migrations em ordem de dependência (StatusSet antes de List.statusSetId, etc.), com script de backfill quando alterar dados existentes (ex.: tasks com status string → FK para Status);
  3. Criar seed de desenvolvimento realista: 1 workspace Arkza, 3 spaces (Operação, Comercial, CS), 8 lists de clientes reais (Bambola, My Muse, Lavinny, New Man, Barbara Issas, Lalluzi, Lazuli, Duplo Sentido), StatusSet padrão Arkza, ~60 tasks variadas com assignees, prioridades, datas (incluindo atrasadas), subtasks, checklists e custom fields;
  4. Índices: validar com `EXPLAIN` as 5 queries mais quentes (tasks por lista+status; minhas tarefas; atrasadas; feed de activity; busca por nome).
- **Validação (gate):** `prisma migrate dev` limpo em banco vazio E em cópia do banco atual; seed roda idempotente; queries quentes sem seq scan em tabelas grandes.
- **Riscos:** migração destrutiva (mitigar: backup + migrations em duas etapas); enum divergente do existente (mitigar: mapear valores no diff antes).

## A2 — BACKEND-CORE (server actions & regras de negócio)

- **Escopo:** `app/actions/*`, `lib/permissions.ts`, `lib/activity.ts`, validadores Zod.
- **Missão:** implementar toda a camada de mutação e leitura seguindo o contrato 3.3.
- **Entregáveis (checklist funcional):**
  - CRUD: Space, Folder, List, Task (com subtasks), Checklist/Items, Tag, Comment;
  - StatusSet/Status: criar, editar, reordenar, deletar-com-destino, aplicar set a uma list com migração de tasks;
  - Task ops atômicas: `moveTaskStatus`, `reorderTask`, `setPriority`, `assignUser`/`unassign`, `setDates`, `toggleWatcher`, `setCustomFieldValue`, `completeTask` (dispara recorrência), `duplicateTask`, `archiveTask`;
  - Dependências com detecção de ciclo (DFS na criação);
  - Motor de recorrência: função pura `computeNextOccurrence(rule, from)` com testes unitários + hook no `completeTask` + rota cron para modo agendado;
  - Menções: parser de `@` em comentários → watchers + notifications;
  - Helper `logActivity` chamado em toda mutação, dentro da transação.
- **Boas práticas:** funções puras para regras (testáveis sem banco); nenhuma action com mais de ~60 linhas — extrair para `lib/`.
- **Validação (gate):** suíte de testes das regras puras verde (recorrência, ciclo de dependência, fractional index, parser de menção); teste de integração dos fluxos críticos (criar task → mover status → concluir → recorrência clona); zero action sem verificação de tenancy (auditar via grep + revisão do A6).
- **Riscos:** condição de corrida em reorder concorrente (fractional index resolve); Activity esquecida (mitigar: wrapper obrigatório `mutateTask()` que exige o log).

## A3 — UI-SYSTEM (design system & componentes de domínio)

- **Escopo:** componentes reutilizáveis do domínio de tasks, aderentes ao design system dark cyan-teal existente.
- **Missão:** construir o vocabulário visual antes das telas.
- **Entregáveis:** `StatusBadge` (cor do status + dropdown de troca), `PriorityFlag`, `AssigneeAvatars` (stack + popover de seleção com busca), `DueDateChip` (estados: futuro/hoje/atrasado com cor), `TagChip`, `TaskRow` (view lista), `TaskCard` (kanban), `ChecklistBlock`, `CommentThread`, `ActivityFeed`, `CustomFieldInput` (switch por tipo), `InlineEdit` (texto editável no clique), `EmptyState`, `ConfirmDialog`.
- **Boas práticas:** todos os componentes controlados por props tipadas do Prisma payload; estados de loading/erro/vazio previstos; acessibilidade mínima (foco visível, aria em menus); nenhuma cor hardcoded fora dos tokens do design system.
- **Validação (gate):** página `/dev/components` (playground interno) renderizando todos os componentes em todos os estados; revisão visual do A0 contra o design system; dark mode perfeito (é o único modo).
- **Riscos:** divergência do design system existente (mitigar: auditar tokens/paleta antes de criar qualquer componente).

## A4 — VIEWS (telas e interações)

- **Escopo:** rotas e páginas: sidebar de navegação (Spaces → Folders → Lists), view Lista, view Kanban, Minhas Tarefas, painel slide-over da task, modal de configuração de List (status set, custom fields).
- **Missão:** montar a experiência com os componentes do A3 e as actions do A2.
- **Instruções críticas:**
  1. **Kanban:** colunas por status do pipeline; drag entre colunas muda status; drag na coluna reordena; contador por coluna; criação rápida no rodapé da coluna;
  2. **Lista:** grupos por status colapsáveis; edição inline de nome, status, prioridade, datas, assignees; criação rápida por grupo; multi-select com bulk actions (mover status, atribuir) — bulk pode ser fase 2 se o gate apertar;
  3. **Minhas Tarefas:** agrupamento Hoje / Atrasadas / Próximos 7 dias / Sem data, cross-list, com nome da list de origem no card;
  4. **Painel da task:** slide-over com URL própria; seções: header editável (nome, status, prioridade, assignees, datas) → descrição → custom fields → checklists → subtasks → dependências → comentários/atividade em abas;
  5. **Motor de filtros:** barra única reutilizada por Lista e Kanban (status, assignee, prioridade, tag, due date), persistindo em `ViewPreference`;
  6. **Optimistic em tudo** (regra de ouro #5).
- **Validação (gate):** fluxo completo sem reload: criar list → criar 5 tasks → arrastar entre colunas → abrir painel → comentar → concluir → ver recorrência regenerar. Lighthouse/percepção: interações < 100ms; lista com 500 tasks do seed navegável sem travar (virtualizar se necessário).
- **Riscos:** slide-over + parallel routes do App Router tem pegadinhas de cache (mitigar: prototipar a rota interceptada primeiro, antes de encher de conteúdo).

## A5 — AUTOMATION (recorrência, cron e motor de automações)

- **Escopo:** Vercel Cron routes, motor de recorrência agendada, fundação do motor de automações, integração com automações já existentes no Performli.
- **Instruções:**
  1. Auditar os crons existentes (já há automação com Vercel Cron no repo) e integrar, não duplicar;
  2. Cron diário: varrer `recurrenceRule` modo agendado + marcar overdue + disparar notificações de vencimento (hoje/atrasada);
  3. Implementar executor de `Automation` (trigger → conditions → actions) com 2 ações iniciais: `notify` e `assign` — suficiente para provar o motor;
  4. Idempotência obrigatória: cron pode rodar duas vezes sem duplicar tasks (chave de dedupe `originTaskId + occurrenceDate`).
- **Validação (gate):** teste simulando 3 execuções do cron no mesmo dia → zero duplicata; recorrência semanal gera task na segunda-feira correta considerando timezone America/Sao_Paulo (armazenar UTC, exibir local — decisão travada).
- **Riscos:** timezone (o clássico) — todos os cálculos de "hoje/atrasada" no servidor usam TZ explícita.

## A6 — SECURITY & PERMISSIONS

- **Escopo:** revisão transversal de tenancy, RBAC, validação de input e superfícies de abuso.
- **Instruções:** revisar 100% das actions do A2 e rotas do A4 contra: (a) IDOR — todo ID validado contra o workspace da sessão; (b) inputs Zod sem `passthrough` perigoso; (c) rate limiting básico em actions de escrita públicas; (d) sanitização do markdown renderizado (comentários/descrição) contra XSS; (e) cron routes protegidas por `CRON_SECRET`.
- **Validação (gate):** relatório `docs/security-review.md` com cada action listada e status ✅/⚠️/❌ + todas as ❌ corrigidas antes do gate da Fase 5.
- **Risco a vigiar:** confiança em `listId`/`workspaceId` vindos do cliente.

## A7 — QA-VALIDATOR

- **Escopo:** testes automatizados + roteiro de QA manual.
- **Instruções:** unit tests das funções puras (A2 entrega junto, A7 audita cobertura); testes de integração dos 8 fluxos críticos (criar/editar/mover/concluir/recorrer/comentar/depender/filtrar); roteiro manual em `docs/qa-checklist.md` executável por qualquer pessoa da Arkza em 15 minutos; teste de carga leve: seed de 2.000 tasks numa list e medir views.
- **Validação (gate):** todos os fluxos críticos verdes; nenhum bug P0/P1 aberto; checklist manual executado por completo pelo menos 1 vez.

## A8 — DOCS & HANDOFF

- **Escopo:** documentação viva do módulo.
- **Entregáveis:** `docs/modulo-tasks/README.md` (mapa do módulo: schema, actions, componentes, rotas), guia de uso interno em PT-BR para o time Arkza (como criar cliente, pipeline, recorrência semanal — com screenshots), `MIGRATION_CLICKUP.md`: plano de importação dos dados do ClickUp (export CSV/API → script de import mapeando list/status/assignee/due date) — **planejar agora, executar quando o módulo estabilizar**.
- **Validação (gate):** uma pessoa que não participou do build consegue criar um cliente completo seguindo só o guia.

---

# BLOCO 5 — ORDEM DE EXECUÇÃO (FASES E GATES)

**Regra:** fase só abre com o gate anterior aprovado pelo A0. Cada fase gera handoff (BLOCO 6).

| Fase | Nome | Agente(s) | Entregável central | Gate de saída |
|---|---|---|---|---|
| **0** | Auditoria & Decisões | A0 | `docs/audit-fase0.md` + `DECISIONS.md` iniciais | Inventário do que existe (schema, tasks atuais, crons, design system) + decisões travadas (estado do cliente, libs) |
| **1** | Fundação de dados | A1 | Schema convergido + migrations + seed | `migrate dev` limpo nos dois cenários; seed completo; índices validados |
| **2** | Núcleo de negócio | A2 | Actions completas + regras puras testadas | Testes verdes; tenancy em 100% das actions; recorrência funcionando via `completeTask` |
| **3** | Vocabulário visual | A3 | Componentes de domínio + playground | Playground aprovado; aderência ao design system |
| **4** | Experiência | A4 | Lista + Kanban + Minhas Tarefas + painel de task + filtros | Fluxo completo sem reload; performance com 500 tasks |
| **5** | Automação & Segurança | A5 + A6 (paralelo) | Cron idempotente + motor de automação v0 + security review | Zero duplicata em cron; zero ❌ no relatório de segurança |
| **6** | Qualidade | A7 | Suíte + QA manual + carga | Fluxos críticos verdes; sem P0/P1 |
| **7** | Documentação & Migração | A8 | Docs + guia + plano de import ClickUp | Teste do "usuário virgem" aprovado |

**Paralelismo permitido:** A3 pode iniciar durante a Fase 2 (depende só do schema da Fase 1). A5/A6 rodam em paralelo na Fase 5. Todo o resto é sequencial.

---

# BLOCO 6 — PROTOCOLO DE COMUNICAÇÃO ENTRE AGENTES (HANDOFF)

Todo agente encerra sua fase gravando `docs/handoffs/fase-<n>-<agente>.md` neste formato (compatível com o framework FABLE5 da Arkza):

```markdown
# HANDOFF — Fase <n> · <Agente>
## 1. O QUE FOI FEITO
Lista objetiva de entregas, com paths dos arquivos criados/alterados.
## 2. DECISÕES TOMADAS
Cada decisão não-óbvia: contexto → escolha → alternativa descartada → por quê.
## 3. O QUE NÃO FOI FEITO (E POR QUÊ)
Cortes de escopo, itens movidos para backlog, dívidas técnicas assumidas.
## 4. COMO VALIDAR
Comandos exatos + passos manuais para o A0 reproduzir o gate.
## 5. RISCOS ATIVOS
O que pode quebrar depois, onde olhar primeiro.
## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE
Arquivos que ele precisa ler, contratos que não pode quebrar, armadilhas conhecidas.
```

**Regras adicionais de comunicação:**
- Conflito entre agentes (ex.: A4 precisa de action que A2 não previu) → A4 não implementa por conta própria; registra em `PROJECT_STATE.md § Pendências` e o A0 arbitra (normalmente devolvendo micro-tarefa ao A2).
- Contratos públicos (assinaturas de actions, props de componentes do A3) só mudam com registro em `DECISIONS.md`.

---

# BLOCO 7 — QUALIDADE, RISCOS E ANTECIPAÇÃO DE PROBLEMAS

## 7.1 Riscos técnicos priorizados

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | Migração quebrar dados de tasks existentes | Média | Crítico | Migrations em 2 etapas, backfill testado em cópia do banco, backup antes de aplicar |
| 2 | Drag-and-drop inconsistente sob concorrência | Média | Alto | Fractional indexing + reconciliação otimista com rollback |
| 3 | Timezone em recorrência/overdue | Alta | Alto | UTC no banco, TZ America/Sao_Paulo explícita em todo cálculo de servidor, testes de borda (domingo→segunda, virada de mês) |
| 4 | Slide-over com parallel routes cacheando errado | Média | Médio | Prototipar rota interceptada isolada na abertura da Fase 4 |
| 5 | Performance com listas grandes | Baixa (30 clientes) | Médio | Payload enxuto, índices, virtualização se lista > ~300 itens |
| 6 | Scope creep (virar clone completo do ClickUp) | Alta | Alto | Anti-features (2.11) + A0 cortando para backlog |
| 7 | Dupla fonte de verdade durante transição ClickUp→Performli | Alta | Alto | Definir data de corte por lista/cliente; enquanto não migra, a lista vive em UM sistema só |

## 7.2 Critérios de qualidade globais (Definition of Done do módulo)

1. Todo fluxo do gate da Fase 4 executável por um membro do time sem instrução;
2. Zero mutação sem `Activity`; zero action sem tenancy; zero `any` sem comentário justificando;
3. Interações otimistas em 100% das mutações de task;
4. Seed + testes + docs permitem que um dev novo suba o módulo local em < 15 minutos;
5. Plano de migração do ClickUp documentado com mapeamento campo a campo.

## 7.3 Oportunidades além do óbvio (backlog estratégico, NÃO implementar agora)

- **Templates de List** ("Cliente Fashion Padrão": pipeline + custom fields + tasks recorrentes pré-criadas) — mata o onboarding de cliente novo em 1 clique;
- **POPs como templates de checklist** versionados — conecta o dossiê de 21 POPs da Arkza direto na execução;
- **Health score por lista** (tasks atrasadas + tempo em "Aguardando Cliente") alimentando o anti-churn do CS — substitui a automação de health do ClickUp;
- **Portal do cliente (GUEST)**: cliente vê status das entregas sem WhatsApp — diferencial comercial da Arkza;
- **Automação → Z-API**: ação `sendWhatsApp` no motor de automações (notificar responsável/cliente);
- **Command palette (⌘K)**: navegação e criação rápida — ROI altíssimo de produtividade;
- **Relatório semanal automático por cliente** cruzando tasks concluídas com o formato de report que a Arkza já usa.

---

# BLOCO 8 — DEFINITION OF DONE GLOBAL & CRITÉRIO DE ACEITE FINAL

O projeto está concluído quando, em produção:

1. ✅ Um cliente real da Arkza (sugestão: começar por 1 piloto, ex. Bambola) opera 100% no Performli por 2 semanas sem voltar ao ClickUp;
2. ✅ O ritmo operacional semanal (War Room, pulses do supervisor, check-ins de CS) roda com base nas views do Performli;
3. ✅ Recorrências semanais regeneram sozinhas por 2 ciclos sem intervenção;
4. ✅ Todos os 8 handoffs arquivados + docs do A8 aprovados no teste do usuário virgem;
5. ✅ Plano de migração dos demais ~29 clientes agendado com data de corte por lote.

---

# APÊNDICE A — FRONTMATTERS DOS SUBAGENTES (`.claude/agents/`)

Criar um arquivo por agente. Modelo (ajustar `tools` conforme necessidade real):

```markdown
---
name: a1-arquiteto-dados
description: Especialista em Prisma/PostgreSQL do módulo de tasks do Performli. Use para qualquer mudança de schema, migration, seed ou índice. NUNCA usar para UI ou actions.
tools: Read, Write, Edit, Bash, Grep, Glob
---
Você é o A1-ARQUITETO-DADOS do projeto Performli Tasks.
Leia PROMPT_MESTRE_TASKS.md, BLOCOS 0, 2, 3 e sua seção no BLOCO 4 antes de qualquer ação.
Regras invioláveis: migrations aditivas e reversíveis; nunca dropar dados; todo trabalho termina com handoff no formato do BLOCO 6.
Seu gate de saída: [copiar da tabela do BLOCO 5].
```

Replicar para: `a0-orquestrador`, `a2-backend-core`, `a3-ui-system`, `a4-views`, `a5-automation`, `a6-security`, `a7-qa`, `a8-docs` — cada um com a respectiva seção do BLOCO 4 embutida no corpo.

---

# APÊNDICE B — CHECKLIST DE ACEITE RÁPIDO (para o A0 imprimir e riscar)

- [ ] Fase 0: auditoria + DECISIONS.md
- [ ] Fase 1: schema convergido, seed com 8 clientes, índices ok
- [ ] Fase 2: actions completas, tenancy 100%, recorrência on-complete
- [ ] Fase 3: playground de componentes aprovado
- [ ] Fase 4: Lista + Kanban + Minhas Tarefas + painel + filtros, tudo otimista
- [ ] Fase 5: cron idempotente + automação v0 + security review sem ❌
- [ ] Fase 6: testes verdes + QA manual + carga 2.000 tasks
- [ ] Fase 7: docs + guia PT-BR + plano de migração ClickUp
- [ ] Aceite final: piloto de 1 cliente rodando 2 semanas

---

*Fim do prompt mestre. Início da execução: A0-ORQUESTRADOR, Fase 0.*
