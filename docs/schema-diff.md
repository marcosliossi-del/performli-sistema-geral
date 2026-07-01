# SCHEMA-DIFF — Fase 1 (A1-ARQUITETO-DADOS)

> Convergência do schema existente para o alvo do BLOCO 3.1 do PROMPT_MESTRE_TASKS.md.
> Partida: seção 1 do `docs/audit-fase0.md`. Decisões: `DECISIONS.md` D-001..D-009.
> Regra crítica (CLAUDE.md): nenhum model novo se um existente serve. Tudo aditivo/idempotente.

---

## 1. Tabela alvo × existe? × diferença × ação

| Model alvo (3.1) | Existe? | Diferença vs. alvo | Ação Fase 1 |
|---|---|---|---|
| `Workspace` | ❌ | inexistente (single-tenant) | **CRIAR** tabela + backfill `ws_arkza` |
| `WorkspaceMember` | ❌ | inexistente | **CRIAR** tabela + enum `WorkspaceRole` + backfill de `User` |
| `Space` | ❌ | `TaskArea` cumpre papel de área | **ADIAR fase 2** — `TaskArea` (10 áreas) já é o eixo semântico; Space só quando houver 2º workspace |
| `Folder` | ❌ | inexistente | **ADIAR fase 2** — ideologia ClickUp permite List sem Folder; a Arkza usa Client como contexto |
| `List` | ⚠️ `TaskList` | falta `statusSetId`, `orderIndex`, `folderId`, `spaceId`, `description`, multi-list | **ESTENDER**: add `statusSetId String?` + backfill p/ `sset_arkza`. `folderId`/`spaceId` **ADIADOS** (Client cumpre papel de List de cliente — 1 List = 1 cliente já modelado via `TaskList.clientId`) |
| `StatusSet` | ❌ | enum `TaskStatus` (11 valores) hardcoded | **CRIAR** tabela + backfill `sset_arkza` (isDefault) |
| `Status` | ❌ | idem | **CRIAR** tabela + enum `StatusGroup` + 1 Status por valor do enum (ids fixos) |
| `Task.statusId` (FK) | ❌ | `Task.status` enum (espelho, D-004) | **ESTENDER**: add `statusId String?` NULL + FK + backfill do enum. Enum **CONTINUA** obrigatório (espelho) |
| `Task.orderIndex` (fractional, D-003) | ❌ | nenhuma ordenação manual | **ESTENDER**: add `orderIndex String?` NULL. Sem backfill (cai p/ `dueDate`; motor preenche on-write na Fase 2) |
| `Task.startDate` | ✅ | já existe (`schema:773`) | **MANTER** |
| `Priority` enum | ⚠️ `TaskPriority` | BAIXA/MEDIA/ALTA/CRITICA vs URGENT/HIGH/NORMAL/LOW | **MANTER** (mapeamento 1:1 na leitura; renomear enum quebraria produção — adiar) |
| `TaskAssignee` (M:N, D-005) | ✅ `TaskAuxAssignee` | shape `@@unique([taskId,userId])` serve como M:N oficial | **MANTER** — é a tabela M:N oficial. `assignedTo` = responsável principal (espelho). **NÃO criar 2ª tabela** |
| `TaskWatcher` (M:N) | ✅ | igual ao alvo (`schema:843`) | **MANTER** |
| `TaskList` (junção multi-list) | ❌ | nome ocupado pela List-like | **ADIAR fase 2** — colisão de nome; junção multi-list vem depois com outro nome |
| `Tag` / `TaskTag` | ❌ | `Task.tags String[]` (`schema:801`) | **ADIAR fase 2** — MVP mantém `String[]`. Zero superfície usa cor de tag hoje (só literal 'escalado' em task-escalation.ts); criar entidade agora é custo sem retorno |
| `Checklist` + `ChecklistItem` | ⚠️ `TaskChecklistItem` flat | sem agrupador, sem assignee por item, `order Int` | **MANTER** flat no MVP; agrupador **ADIADO fase 2** |
| `CustomFieldDefinition` / `Value` | ✅ `TaskCustomFieldDefinition` / `Value` | escopo global (não por List); `value String?` sem colunas espelho | **MANTER**; colunas espelho valueText/valueNumber/valueDate **ADIADAS fase 2** (só quando filtro SQL por custom field entrar) |
| `TaskDependency` | ✅ | `@@unique(dependentId,blockingId)`, sem `type` | **MANTER**; `type` + ciclo → A2 (Fase 2) |
| `Comment` | ✅ `TaskComment` | sem `editedAt`/`deletedAt` | **MANTER**; edição/soft-delete → fase 2 |
| `Activity` | ✅ `TaskActivity` | strings (action/fromValue/toValue), não JSON/enum | **MANTER** shape existente; enum/JSON before-after **ADIADO** (A2 usa `TaskActivity` como está) |
| `Notification` | ❌ | `Alert` é por cliente, não por usuário | **ADIAR fase 2/5** — `Alert` ≈ Notification base por cliente; Notification por usuário só quando o sino in-app entrar (Fase 5) |
| `ViewPreference` | ✅ `TaskSavedView` | `ownerId?` + `config Json`, sem `@@unique(userId,listId)` | **MANTER** — `TaskSavedView` ≈ `ViewPreference`. Unique composto → A2/A4 quando persistir view |
| `Automation` | ✅ `TaskAutomationRule` | schema pronto, sem executor | **MANTER** — `TaskAutomationRule` ≈ `Automation`. Executor → A5 (Fase 5) |
| Recorrência | ✅ `TaskRecurrenceRule` | forte, com idempotência + `lastRunAt` | **MANTER** |
| Subtasks | ✅ `Task.parentId` | self-relation "Subtasks" (`schema:808`) | **MANTER** |
| Attachments | ✅ `TaskAttachment` | fase 2 | **MANTER** |
| Índices quentes | ⚠️ | só índices simples; faltam compostos (audit §6) | **CRIAR** compostos (ver §4) |
| `Task.archived` / `timeEstimateMin` | ❌ | inexistentes | **ADIAR fase 2** — `TaskList.active` cobre arquivamento hoje; sem UI que consuma |

