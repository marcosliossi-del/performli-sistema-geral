# HANDOFF — Fase 4b · A2-BACKEND-CORE · micro-fatia 4b-actions

> Fecha as 4 lacunas de actions registradas em `docs/handoffs/fase-4a-a4.md §6`.
> Só camada de actions (server). Nenhum componente/página tocado. Sem migration
> (todos os models já existem: `TaskChecklistItem`, `TaskDependency`,
> `TaskComment`, `TaskActivity`; enum `TaskPriority`).

## 1. O QUE FOI ENTREGUE

### `src/app/actions/operacional.ts`
- **`addChecklistItem(taskId, label)`** — cria `TaskChecklistItem` (label com
  `trim`, `required: false`, `order = max(order)+1` via `aggregate _max`) +
  `TaskActivity 'checklist_item_added'`. Mesmo guard de posse do
  `toggleChecklistItem` (`assertClientMutationAccess {allowCS:true}` quando há
  cliente). Retorna `{ ok, id }` | `{ error }`.
- **`removeChecklistItem(itemId)`** — só remove item **opcional E não concluído**.
  Item obrigatório → erro operacional ("Este item é obrigatório e não pode ser
  removido…"); item concluído → erro ("…já foi concluído e não pode ser
  removido…"). Não some silenciosamente. `delete` + `TaskActivity
  'checklist_item_removed'` em transação. Retorna `{ ok }` | `{ error }`.
- **`addTaskComment(taskId, body)`** — agora retorna o registro criado:
  `{ ok, comment: { id, body, authorId, authorName, createdAt } }` | `{ error }`.
  `authorName` vem de `session.name` (autor = usuário atual); `createdAt` em
  **ISO string** (compatível com `PanelComment.createdAt`). Novo tipo exportado
  `AddTaskCommentResult`. Guard de posse e `TaskActivity 'commented'` intactos.

### `src/app/actions/tasks.ts`
- **`removeTaskDependency(blockingId, waitingId)`** — desfaz a aresta (blockingId
  BLOQUEIA waitingId → `dependentId=waitingId`). Mesma authz do
  `addTaskDependency`: `assertCan('task.write')` nos DOIS lados. Erro se a
  dependência não existe. `delete` + `TaskActivity 'dependency_removed'`
  (`fromValue = blocking.title`) + `writeAuditLog`. Retorna `{ ok }` | `{ error }`.
- **`updateTaskFields` aceita `priority: null`** — a coluna `Task.priority` é
  **NOT NULL** (`@default(MEDIA)`), então `null` é interpretado como `'MEDIA'`
  ("sem prioridade" não existe no enum; a UI mostra MEDIA como "Normal"). Zod
  passou a `z.nativeEnum(TaskPriority).nullable().optional()`. Documentado no
  jsdoc/comentários.

## 2. ASSINATURAS NOVAS / ALTERADAS
```ts
// operacional.ts
export type AddTaskCommentResult =
  | { ok: true; comment: { id: string; body: string; authorId: string; authorName: string; createdAt: string } }
  | { error: string }

export async function addChecklistItem(taskId: string, label: string): Promise<ActionResult>      // { ok, id? } | { error }
export async function removeChecklistItem(itemId: string): Promise<ActionResult>                   // { ok } | { error }
export async function addTaskComment(taskId: string, body: string): Promise<AddTaskCommentResult>  // ALTERADA (era ActionResult)

// tasks.ts
export async function removeTaskDependency(blockingId: string, waitingId: string): Promise<ActionResult>  // { ok } | { error }
// updateTaskFields: zod priority agora .nullable().optional(); null → 'MEDIA'
```

## 3. IMPACTO NOS CALL-SITES (grep completo de `addTaskComment`)
- `src/components/operacional/TaskDrawer.tsx:69` — `await addTaskComment(...)`
  **ignora o retorno** (só faz `reload()` depois). Novo shape NÃO quebra. Não
  editado (fora do escopo / é component).
- `src/components/tasks/TaskPanel.tsx:333` — checa `'error' in res` e lança;
  continua funcionando. **RELATO (não editei — outra fatia):** o retorno novo já
  expõe `res.comment` (`{id, body, authorId, authorName, createdAt}` em ISO
  string) para substituir o comentário otimista de id temporário (`tmp-…`) por
  um `PanelComment` real — basta mapear `authorId/authorName` → `author: {id,
  name}`. Nenhum outro call-site consome o retorno antigo.

## 4. CHECKLIST DE AUTORIZAÇÃO (por endpoint)
```json
[
  { "rota":"action:addChecklistItem",     "metodo":"server-action", "papeis_permitidos":["ADMIN","CS","MANAGER (cliente atribuído)","qualquer autenticado (task interna)"], "validacao_posse":true, "log":true },
  { "rota":"action:removeChecklistItem",  "metodo":"server-action", "papeis_permitidos":["ADMIN","CS","MANAGER (cliente atribuído)","qualquer autenticado (task interna)"], "validacao_posse":true, "log":true },
  { "rota":"action:removeTaskDependency", "metodo":"server-action", "papeis_permitidos":["ADMIN","CS","MANAGER (ambos os lados atribuídos)"], "validacao_posse":true, "log":true },
  { "rota":"action:addTaskComment",       "metodo":"server-action", "papeis_permitidos":["ADMIN","CS","MANAGER (cliente atribuído)","qualquer autenticado (task interna)"], "validacao_posse":true, "log":true },
  { "rota":"action:updateTaskFields",     "metodo":"server-action", "papeis_permitidos":["ADMIN","CS","MANAGER (cliente atribuído)"], "validacao_posse":true, "log":true }
]
```
> Nota `log`: checklist/comentário registram `TaskActivity` (mesmo padrão do
> `toggleChecklistItem`/`addTaskComment` legados, sem `AuditLog` extra);
> `removeTaskDependency` registra `TaskActivity` **+** `AuditLog` (mesmo padrão
> do `addTaskDependency`); `updateTaskFields` loga via `mutateTask`.

## 5. COMO VALIDAR (quando o ambiente tiver deps)
1. `npx tsc --noEmit` — sem `node_modules`/prisma gerado aqui; erros esperados
   são só "Cannot find module". Resolve no Vercel (install + `prisma generate`).
2. Checklist: `addChecklistItem` cria item no fim da lista (order incremental);
   `removeChecklistItem` recusa item obrigatório e item concluído com mensagem
   operacional, remove item opcional/aberto.
3. Dependência: `removeTaskDependency` de uma aresta inexistente → erro; de uma
   existente → some das listas, gera activity `dependency_removed` + AuditLog.
4. Prioridade: `updateTaskFields(id, { priority: null })` grava `MEDIA` (não
   lança); activity registra "prioridade: … → MEDIA" só se houve mudança.
5. Comentário: retorno traz `comment.id` real; a UI (4a/TaskPanel) pode trocar o
   `tmp-…` pelo id definitivo.

## 6. NADA PENDENTE DESTA FATIA
As 4 lacunas de `fase-4a-a4.md §6` estão fechadas. Entregar ao `guardiao`.
