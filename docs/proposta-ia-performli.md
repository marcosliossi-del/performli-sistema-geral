# Proposta de IA/Navegação — Performli (Fase 1 do Redesign)

> Entregável da Fase 1 do master prompt de redesign de IA. Baseada na auditoria
> aprovada (`docs/audit-ia-atual.md`) e nas decisões do Marcos (2026-07-13):
>
> 1. **Status:** manter os 11 atuais; os 6 universais viram **agrupamento
>    visual** (zero migração de dados).
> 2. **StatusSet:** aposentar a customização por cliente/lista; manter apenas a
>    infraestrutura de grupos (`StatusGroup`), que é o motor do agrupamento.
> 3. **Pessoas/RH e Notas Fiscais:** descartados (Equipe já cobre; NF fora).
> 4. **Rotas órfãs** (`/minha-semana`, `/tasks`): não expor — remover.
>
> **Este documento PARA aqui e aguarda aprovação antes da Fase 2.**

---

## 1. RESUMO EXECUTIVO

Nenhuma migration de banco é necessária. Todo o redesign é camada de UI +
configuração: reagrupar a sidebar, abas no Client 360, breadcrumbs, filtro de
Categoria, agrupamento visual de status, template de onboarding com 1 clique e
padronização de estados vazios. Risco de regressão baixo e portal intocado.

---

## 2. ÁRVORE DE NAVEGAÇÃO FINAL (por papel)

A árvore continua derivada 100% do policy engine (`can()`), sem `if`s novos.
A mudança é só no **registry** (`navigation[]`): reagrupamento + 1 grupo novo
"Risco" (War Room + Alertas) + seção Administrativo consolidada.

### ADMIN (8 itens de topo — 2 fixos + 6 grupos)
```
Meu Dia            /meu-dia          [fixo, badge]
Cockpit            /cockpit          [fixo]
Clientes ▾*        Clientes · Check-ins da semana · Validação da CS ·
                   Hub de Suporte · Central de Comunicação · Relatórios ·
                   Acessos do Portal
Operação ▾*        Central de Tarefas · Aceite Operacional · Processos & POPs ·
                   Rotinas & Recorrências · Registro de Operações
Risco ▾            War Room · Alertas                     [badges sobem p/ grupo]
Comercial ▾        Funil de Vendas · Estágio da Carteira · Dashboard ·
                   Gerador de Proposta · (reservado: Conversas)
Administrativo ▾   DRE — Financeiro · Jurídico & Contratos · Metas da Agência ·
                   Equipe · Atribuições de Clientes · Visão CEO
Inteligência ▾     Agentes IA · Base de Conhecimento
[rodapé]           Configurações
```
`▾*` = defaultOpen. Nota: 8 > 7 do prompt; justificativa registrada — fundir
Inteligência dentro de Administrativo esconderia os Agentes IA dos papéis
operacionais que os usam. Decisão nativa do Performli > referência (regra 6).

### SUPERVISOR_TRAFEGO / ANALISTA_TRAFEGO (6)
```
Meu Dia · Cockpit · Clientes ▾* · Operação ▾* · Risco ▾ · Inteligência ▾
(+ Visão Gestor dentro de um grupo "Gestão" enxuto quando aplicável)
```

### CS (6)
```
Meu Dia · Cockpit · Clientes ▾* (Check-ins, Validação da CS, Suporte em
destaque) · Operação ▾* · Risco ▾ · Inteligência ▾
```

### GESTOR_TRAFEGO (6)
```
Meu Dia · Cockpit · Clientes ▾* (só carteira própria — scoping já existente) ·
Operação ▾* · Risco ▾ · Inteligência ▾
```

Diferenças internas (leaves ADMIN-only: Acessos do Portal, Recorrências,
Equipe, Atribuições, Visão CEO, Base de Conhecimento) continuam saindo da
matriz — nenhuma mudança em `permissions.ts`.

**Hub de Suporte** deixa de ser item fixo e entra no grupo Clientes (mantém
badge). **Central de Tarefas** sai do bloco fixo e vira 1ª leaf de Operação
(grupo defaultOpen → mesmo nº de cliques).

### Badges em grupos colapsados
Grupo fechado passa a somar os badges dos filhos visíveis (ex.: Risco mostra
warRooms+alertas). Só UI — os CountKeys e queries atuais não mudam.