---

## 2. Mapeamento conceitual (models existentes = alvo)

| Alvo (3.1) | Model existente que assume o papel | Observação |
|---|---|---|
| `TaskAssignee` | **`TaskAuxAssignee`** | tabela M:N oficial de responsáveis; `Task.assignedTo` = principal (espelho, D-005) |
| `ViewPreference` | **`TaskSavedView`** | `ownerId?` + `config Json` |
| `Automation` | **`TaskAutomationRule`** | motor declarado; executor na Fase 5 |
| `Activity` | **`TaskActivity`** | feed por task (strings, não JSON) |
| `Notification` (base) | **`Alert`** | por cliente; Notification por usuário adiada |
| `Space` | **`TaskArea`** | 10 áreas operacionais |
| `List` | **`TaskList`** | 1 List = 1 cliente via `clientId`; `externalId` = id ClickUp |
| `Checklist`/`ChecklistItem` | **`TaskChecklistItem`** | flat, sem agrupador |
| `CustomFieldDefinition`/`Value` | **`TaskCustomFieldDefinition`/`Value`** | escopo global hoje |

---

## 3. O que a migration Fase 1 cria (só o que falta)

- Enums: `WorkspaceRole {OWNER,ADMIN,MEMBER,GUEST}`, `StatusGroup {NOT_STARTED,ACTIVE,DONE,CLOSED}`.
- Tabelas novas: `Workspace`, `WorkspaceMember`, `StatusSet`, `Status`.
- Colunas aditivas: `Task.statusId String?`, `Task.orderIndex String?`, `TaskList.statusSetId String?`.
- FKs idempotentes: `Task.statusId→Status`, `TaskList.statusSetId→StatusSet`, membros e status sets → workspace.
- Índices compostos (§4).

### Backfill (idempotente, seguro rodar N vezes)

