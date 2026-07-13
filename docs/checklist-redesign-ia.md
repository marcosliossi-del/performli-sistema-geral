# Checklist de Verificação — Redesign de IA/Navegação (Fase 3)

> Verificação **estática e rigorosa** (o app não roda no ambiente: npm bloqueado).
> Tudo abaixo é derivado do código real (arquivo:linha), nada suposto.
> Base de comparação de portal: `62bc1e6..HEAD` (HEAD = `84be453`).
>
> **Ressalvas de escopo:**
> - Build/lint/test **não** executados aqui (npm bloqueado); a validação de build
>   é feita na Vercel no deploy. Este checklist é **estático**.
> - Teste de clique real (smoke manual navegando com cada papel) **fica pendente**
>   — aqui simulamos a árvore aplicando `itemVisible`/`can()` item a item.

---

## 1. Sidebar por papel — simulação estática de `itemVisible` × `PERMISSION_MATRIX`

Motor: `src/components/layout/Sidebar.tsx:186` (`itemVisible`) → `can(role,'view',module)`
(`src/lib/rbac/permissions.ts:193`). Grupo aparece se ≥1 filho visível
(`Sidebar.tsx:187-189`). Item sem módulo é sempre visível (`Sidebar.tsx:190`).

Visibilidade de `view` por módulo (extraída da matriz):

| Módulo | ADMIN | SUPERVISOR | ANALISTA | CS | GESTOR |
|---|---|---|---|---|---|
| tarefas | ✅ | ✅ | ✅ | ✅ | ✅ |
| cockpit | ✅ | ✅ | ✅ | ✅ | ✅ |
| clientes | ✅ | ✅ | ✅ | ✅ | ✅ |
| operacao | ✅ | ✅ | ✅ | ✅ | ✅ |
| warRoom | ✅ | ✅ | ✅ | ✅ | ✅ |
| comercial | ✅ | ❌ | ❌ | ❌ | ❌ |
| financeiro | ✅ | ❌ | ❌ | ❌ | ❌ |
| juridico | ✅ | ❌ | ❌ | ❌ | ❌ |
| gestaoEquipeVisaoGestor | ✅ | ✅ | ✅ | ✅ | ✅ |
| gestaoEquipeMetas | ✅ | ✅ | ✅ | ✅ | ❌ |
| gestaoEquipeEquipe | ✅ | ❌ | ❌ | ❌ | ❌ |
| inteligencia | ✅ | ✅ | ✅ | ✅ | ✅ |

### 1.1 ADMIN
```
Meu Dia                (tarefas)
Cockpit                (cockpit)
Clientes ▾*            Clientes · Check-ins da semana · Validação da CS ·
                       Hub de Suporte · Central de Comunicação · Relatórios ·
                       Acessos do Portal
Operação ▾*            Central de Tarefas · Aceite Operacional · Processos & POPs ·
                       Rotinas & Recorrências · Registro de Operações
Risco ▾                War Room · Alertas
Comercial ▾            Funil de Vendas · Estágio da Carteira · Dashboard Comercial ·
                       Gerador de Proposta
Administrativo ▾       DRE — Financeiro · Jurídico & Contratos · Metas da Agência ·
                       Equipe · Atribuições de Clientes · Visão CEO · Visão Gestor
Inteligência ▾         Agentes IA · Base de Conhecimento
[rodapé]               Configurações                    (gestaoEquipeEquipe)
```
8 grupos de topo + rodapé. Confere com proposta §2 (ADMIN).

### 1.2 SUPERVISOR_TRAFEGO
```
Meu Dia
Cockpit
Clientes ▾*            Clientes · Check-ins · Validação da CS · Hub de Suporte ·
                       Central de Comunicação · Relatórios      (SEM Acessos do Portal)
Operação ▾*            Central de Tarefas · Aceite Operacional · Processos & POPs ·
                       Registro de Operações                     (SEM Rotinas & Recorrências)
Risco ▾                War Room · Alertas
Administrativo ▾       Metas da Agência · Visão Gestor           (só estas 2 leaves)
Inteligência ▾         Agentes IA                                (SEM Base de Conhecimento)
[rodapé]               (sem Configurações)
```
NÃO vê: Comercial (grupo inteiro oculto). 7 grupos de topo.

### 1.3 ANALISTA_TRAFEGO
Idêntico ao SUPERVISOR_TRAFEGO (mesma linha `view` na matriz para todos os
módulos relevantes). 7 grupos de topo, Administrativo = Metas da Agência + Visão Gestor.

### 1.4 CS
Idêntico ao SUPERVISOR/ANALISTA na visibilidade de itens (CS tem `view` em
clientes, operacao, warRoom, gestaoEquipeMetas, gestaoEquipeVisaoGestor,
inteligencia). Diferenças de CS são de **destaque/ordem** e de mutação (matriz),
não de itens visíveis. 7 grupos de topo, Administrativo = Metas + Visão Gestor.

