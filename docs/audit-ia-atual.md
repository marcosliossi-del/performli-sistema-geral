# Auditoria da Arquitetura de Informação — Performli (Fase 0 do Redesign de IA)

> Entregável da Fase 0 do master prompt de redesign de IA/navegação. Auditoria
> read-only do código real (2026-07-13), com autocrítica adversarial aplicada
> antes da apresentação. **Nenhuma mudança foi feita.** Este documento PARA
> aqui e aguarda aprovação antes da Fase 1 (proposta).
>
> Referência: hierarquia do workspace ClickUp da Arkza (inspiração, não spec).
> Regra mestra respeitada: o que já está resolvido no Performli — mesmo que
> diferente do ClickUp — é classificado MANTER.

---

## 1. ÁRVORE DE NAVEGAÇÃO ATUAL (transcrita de `src/components/layout/Sidebar.tsx:77-148`)

> Nota de transcrição: alguns rótulos estão ABREVIADOS aqui por legibilidade —
> os nomes reais na UI são "Check-ins da semana", "Validação da CS", "Operação
> de Tráfego", "Aceite Operacional", "Registro de Operações", "Funil de Vendas
> (Leads)", "Gerador de Proposta" e "DRE — Financeiro". Nenhuma proposta de
> renomeação está implícita.

```
[fixo]           Meu Dia (/meu-dia) · Hub de Suporte (/suporte) ·
                 Central de Tarefas (/operacional) · Cockpit (/cockpit)
Clientes ▾*      Clientes (/clients) · Check-ins (/check-ins) · Validação CS
                 (/validacoes) · Central de Comunicação (/canais) · Relatórios
                 (/reports) · Acessos do Portal (/portal-acessos, ADMIN)
Operação ▾*      Aceite (/aceite) · Processos & POPs (/processos) ·
                 Recorrências (/recorrencias, ADMIN) · Operações (/operations)
War Room         (/anti-churn)          [leaf, badge]
Alertas          (/alerts)              [leaf, badge]
Comercial ▾      Funil (/comercial) · Estágio da Carteira (/pipeline) ·
                 Dashboard (/comercial/dashboard) · Proposta (/comercial/proposta)
Financeiro ▾     DRE (/financeiro) · Jurídico & Contratos (/juridico)
Gestão&Equipe ▾  Equipe (/team) · Atribuições (/managers/assignments) ·
                 Metas da Agência (/agency/metas) · Visão CEO (/agency) ·
                 Visão Gestor (/managers)
Inteligência ▾   Agentes IA (/ai-agents) · Base de Conhecimento (/knowledge, ADMIN)
[rodapé]         Configurações (/settings, ADMIN)

▾* = grupo `defaultOpen: true` (Clientes e Operação de Tráfego abrem expandidos
     — fato que sustenta a contagem de "2 cliques" abaixo).
```

**Mecânica de visibilidade:** 100% derivada do policy engine (`itemVisible` →
`can(role,'view',item.module)`, `Sidebar.tsx:171-177`) — a mesma matriz do
backend. Não há `if`s de papel espalhados. **Já é uma sidebar RBAC-driven com
registry declarativo** (o array `navigation` É o registry; a Fase 2.2 do prompt
está, na essência, atendida — refino, não criação).

**Itens de topo por papel** (cruzado com `permissions.ts`):
| Papel | Topo | Diferença |
|---|---|---|
| ADMIN | 12 (+Config) | vê tudo |
| SUPERVISOR / ANALISTA / CS / GESTOR | 10 | sem Comercial e Financeiro; diferenças restantes só em leaves internas |

**Achado central de navegação:** a nav distingue, no 1º nível, apenas
ADMIN × não-ADMIN. Os 4 papéis operacionais veem topo idêntico — o "recorte
por função" da referência (pastas por cargo) hoje não existe na prática.
Dentro do limite do prompt (5–7 itens de topo), **10-12 itens excede**.

**Rotas órfãs (sem item de menu):** `/minha-semana` e `/tasks` (páginas
existem, não alcançáveis pela nav nem pelo ⌘K — decidir destino de ambas),
`/dashboard` e `/` (redirects), `/clients/new`, `/clients/[slug]` e
`/t/[taskId]` (drill-down, ok), `/dev/components` (ok).