---

## 3. STATUS — AGRUPAMENTO VISUAL (decisão 1)

Enum `TaskStatus` (11) **intocado**; dados intocados. Os 6 grupos universais
viram camada de apresentação via mapa fixo (`statusMap.ts`, já existente):

| Grupo visual | Status atuais |
|---|---|
| Para fazer | A_FAZER |
| Em andamento | EM_ANDAMENTO |
| Validação interna | EM_VALIDACAO |
| Aguardando | AGUARDANDO_CLIENTE · AGUARDANDO_CS · AGUARDANDO_GESTOR |
| Alteração & ajuste | AJUSTES_SOLICITADOS · BLOQUEADO* |
| Concluído | CONCLUIDO · CANCELADO* |

\* BLOQUEADO e CANCELADO ficam visíveis com o próprio rótulo dentro do grupo
(o grupo é agrupamento, não renomeação). ATRASADO continua derivado de prazo
(não entra em grupo — é flag).

UI: board Kanban ganha modo "agrupar por grupo de status" (colunas = 6 grupos,
cards mantêm o status exato); filtros continuam pelos 11.

**StatusSet (decisão 2):** a customização por cliente/lista é aposentada —
sem tela de gestão de StatusSet, `sset_arkza` vira o único set (hardcoded no
mapa). O espelho de escrita `Task.statusId` é mantido como está (barato e já
testado); remoção de colunas/models é migration destrutiva e fica para a
auditoria geral (B-15/B-16), fora deste escopo.

---

## 4. DEMAIS ITENS DA MATRIZ (ADAPTAR/CRIAR aprovados)

| Item | Escopo Fase 2 |
|---|---|
| Hub do cliente com ABAS | `ClientSectionNav` vira TabNav (mesmas 7 seções, mesmo conteúdo, deep-link por `?tab=` mantendo âncoras como fallback) |
| Breadcrumbs | Componente novo `Breadcrumbs.tsx` + uso em `/clients/[slug]`, `/t/[taskId]`, `/comercial/*`, `/settings/*` |
| Categoria global filtrável | `TaskFiltersBar` ganha filtro por Área (`AreaCode`, 10 valores atuais — sem expandir enum) + `BoardView` ganha groupBy área |
| Template de onboarding 1 clique | Botão "Aplicar onboarding" no cliente (e no estado vazio de tarefas) instancia o conjunto de `TaskTemplate`s de onboarding → `Task`s do cliente. Sem schema novo |
| Estados vazios com CTA | Padronizar `EmptyState` nas views principais (tarefas do cliente → CTA de onboarding; listas vazias → CTA de criação) |
| Rotinas transversal | Leaf "Rotinas & Recorrências" no grupo Operação (visão read-only para papéis; gestão continua ADMIN) |
| ⌘K ampliado | Quick-links passam a cobrir todas as páginas do menu (gerados do próprio registry) |
| Rotas órfãs (decisão 4) | Remover `/minha-semana` e `/tasks` (páginas sem entrada de menu; justificativa: regra 12 do CLAUDE.md — remoção registrada aqui) |
| Conversas | Slot reservado no grupo Comercial (módulo RBAC `conversas` já existe) — ativado quando a Fase 2 do módulo entregar a tela |

**Descartados (decisão 3):** Pessoas/RH (Equipe cobre) e Notas Fiscais.

---

## 5. MIGRATIONS

**Nenhuma.** Todas as entregas são UI/config. (Único toque em dado: zero.
Remoção futura de models mortos segue com B-15/B-16, com aprovação própria.)

## 6. VERIFICAÇÃO (Fase 3)

1. Sessão simulada com cada um dos 5 papéis → sidebar bate com as árvores acima.
2. Portal `/portal` intocado (nenhum arquivo da árvore do portal no diff).
3. Filtro/groupBy de Categoria usa `scopeTasks` (isolamento por carteira).
4. Checklist com evidências em `docs/checklist-redesign-ia.md`.

## 7. ORDEM DE IMPLEMENTAÇÃO (fatias)

1. Sidebar reagrupada + badges de grupo + ⌘K ampliado + remoção das órfãs.
2. Client 360 com abas + breadcrumbs.
3. Agrupamento visual de status no board + filtro/groupBy de Categoria.
4. Template de onboarding 1 clique + padrão de estados vazios.
