# HANDOFF — Agente 4 (UI & Navegação) → Agente 5 (QA)

Projeto RBAC v2 do Performli. Fatia: **a UI passa a ser gerada pela MESMA matriz
do policy engine (`src/lib/rbac`)** — nunca lista de papéis duplicada. NÃO
commitei/pushei. Zero `any` novo. Não toquei em rotas/actions/DAL (Agente 3).

## Princípio
Toda visibilidade/gating de UI deriva de `can(normalizeRole(role), action, module)`
— a mesma função que o backend usa. A UI só melhora a UX (esconde/desabilita o
que o papel não pode); a barreira real continua no backend.

## 1. Sidebar dinâmica (`src/components/layout/Sidebar.tsx`)
- Removido o `type Role` local e as listas `roles: [...]` por item.
- Cada `NavItemDef` ganhou `module?: Module`. A visibilidade sai de
  `can(role5, 'view', module)`. Grupos herdam dos filhos (aparecem se ≥1 filho
  visível). Item sem módulo = sempre visível.
- Prévia "GESTOR" do ADMIN (viewMode) agora rebaixa para `GESTOR_TRAFEGO` (papel
  canônico), não mais o literal `MANAGER`.
- Botão "Configurações" (rodapé) condicionado a `can(role,'view','gestaoEquipeEquipe')`.

### Mapa sidebar → módulo (fonte única de visibilidade)
| Item de menu | href | Módulo | Quem vê (matriz) |
|--------------|------|--------|------------------|
| Meu Dia | /meu-dia | `tarefas` | todos |
| Hub de Suporte | /suporte | `clientes` | todos |
| Central de Tarefas | /operacional | `tarefas` | todos |
| Cockpit | /cockpit | `cockpit` | todos |
| Clientes | /clients | `clientes` | todos |
| Check-ins da semana | /check-ins | `clientes` | todos |
| Validação da CS | /validacoes | `clientes` | todos |
| Central de Comunicação | /canais | `clientes` | todos |
| Relatórios | /reports | `clientes` | todos |
| Aceite Operacional | /aceite | `operacao` | todos |
| Processos & POPs | /processos | `operacao` | todos |
| Recorrências | /recorrencias | `gestaoEquipeEquipe` | SÓ ADMIN |
| Registro de Operações | /operations | `operacao` | todos |
| War Room | /anti-churn | `warRoom` | todos |
| Alertas | /alerts | `warRoom` | todos |
| Funil de Vendas | /pipeline | `comercial` | SÓ ADMIN |
| CRM | /comercial | `comercial` | SÓ ADMIN |
| Dashboard Comercial | /comercial/dashboard | `comercial` | SÓ ADMIN |
| DRE — Financeiro | /financeiro | `financeiro` | SÓ ADMIN |
| Jurídico & Contratos | /juridico | `juridico` | SÓ ADMIN |
| Equipe | /team | `gestaoEquipeEquipe` | SÓ ADMIN |
| Atribuições de Clientes | /managers/assignments | `gestaoEquipeEquipe` | SÓ ADMIN |
| Metas da Agência | /agency/metas | `gestaoEquipeMetas` | ADMIN, SUP, ANA, CS |
| Visão CEO | /agency | `gestaoEquipeEquipe` | SÓ ADMIN |
| Visão Gestor | /managers | `gestaoEquipeVisaoGestor` | todos |
| Agentes IA | /ai-agents | `inteligencia` | todos |
| Base de Conhecimento | /knowledge | `gestaoEquipeEquipe` | SÓ ADMIN |
| Painel Analítico | /dashboard | `cockpit` | todos |
| Configurações (rodapé) | /settings | `gestaoEquipeEquipe` | SÓ ADMIN |

> Itens de **configuração admin** sem módulo próprio na matriz (Recorrências,
> Base de Conhecimento, Equipe, Atribuições, Visão CEO, Configurações) mapeiam
> para `gestaoEquipeEquipe` — a célula "SÓ ADMIN" da matriz. Mudança de escopo:
> Validação da CS e Aceite Operacional agora seguem `clientes`/`operacao` (leitura
> ampla), então SUPERVISOR/ANALISTA passam a vê-los no menu (antes eram só
> ADMIN/CS/GESTOR). O backend continua a barreira real de decisão/mutação.

