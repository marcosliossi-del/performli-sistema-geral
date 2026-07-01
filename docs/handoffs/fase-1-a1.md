# HANDOFF — Fase 1 · A1-ARQUITETO-DADOS

## 1. O QUE FOI FEITO

- `docs/schema-diff.md` — tabela alvo × existe? × diferença × ação + mapeamento
  conceitual dos models existentes reaproveitados (TaskAuxAssignee=TaskAssignee,
  TaskSavedView=ViewPreference, TaskAutomationRule=Automation, TaskActivity=Activity,
  Alert=Notification base, TaskArea=Space, TaskList=List).
- `prisma/migrations/20260702000000_tasks_clickup_class/migration.sql` — migração
  única, aditiva e idempotente:
  - enums `WorkspaceRole`, `StatusGroup`;
  - tabelas novas `Workspace`, `WorkspaceMember`, `StatusSet`, `Status` (todas com FK);
  - colunas aditivas `Task.statusId`, `Task.orderIndex`, `TaskList.statusSetId` (+ FKs);
  - 6 índices quentes em `Task`;
  - backfill: `ws_arkza`, membros a partir de `User`, `sset_arkza`, 11 `Status`
    (ids fixos), `Task.statusId` (enum→FK), `TaskList.statusSetId`.
- `prisma/schema.prisma` — models Workspace/WorkspaceMember/StatusSet/Status,
  enums, back-relation `User.workspaceMemberships`, campos `Task.statusId/statusRef/
  orderIndex`, `TaskList.statusSetId/statusSet`, 6 `@@index` novos em Task.

## 2. DECISÕES TOMADAS

- **Reaproveitar TaskAuxAssignee como M:N oficial** (D-005) em vez de criar `TaskAssignee`.
  Shape `@@unique([taskId,userId])` já serve. Descartado criar 2ª tabela (violaria regra
  crítica do CLAUDE.md e D-005).
- **Adiar Space/Folder/Tag/Notification/colunas-espelho/agrupador Checklist** para fase 2.
  Justificativa por linha no schema-diff §1. Contexto: Client cumpre papel de List de
  cliente; zero superfície usa cor de tag; sino in-app só entra na Fase 5.
- **`Task.statusRef`** como nome da relação (não `status`) para não colidir com o campo
  enum `status` mantido como espelho (D-004).
- **`orderIndex` sem backfill** (D-003): NULL é válido; leitura cai para `dueDate`; o motor
  fractional preenche on-write na Fase 2.
- **`ATRASADO`/`BLOQUEADO` mapeados como Status no grupo ACTIVE** por compatibilidade com
  markOverdueTasks/guards. Transformá-los em derivados (dueDate/dependência) é refino
  pós-MVP (risco #1 do audit).
- **Sem workspaceId em Task/Client/TaskList** (D-007): só tabelas novas ganham tenancy agora.

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)

- Seed novo de 8 clientes/60 tasks (BLOCO 4 §A1.3): **não criado como seed destrutivo**.
  O repo roda seeds reais em produção; o gate aqui é build Vercel, não `migrate dev` em
  banco fake. O seed do gate = seeds existentes + backfills da migration.
- Deprecação do enum `TaskStatus`, `assignedTo` obrigatório, `TaskActivity`→JSON,
  entidade Tag, Notification por usuário, colunas espelho de custom field: **adiados**
  (2ª etapa D-004 / fase 2). Nada disso bloqueia a Fase 2.
- `EXPLAIN` das queries quentes: **não executável** (sem banco local no ambiente). Índices
  criados por inspeção conforme audit §6; validação real fica no Vercel/produção.

## 4. COMO VALIDAR (gate adaptado)

- **Idempotência por inspeção:** todo `CREATE TYPE` em `DO $$ ... EXCEPTION WHEN
  duplicate_object`; todo `CREATE TABLE/INDEX IF NOT EXISTS`; toda FK em bloco
  `DO $$ ... EXCEPTION WHEN duplicate_object`; todo INSERT com `ON CONFLICT DO NOTHING`;
  todo UPDATE com `WHERE ... IS NULL`. Rodar a migração 2× = mesmo estado.
- **Build Vercel verde:** `prisma generate && prisma migrate deploy && next build`.
  O schema.prisma reflete exatamente a migração (nomes de índice Prisma-default batem
  com os nomes explícitos do SQL).
- **Conferência de convergência:** após deploy, `SELECT count(*) FROM "Status"` = 11;
  `SELECT count(*) FROM "Task" WHERE "statusId" IS NULL` = 0; `WorkspaceMember` = nº de Users.

## 5. RISCOS ATIVOS

- **Convivência enum↔statusId** (D-004): toda mutação de status na Fase 2 DEVE escrever
  `status` (enum) E `statusId`, senão o espelho diverge. Onde olhar: `app/actions/tasks.ts`
  `updateTaskStatus`, `suporte.ts moveStage`, `warRoom.ts`, `task-escalation.ts` (markOverdue).
- **Statuses fora do set default:** se a Fase 2 permitir StatusSets customizados por List,
  o mapeamento enum→Status precisa considerar o statusSet da List, não só `sset_arkza`.
- **`assignedTo` continua obrigatório e NOT NULL** — nenhuma criação de task pode omiti-lo
  (primeiro assignee = espelho, D-005).
- **idempotencyKey** (audit risco #3): qualquer novo caminho de criação de task (duplicate,
  recur-on-complete) preserva o formato das chaves existentes.

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (A2-BACKEND-CORE)

- **Ler:** `docs/schema-diff.md`, este handoff, DECISIONS.md D-004/D-005/D-007.
- **Contrato de status:** ao mover status, gravar `status` (enum) + `statusId` na MESMA
  transação. Helper sugerido: mapa enum→statusId (ids fixos `st_*`) e inverso.
- **Assignees:** ler via `TaskAuxAssignee` (M:N) OR `assignedTo`; escrever sempre
  `assignedTo` = primeiro assignee + upsert em `TaskAuxAssignee`.
- **orderIndex:** usar lib `fractional-indexing` (D-003); em task sem orderIndex, ordenar
  por `dueDate` como fallback; preencher on-write.
- **Tenancy:** `assertCan` já pode checar `WorkspaceMember` (workspace `ws_arkza`); FK em
  Task/Client ainda não existe — isolamento operacional continua por Client/ClientAssignment.
- **Não** dropar/renomear nada; não tornar `assignedTo` nullable; não remover o enum
  `TaskStatus` — tudo isso é 2ª etapa, fora do MVP.
</content>