### 1.5 GESTOR_TRAFEGO
```
Meu Dia
Cockpit
Clientes ▾*            Clientes · Check-ins · Validação da CS · Hub de Suporte ·
                       Central de Comunicação · Relatórios      (escopo = carteira via scope)
Operação ▾*            Central de Tarefas · Aceite Operacional · Processos & POPs ·
                       Registro de Operações
Risco ▾                War Room · Alertas
Administrativo ▾       Visão Gestor                             (ÚNICA leaf — Metas é NONE p/ GESTOR)
Inteligência ▾         Agentes IA
[rodapé]               (sem Configurações)
```
7 grupos de topo.

### 1.6 Divergências vs. proposta §2
1. **Grupo "Administrativo" aparece para papéis não-ADMIN.** A proposta §2 lista
   SUP/ANA/CS/GESTOR com **6** grupos de topo (Meu Dia · Cockpit · Clientes ·
   Operação · Risco · Inteligência) e trata Visão Gestor como parêntese
   "(+ Visão Gestor dentro de um grupo 'Gestão' enxuto quando aplicável)".
   No código real o grupo se chama **"Administrativo"** (`Sidebar.tsx:128`) e,
   como `gestaoEquipeVisaoGestor` é `VIEW_ONLY` para os 5 papéis
   (`permissions.ts:131-137`) e `gestaoEquipeMetas` é `VIEW_ONLY` para SUP/ANA/CS
   (`permissions.ts:142-148`), esse grupo **fica visível** para todos os papéis.
   Logo o topo real dos não-ADMIN tem **7 grupos**, não 6, e o rótulo é
   "Administrativo", não "Gestão".
   - Severidade: **baixa (cosmética/contagem)**. Não é falha de segurança — as
     leaves internas continuam corretamente filtradas pela matriz (SUP/ANA/CS veem
     só Metas + Visão Gestor; GESTOR vê só Visão Gestor; DRE/Jurídico/Equipe/
     Atribuições/Visão CEO permanecem ADMIN-only). É divergência de **documentação**:
     a proposta subestima a contagem e usa outro rótulo de grupo.
   - Recomendação: ajustar a redação da proposta §2 (contagens 6→7 e nome do grupo),
     OU, se a intenção era um grupo "Gestão" enxuto separado do "Administrativo",
     isso exigiria mudança de registry — decisão do Marcos. Como a árvore continua
     100% derivada de `can()` sem `if`s novos, o comportamento está correto; só a
     descrição diverge.

Nenhuma outra divergência: itens ADMIN-only (Acessos do Portal, Rotinas &
Recorrências, Equipe, Atribuições, Visão CEO, Base de Conhecimento, DRE, Jurídico,
Comercial, Configurações) saem corretamente da matriz via `gestaoEquipeEquipe`/
`financeiro`/`juridico`/`comercial`, sem lista de papéis duplicada.

---

## 2. ⌘K (CommandPalette) por papel

`NAV_LINKS` é derivado do MESMO `navigation[]` (`Sidebar.tsx:157-163`, só leaves).
O CommandPalette filtra por `can(r,'view',l.module)`
(`src/components/layout/CommandPalette.tsx:22-23`), com `r = normalizeRole(role)`.

Consequência: **os quick-links do ⌘K = exatamente as leaves visíveis da sidebar**
por papel (mesma matriz, mesma função). Portanto:
- ADMIN: todas as leaves.
- SUP/ANA/CS: sem leaves de `comercial`/`financeiro`/`juridico`/`gestaoEquipeEquipe`
  (Acessos do Portal, Rotinas, Equipe, Atribuições, Visão CEO, Base de Conhecimento,
  DRE, Jurídico, Funil/Pipeline/Dashboard/Proposta). Veem Metas + Visão Gestor.
- GESTOR: idem, e **também** sem `gestaoEquipeMetas` (sem Metas da Agência); vê Visão Gestor.

✅ **Nenhum papel vê no ⌘K link de módulo que não pode ver** — a mesma cláusula
`!l.module || can(r,'view',l.module)` (`CommandPalette.tsx:23`) que governa a sidebar
governa o ⌘K. Sem lista duplicada.

---

## 3. Portal intocado

Comando executado:
```
git diff 62bc1e6..HEAD --stat -- src/app/portal src/lib/portal src/app/api/portal
```
Saída: **vazia** (nenhum arquivo do portal no diff). HEAD = `84be453`, base `62bc1e6` verificada.
✅ Portal (`/portal`, `src/lib/portal`, `src/app/api/portal`) intocado. Namespace de
auth do portal (`performli_portal` / `ClientPortalUser`) não foi tocado por este redesign.

---

## 4. Multi-tenant (isolamento por carteira)

### 4.1 Filtro de Categoria e view "Por Área" operam PÓS-scope
- Origem dos dados: `getOperacionalBoard(userId, role)` aplica o recorte por
  carteira no `where` da query: para papéis não-`canViewAll`,
  `{ OR: [{ assignedTo: userId }, { client: { assignments: { some: { userId } } } }] }`
  — `src/lib/dal.ts:1282-1284`.