## 2. `roleLabel()` + labels amigáveis (`src/lib/rbac/roles.ts`)
- Novo `ROLE5_LABELS` e `roleLabel(role)` (aceita legados; nunca lança).
  Rótulos: ADMIN=Admin · SUPERVISOR_TRAFEGO=Supervisor · ANALISTA_TRAFEGO=Analista
  · CS=Sucesso do Cliente · GESTOR_TRAFEGO=Gestor.
- Exportados no barrel `src/lib/rbac/index.ts`.
- Consumido em: `TopNav.tsx`, `TeamMemberRow.tsx`, `ManagersClient.tsx`.

## 3. `usePermissions()` (`src/lib/rbac/usePermissions.ts`, 'use client')
- Lê o papel da sessão via `useNav()` (o `NavProvider` agora carrega `role`).
- Retorna `{ role5, label, can(action, module) }`. Respeita a prévia GESTOR
  (só rebaixa ADMIN→GESTOR_TRAFEGO — seguro para gating).
- **Não** está no barrel (mantém `'use client'` fora do módulo puro). Importe
  direto: `import { usePermissions } from '@/lib/rbac/usePermissions'`.
- Só funciona dentro do `DashboardShell` (onde há `NavProvider`).
- **Como usar:** `const { can } = usePermissions(); if (can('update','warRoom')) {...}`.

### Alterações de contexto
- `nav-context.tsx`: `NavContextValue` ganhou `role: SessionPayload['role']`.
- `DashboardShell.tsx`: passa `role: session.role` ao `NavProvider`.

## 4. Botões/ações de tarefa condicionados (status-only do GESTOR)
Consomem os flags do `loadTaskPanel`/loader: `canEdit` (edição plena) e
`canEditStatusOnly` (GESTOR — só move de coluna/status). Estado desabilitado com
tooltip operacional: **"Seu perfil altera apenas o status da tarefa."**
- `taskBoard.ts`: `BoardHandlers` ganhou `canEditStatusOnly: boolean`.
- `OperacionalBoard.tsx`: novo prop `canEditStatusOnly` (default false) →
  handlers + `TaskDrawer`.
- `TaskListRow.tsx`: status interativo se `canEdit || canEditStatusOnly`; prazo/
  responsáveis/prioridade ficam estáticos com tooltip para GESTOR.
- `TasksKanbanView.tsx`: drag habilitado para status-only (mover entre colunas =
  status); reordenar DENTRO da coluna bloqueado com toast p/ GESTOR.
- `TaskDrawer.tsx`: select de status visível para status-only; checklist/comentário/
  edição seguem `canEdit`. Nota operacional abaixo do select.
- `TaskPanel.tsx` (painel canônico /t/[id] e slide-over): status interativo para
  status-only; título/datas/atribuição/dependências/descrição seguem `canEdit`.
- `operacional/page.tsx`: calcula e passa `canEditStatusOnly`.
- QuickAdd / "Nova tarefa" seguem `canEdit` (GESTOR não cria — correto).

## 5. Acesso negado / pouso
- Redirects de módulo proibido já são server-side (Agente 3). Não há ponto de UI
  renderizando dado antes do redirect (as páginas SÓ ADMIN dão `redirect()` antes
  de renderizar). `home.ts` (Agente 3) cobre os papéis novos no pouso.

## 6. Dashboards híbridos em blocos
- `cockpit/page.tsx`: bloco financeiro já sob `{data.faturasVencidas && (...)}` —
  loader retorna `null` p/ não-ADMIN → a seção inteira some (sem seção vazia).
  Só ajustei o comentário (era "ADMIN/CS", agora "SÓ ADMIN").
- `dashboard/page.tsx`: `ManagerCards` já sob `{managerStats.length > 0 && ...}` —
  vazio p/ GESTOR → some.

## 7. ProtocolCard + labels de papel
- `ProtocolCard.tsx:79`: `canEdit` agora é `can(normalizeRole(role),'update','warRoom')`
  (antes literal `'MANAGER'`) — GESTOR_TRAFEGO da carteira mantém o botão.
- `TeamMemberRow.tsx`: `roleBadge` re-chaveado por `Role5`; lista de papéis
  atribuíveis = os 5 canônicos; label via `roleLabel`.