| Alvo | Estratégia | Chave anti-duplicação |
|---|---|---|
| `Workspace 'Arkza'` | INSERT id fixo `ws_arkza` | `ON CONFLICT (id) DO NOTHING` |
| `WorkspaceMember` | `INSERT ... SELECT` de `User`; RBAC `ADMIN`→`ADMIN`, demais→`MEMBER`; id `wm_'||User.id` | `ON CONFLICT (workspaceId,userId) DO NOTHING` |
| `StatusSet 'Pipeline Arkza'` | INSERT id fixo `sset_arkza`, `isDefault=true` | `ON CONFLICT (id) DO NOTHING` |
| `Status` × 11 | INSERT ids fixos (`st_a_fazer`...`st_cancelado`), `orderIndex` fracionário `a0`..`aA` | `ON CONFLICT (id) DO NOTHING` |
| `Task.statusId` | `UPDATE ... SET statusId = CASE status ... WHERE statusId IS NULL` | idempotente por `WHERE statusId IS NULL` |
| `TaskList.statusSetId` | `UPDATE ... SET statusSetId='sset_arkza' WHERE statusSetId IS NULL` | idempotente por `WHERE ... IS NULL` |

### Mapeamento enum → Status (D-004)

| `TaskStatus` | Status id | `group` | `orderIndex` | cor |
|---|---|---|---|---|
| A_FAZER | `st_a_fazer` | NOT_STARTED | a0 | #6b7280 |
| EM_ANDAMENTO | `st_em_andamento` | ACTIVE | a1 | #3b82f6 |
| AGUARDANDO_CLIENTE | `st_aguardando_cliente` | ACTIVE | a2 | #f59e0b |
| AGUARDANDO_GESTOR | `st_aguardando_gestor` | ACTIVE | a3 | #f59e0b |
| AGUARDANDO_CS | `st_aguardando_cs` | ACTIVE | a4 | #f59e0b |
| EM_VALIDACAO | `st_em_validacao` | ACTIVE | a5 | #8b5cf6 |
| AJUSTES_SOLICITADOS | `st_ajustes_solicitados` | ACTIVE | a6 | #f97316 |
| BLOQUEADO | `st_bloqueado` | ACTIVE | a7 | #ef4444 |
| ATRASADO | `st_atrasado` | ACTIVE | a8 | #ef4444 |
| CONCLUIDO | `st_concluido` | DONE | a9 | #22c55e |
| CANCELADO | `st_cancelado` | CLOSED | aA | #6b7280 |

> Nota: `ATRASADO`/`BLOQUEADO` continuam como Status no grupo ACTIVE por compatibilidade (markOverdueTasks e guards os escrevem). No alvo de longo prazo overdue vira derivado de `dueDate` e bloqueio de `TaskDependency` — refino fora do MVP (risco #1 do audit).

---

## 4. Índices criados (lacunas do audit §6)

| Índice | Query quente coberta |
|---|---|
| `Task(assignedTo,status,dueDate)` | Meu Dia (dal.ts:3078), Board operacional |
| `Task(status,dueDate)` | Cockpit / validações (dal.ts:1315,3308) |
| `Task(isSupport,status)` | Hub de Suporte (suporte/page:27) + sidebar count |
| `Task(updatedAt)` | orderBy updatedAt desc do Hub/validações |
| `Task(clientId,status)` | tarefas por cliente (dal.ts:3233) |
| `Task(statusId)` | FK nova (joins com Status) |

---

## 5. Workspace FK gradual (D-007)

Tabelas **novas** (`StatusSet`, `Status`, `WorkspaceMember`) nascem com `workspaceId`.
Tabelas **legadas** (`Task`, `Client`, `TaskList`) **NÃO** ganham `workspaceId` nesta fase —
enforcement gradual; isolamento atual continua por `Client` + `ClientAssignment`.
Virar SaaS = tornar as FKs obrigatórias depois, sem reescrita.

---

## 6. Seed do gate (não há seed novo destrutivo)

O repo já roda seeds reais em produção: `lib/seed-operacao.ts`, `seed-carteiras`, `lib/seed-suporte.ts`.
**O seed do gate da Fase 1 = esses seeds existentes + os backfills desta migration**
(`ws_arkza`, `sset_arkza`, 11 Status, `Task.statusId`, `TaskList.statusSetId`).
Nenhum dado fake é inserido em produção. O seed realista de 8 clientes/60 tasks descrito no
BLOCO 4 §A1.3 fica para ambiente de dev limpo (fora do gate de produção, que é build Vercel).
</content>
</invoke>