**Camada de rota além da sidebar (middleware):** o RBAC de navegação tem DUAS
camadas — `permissions.ts` (visibilidade) e `src/middleware.ts:13`
(`PROTECTED_PREFIX`, lista hardcoded de prefixos que exigem sessão staff).
⚠️ Achado: `/suporte`, `/recorrencias` e `/juridico` são itens de menu mas NÃO
estão no `PROTECTED_PREFIX` — todas as 3 páginas têm `requireSession()` interno
(não é buraco aberto), mas é gap de defesa em profundidade; qualquer rota nova
do redesign precisa entrar na lista. Shells: rotas internas vivem no route
group `(dashboard)` sob `DashboardShell`; `/portal` tem shell próprio e
namespace de auth separado.

**Busca global:** ⌘K/Ctrl+K **existe** (`CommandPalette.tsx`, montada no
`DashboardShell.tsx:31-40`) cobrindo tarefas, clientes e POPs + quick-links.
Não cobre "todas as páginas".

**Breadcrumbs:** **não existem** (nenhum componente; telas profundas usam
"← voltar" ad-hoc e âncoras).

**Hub do cliente (`/clients/[slug]`):** é um hub real e denso — 7 seções
(visão geral/KPIs, metas, histórico/diagnóstico, campanhas/relatórios,
conversas/operações, tarefas/plano de ação, CRM) — porém em **scroll único com
âncoras** (`ClientSectionNav`), não abas. **2 cliques** da home a qualquer
cliente (ou 1 via ⌘K); tarefa idem (2 cliques). O critério "≤2 cliques" **já é
atendido**.

---

## 2. SCHEMA — CONCEITOS RELEVANTES AO REDESIGN

| Conceito | O que existe | Estado |
|---|---|---|
| Status de tarefa | Enum `TaskStatus` (11 valores) — usado em TODA a UI | vivo |
| Status customizável | `StatusSet`/`Status`/`StatusGroup` (D-004) + `Task.statusId` | **semi-ligado**: o write-path está VIVO (`statusId` espelhado em toda mutação — `mutate.ts:85-88`, escalation, clones de recorrência, seeds) e a UI já consome `StatusGroup` (`StatusBadge.tsx`, `CLOSED_GROUPS`) via mapa fixo enum↔`st_*` (`statusMap.ts`, set default `sset_arkza`); o que está DESLIGADO é só a customização/leitura por Status dinâmico |
| "Categoria" | `AreaCode`/`TaskArea` (10 setores) é o análogo natural; `TaskType` (22) é ortogonal (natureza) | dado existe; **nenhum filtro por área/categoria nas views** (`TaskFiltersBar` só tem status/responsável/prioridade/cliente/vencimento) |
| Setor/agrupamento | `AreaCode` no dado; `BoardView = lista|kanban|calendario|cliente|responsavel` — **sem groupBy área** | parcial |
| Pessoas/RH | `User` (+`operationalRole`), `/team`, `/managers/assignments` | gestão de equipe, não RH pleno |
| Rotinas/rituais | `TaskRecurrenceRule` (13 freq.) + `/recorrencias`; `OperationalRoutine` **sem UI** (model morto, já apontado na auditoria geral B-16) | parcial |
| Template de onboarding | `TaskTemplate`(+Step/Field) + `seed-operacao` (15 templates); instanciação via cron de recorrência, **não** por ação "onboardar cliente X" | parcial |
| Estados vazios | `EmptyState.tsx` existe, usado em só 2 telas (`/recorrencias`, `/operations`); resto é inline sem padrão de CTA | parcial |

### Mapeamento dos 11 status → 6 universais da referência
| Atual | Universal | Nota |
|---|---|---|
| A_FAZER | para fazer | direto |
| EM_ANDAMENTO | em andamento | direto |
| EM_VALIDACAO | validação interna | direto |
| AGUARDANDO_CLIENTE | aguardando informação | direto |
| AJUSTES_SOLICITADOS | em alteração & ajuste | direto |
| CONCLUIDO | concluído | direto |
| AGUARDANDO_CS / AGUARDANDO_GESTOR | aguardando informação (?) | ⚠️ colapsar perde o EIXO DE RESPONSÁVEL (cliente × CS × gestor) que hoje o status carrega — decisão de produto, não técnica |
| BLOQUEADO | — | ⚠️ sem mapeamento óbvio (impedimento ≠ aguardando info) |
| ATRASADO | — | ⚠️ é derivado de prazo (nem aparece nas opções de UI) — candidato a virar atributo, não status |
| CANCELADO | — | ⚠️ terminal negativo; os 6 universais não têm "cancelado" |