- O board scoped é passado como prop `tasks` para `OperacionalBoard`
  (`src/app/(dashboard)/operacional/page.tsx:14-16,43`).
- `OperacionalBoard` semeia o estado a partir dessas props (`OperacionalBoard.tsx:268`).
- O **filtro** roda sobre esse conjunto já scoped: `filtered = applyFilters(tasks, filters)`
  (`OperacionalBoard.tsx:299`); a barra de filtros recebe `areas` derivadas do
  contexto (`OperacionalBoard.tsx:308,491`).
- A **view "Por Área"** (`{ key:'area', label:'Por Área' }`, `OperacionalBoard.tsx:35`)
  agrupa por `t.areaName` sobre `filtered` (`OperacionalBoard.tsx:438-449`).
✅ Filtro de Categoria e "Por Área" são puramente client-side sobre o conjunto
**já filtrado por carteira** no servidor — não há refetch sem scope. Um GESTOR nunca
vê, via filtro/agrupamento, tarefa fora da própria carteira.

### 4.2 `applyOnboardingTemplates` valida posse antes de escrever
- `src/app/actions/onboarding.ts:32-59`:
  1. `requireSession()` — autenticação (`onboarding.ts:35`).
  2. `assertClientMutationAccess(session, clientId, { allowCS: true })` — papel + posse,
     **antes** de qualquer escrita (`onboarding.ts:39`); negação retorna erro operacional.
  3. Só depois `runClientOnboarding(client.id)` materializa tarefas (`onboarding.ts:55`).
  4. `writeAuditLog({ action:'client.onboarding.apply_manual', ... })` — auditoria da
     ação manual (`onboarding.ts:66-79`), regra #8.
✅ Ordem correta: autenticação → papel+posse → escrita → AuditLog. `clientId` valida
posse via `assertClientMutationAccess` (GESTOR só na carteira própria).

---

## 5. Critérios de aceite (master prompt / proposta §6)

| # | Critério | Status | Evidência |
|---|---|---|---|
| 1 | Árvore derivada 100% de `can()`, sem `if`s de papel novos | ✅ | `Sidebar.tsx:186-192` (itemVisible→can); grupos herdam dos filhos |
| 2 | Sidebar bate com as árvores por papel | ⚠️ | Bate para ADMIN e nas leaves de todos; **divergência de contagem/rótulo** do grupo Administrativo p/ não-ADMIN — ver §1.6 |
| 3 | Portal intocado (nenhum arquivo do portal no diff) | ✅ | §3 — diff vazio em `src/app/portal`, `src/lib/portal`, `src/app/api/portal` |
| 4 | Filtro/groupBy de Categoria respeita isolamento por carteira | ✅ | §4.1 — `dal.ts:1282-1284` scope; filtro/área sobre conjunto scoped (`OperacionalBoard.tsx:299,438`) |
| 5 | ⌘K ampliado cobre páginas do menu, sem vazar módulo | ✅ | §2 — `NAV_LINKS` (`Sidebar.tsx:157`) × `can()` (`CommandPalette.tsx:23`) |
| 6 | Status = **agrupamento visual** (zero migração de dados) | ✅ | Kanban ganha "Por grupo" (`OperacionalBoard.tsx:457-476`, `kanbanGrouping`); enum `TaskStatus` intocado; proposta §3 |
| 7 | Nenhuma migration | ✅ | Proposta §5; nenhuma escrita de schema neste escopo |
| 8 | Onboarding 1 clique valida auth+papel+posse e audita | ✅ | §4.2 — `onboarding.ts:35,39,55,66` |
| 9 | Configurações e itens admin permanecem ADMIN-only | ✅ | `Sidebar.tsx:265` (rodapé via `gestaoEquipeEquipe`); leaves admin via `financeiro`/`juridico`/`comercial`/`gestaoEquipeEquipe` |
| 10 | Rotas órfãs (`/minha-semana`, `/tasks`) não expostas no menu | ✅ | Ausentes de `navigation[]` (`Sidebar.tsx:77-148`); remoção física é fatia própria |

Status universal = **agrupamento visual** conforme decisão aprovada (proposta §3):
o board Kanban oferece "Por status" (11) e "Por grupo" (6 grupos), cards mantêm o
status exato; dados e enum intocados.

---

## 6. Ressalvas finais

- **Build/lint/test**: não executados (npm bloqueado no ambiente). Validação de
  build ocorre na Vercel no deploy. Este checklist é estático.
- **Smoke de clique real** (login com cada papel e navegação visual): **pendente**
  de execução manual. A simulação acima cobre a lógica de visibilidade, não o render.
- **Divergência aberta (§1.6):** rótulo/contagem do grupo "Administrativo" para
  papéis não-ADMIN diverge da redação da proposta §2. É documental/cosmética, sem
  impacto de segurança — decisão do Marcos sobre ajustar a proposta ou o registry.