- `ManagersClient.tsx`: label via `roleLabel`.
- `InviteUserForm.tsx`: opções de perfil agora criam papéis canônicos
  (SUPERVISOR_TRAFEGO/GESTOR_TRAFEGO/ANALISTA_TRAFEGO/CS/ADMIN).
- `AIAgentsClient.tsx`: `agentsByRole` re-chaveado por `Role5` + `normalizeRole`
  no lookup.

## 8. Record<Role,...> exaustivos
- `Sidebar.tsx`: removido o `type Role` local (era 4 valores → quebraria).
- `TopNav.tsx`: removido `roleLabels: Record<SessionPayload['role'],string>`
  (não exaustivo p/ os 7 valores) → `roleLabel()`.
- `TeamMemberRow.tsx`: `Record<string,...>` → `Record<Role5,...>` (exaustivo).
- `AIAgentsClient.tsx`: `Record<string,...>` → `Record<Role5,...>` (exaustivo).
- Grep final em `src/components`: nenhum `Record<Role,` remanescente; nenhum
  literal `'MANAGER'`/`'ANALYST'` de decisão de UI.

## Arquivos alterados
**Engine (labels + hook)**
- `src/lib/rbac/roles.ts` (ROLE5_LABELS, roleLabel)
- `src/lib/rbac/index.ts` (exports)
- `src/lib/rbac/usePermissions.ts` (NOVO)

**Layout / navegação**
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/nav-context.tsx`
- `src/components/layout/DashboardShell.tsx`
- `src/components/layout/TopNav.tsx`

**Tarefas (status-only)**
- `src/components/operacional/taskBoard.ts`
- `src/components/operacional/OperacionalBoard.tsx`
- `src/components/operacional/TaskListRow.tsx`
- `src/components/operacional/TasksKanbanView.tsx`
- `src/components/operacional/TaskDrawer.tsx`
- `src/components/tasks/TaskPanel.tsx`
- `src/app/(dashboard)/operacional/page.tsx`

**Labels / cards**
- `src/components/anti-churn/ProtocolCard.tsx`
- `src/components/team/TeamMemberRow.tsx`
- `src/components/team/InviteUserForm.tsx`
- `src/components/managers/ManagersClient.tsx`
- `src/components/ai-agents/AIAgentsClient.tsx`
- `src/app/(dashboard)/cockpit/page.tsx` (só comentário)

## Pendências / notas para o Agente 5 (QA)
1. **`tsc`/build não roda no ambiente:** `node_modules` sem `react`/`@prisma/client`
   (mesma limitação do Agente 3). Rodar `npm ci && npx tsc --noEmit && npm run lint`
   no CI. Atenção especial ao build da Vercel para maps exaustivos de enum.
2. **Barrel client-safe:** `@/lib/rbac` só tem imports `type` de Prisma (sem
   `server-only`), então é seguro em client components. `usePermissions` fica FORA
   do barrel de propósito (não arrastar `'use client'` para o módulo puro).
3. **QA sugerido por papel** (logar como cada um e conferir menu + ações):
   - GESTOR_TRAFEGO: sem Comercial/Financeiro/Jurídico/Equipe/Metas no menu; em
     tarefas só move status (drag entre colunas ok; reordenar/editar/criar
     bloqueados com tooltip); War Room da carteira editável.
   - SUPERVISOR_TRAFEGO / ANALISTA_TRAFEGO: leitura ampla (Clientes/Operação/War
     Room/Cockpit/Metas-sem-receita), sem Comercial/Financeiro/Jurídico/Equipe.
   - CS: como staff amplo; sem Comercial/Financeiro.
   - ADMIN: tudo, incluindo prévia "GESTOR" no TopNav (menu rebaixa, dados não).
4. **Prévia GESTOR (viewMode):** só afeta a Sidebar e o `usePermissions` (rebaixa).
   Não altera dados servidos (isso é do servidor). Confirmar que nenhuma ação de
   escrita depende SÓ do gating de UI.
5. **Legados MANAGER/ANALYST no enum:** ainda existem (D-011). `roleLabel`/
   `normalizeRole` cobrem. Usuários antigos com esses valores continuam rotulados
   e roteados corretamente.

## Status
Fatia pronta para revisão do **guardião**. Entregue ao guardião — só APROVADO
libera a próxima fatia.