**Conforme a regra 7 do prompt: 5 status problemáticos REPORTADOS aqui em vez
de decididos por conta própria — 3 sem destino nos 6 universais (BLOQUEADO,
ATRASADO, CANCELADO) + 2 cujo colapso perde o eixo de responsável
(AGUARDANDO_CS, AGUARDANDO_GESTOR).**

---

## 3. MATRIZ DE GAP (referência ClickUp → Performli)

Colunas: MANTER (já resolvido, mesmo que diferente) / ADAPTAR (parcial; ajuste
mínimo descrito) / CRIAR (não existe; escopo a propor na Fase 1).

| Item da referência | Classe | Detalhe / ajuste mínimo | Tabelas afetadas |
|---|---|---|---|
| Sidebar RBAC-driven via registry declarativo | **MANTER** | Já existe (`navigation[]` + `can()`); Fase 2.2 essencialmente pronta | — |
| Cliente como entidade de 1ª classe (hub) | **MANTER** | Client 360 já é hub denso, 2 cliques | — |
| ≤2 cliques até cliente/tarefa | **MANTER** | Atendido (2 cliques; 1 via ⌘K) | — |
| Busca global ⌘K | **MANTER** (refino opcional) | Existe p/ tarefas/clientes/POPs; ampliar para páginas é melhoria menor | — |
| Objetivos & Metas | **MANTER** | Módulo de Metas já integrado na nav (`/agency/metas`) — não duplicar | — |
| Comercial / Financeiro-Jurídico como setores | **MANTER** | Já existem como grupos na sidebar (ADMIN) | — |
| Espaço pessoal (PF) | **MANTER (descartado)** | Fora do domínio, como a própria referência manda | — |
| Sidebar enxuta (5–7 itens de topo) | **ADAPTAR** | Hoje 10-12; reagrupar sem renomear módulos (ex.: War Room+Alertas sob um grupo; fixos mantidos) | — |
| Nav diferenciada por papel operacional | **ADAPTAR** | Topo idêntico p/ 4 papéis; propor recortes por papel (GESTOR→carteira/tarefas; CS→entregas/validação/suporte) usando a matriz existente — sem `if`s novos | — (permissions.ts) |
| Hub do cliente com ABAS | **ADAPTAR** | Trocar scroll+âncoras por abas (mesmo conteúdo; `ClientSectionNav` vira TabNav). Risco baixo | — |
| Fluxo de status universal (6) | **ADAPTAR** | 6 dos 11 mapeiam direto; 5 problemáticos (ver §2) — decisão de produto pendente. Migration de dados só depois da decisão | Task (dados), enum TaskStatus |
| Status customizável (StatusSet) | **ADAPTAR (decidir)** | Semi-ligado (ver §2): write-path do `statusId` vivo em ~8 pontos + UI já usa StatusGroup; só a leitura/customização por Status dinâmico está desligada. Completar OU aposentar — aposentar custa desmontar o espelho de escrita; decisão da Fase 1 | Status, StatusSet, Task.statusId |
| Categoria global filtrável | **ADAPTAR** | Dado existe (`AreaCode`, 10 ≠ 14 da referência); falta o FILTRO nas views + groupBy área no board. Expandir enum só se produto exigir as 14 | TaskArea/AreaCode (talvez +valores), UI TaskFiltersBar |
| Agrupamento "Administrativo" na nav | **ADAPTAR** | Conteúdo já existe disperso (Financeiro, Jurídico, Processos); é reagrupamento de sidebar, não módulo novo | — |
| Rotinas/rituais como seção transversal | **ADAPTAR** | `/recorrencias` existe (ADMIN-only hoje); expor visão "Rotinas" aos papéis + decidir destino do model morto `OperationalRoutine` | TaskRecurrenceRule; OperationalRoutine (aposentar?) |
| Template de onboarding instanciável (1 clique) | **ADAPTAR** | Templates + seed existem; falta a AÇÃO de UI "aplicar onboarding ao cliente X" (instanciar conjunto de tarefas) | TaskTemplate → Task (sem schema novo) |
| Breadcrumbs | **CRIAR** | Componente novo + uso nas telas profundas (clients/[slug], t/[taskId], comercial/*) | — |
| Módulo Pessoas/RH (cargos, onboarding interno, recrutamento) | **CRIAR (propor)** | Não existe; `/team` é gestão de acesso/carteira. Conforme regra mestra: NÃO criar sem aprovação — vai como proposta na Fase 1 | novas (se aprovado) |
| Notas Fiscais | **CRIAR (propor)** | Não existe nada de NF | novas (se aprovado) |
| Estados vazios com CTA (padrão) | **ADAPTAR** | `EmptyState` existe; padronizar uso + CTA (ex.: cliente sem tarefas → "Aplicar template de onboarding") | — |
| Rotas órfãs | **ADAPTAR** | `/minha-semana` e `/tasks` decidir (expor no menu ou remover); `/dashboard` redirect ok | — |

**Contagem: 7 MANTER · 11 ADAPTAR · 3 CRIAR** (2 dos CRIAR são propostas que
dependem de aprovação explícita — Pessoas/RH e NF).

---

## 4. RISCOS

1. **Migração de status (o maior).** Consolidar 11→6 muda dado vivo de TODAS as
   tarefas e o vocabulário operacional do time. Os 3 `AGUARDANDO_*` carregam
   "quem deve agir" — colapsá-los perde informação que hoje alimenta filas
   (Validação CS, Aceite). Mitigação: decisão de produto explícita na Fase 1 +
   migration de dados com mapa aprovado + relatório de não-mapeados. Alternativa
   a considerar na Fase 1: manter os 11 e apresentar os 6 como *agrupamento
   visual* (StatusGroup já existe para isso) — zero migração de dados.
2. **StatusSet semi-ligado.** Completar o customizável contradiz o "status
   universal único"; manter os dois é a pior opção (dois cérebros). Aposentar
   NÃO é grátis: o espelho `statusId` é escrito em toda mutação (~8 pontos) e
   `StatusGroup` já alimenta a UI (`StatusBadge`, `CLOSED_GROUPS`). Decisão
   binária na Fase 1, com custo real dos dois lados mapeado.
3. **Portal do cliente**: FORA DE ESCOPO (regra 2). A sidebar/nav interna não
   toca `/portal`; risco de regressão é nulo se o trabalho ficar em
   `(dashboard)`/`Sidebar`/`permissions.ts` — mas `permissions.ts` é
   compartilhado: mudanças de matriz precisam de QA papel-a-papel (Fase 3.1).
4. **Multi-tenant**: reagrupar navegação não toca queries; o risco aparece só
   nos itens CRIAR (Pessoas/NF, se aprovados) e no filtro de Categoria (usar
   `scopeTasks` existente).
5. **Módulo Conversas em desenvolvimento paralelo** (Fase 1 em curso): o
   redesign deve reservar lugar na nav para `/conversas` (módulo RBAC
   `conversas` já existe na matriz) — coordenar para não conflitar.
6. **Badges/CountKeys acoplados a queries.** Os 7 badges da sidebar
   (`meuDia/abertas/checkins/validacoes/warRooms/alertas/suporte`) vêm de
   queries na DAL. Reagrupar itens exige decidir se o badge sobe para o grupo
   (hoje grupo só exibe badge com `countKey` próprio — nenhum tem).
7. **`PROTECTED_PREFIX` desalinhado da nav** (ver §1): `/suporte`,
   `/recorrencias` e `/juridico` fora da lista do middleware (guard interno
   cobre, mas é defesa em profundidade quebrada). Corrigir é 1 linha aditiva —
   pode ser feito já, independente do redesign.

---

## 5. O QUE **NÃO** SERÁ FEITO (anti-escopo, regra 6b)

- Renomear módulos existentes para bater com nomes do ClickUp.
- Recriar o Client 360, o board de tarefas ou o CommandPalette (já resolvem os
  princípios).
- Criar Financeiro/Jurídico (já existem) ou Pessoas/NF sem aprovação.
- Tocar no portal do cliente.

---

## 6. PRÓXIMO PASSO

**Fase 1 (após aprovação deste relatório):** `docs/proposta-ia-performli.md`
com (a) árvore de navegação final POR PAPEL (5 árvores), (b) decisão
fundamentada sobre status (consolidar × agrupar visualmente) e StatusSet,
(c) escopo do filtro/groupBy de Categoria, (d) spec do hub com abas +
breadcrumbs + template de onboarding instanciável, (e) proposta (opcional) de
Pessoas/NF para aprovação separada.
