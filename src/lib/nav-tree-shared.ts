/**
 * Tipos PUROS + transformações client-safe da árvore de navegação editável
 * (decisão do Marcos, 2026-07-13 — "sidebar como no ClickUp").
 *
 * Este módulo NÃO tem I/O nem `server-only`: pode ser importado por client
 * (Sidebar/CommandPalette) E por servidor. O DAL/seed com Prisma vive em
 * `src/lib/nav-tree.ts` (server-only) e re-exporta o que for público daqui.
 *
 * A árvore é GLOBAL (uma só para a agência) e fornece apenas ESTRUTURA +
 * RÓTULOS. A visibilidade por papel (matriz RBAC via `can()`) e a ACL por
 * espaço (NavSpaceMode/Access) continuam aplicadas POR CIMA — a ponte é
 * `spaceKey`, IDÊNTICO ao de `src/lib/nav-spaces.ts`. A resolução de
 * visibilidade continua no client como hoje (`navHrefVisible`): a árvore não
 * decide quem vê o quê.
 *
 * Profundidade máxima = 3 níveis (espelha o ClickUp: setor → pasta → lista):
 *   GROUP de raiz  →  GROUP subpasta  →  LEAF
 *   GROUP de raiz  →  LEAF (leaf direta no setor)
 */

/** Espécie do nó. Espelha o enum Prisma `NavNodeKind`. */
export type NavNodeKind = 'GROUP' | 'LEAF'

/** Chaves de badge de pendências (idênticas às da Sidebar atual). */
export type NavCountKey =
  | 'meuDia'
  | 'abertas'
  | 'checkins'
  | 'validacoes'
  | 'warRooms'
  | 'alertas'
  | 'suporte'

/**
 * Nó recursivo serializável (atravessa server→client como prop). GROUP tem
 * `href = null` e pode conter GROUPs (subpastas, só 1 nível) e/ou LEAFs. LEAF é
 * folha: carrega `href`, `spaceKey` (ponte ACL) e `module` (visibilidade).
 */
export type NavTreeNode = {
  id: string
  parentId: string | null
  kind: NavNodeKind
  label: string
  href: string | null
  spaceKey: string | null
  module: string | null
  countKey: NavCountKey | null
  alert: boolean
  icon: string | null
  order: number
  hidden: boolean
  defaultOpen: boolean
  children: NavTreeNode[]
}

/** Árvore completa: nós de raiz ordenados (cada GROUP traz `children`). */
export type NavTree = { nodes: NavTreeNode[] }

/**
 * Link plano do menu (só LEAF visível). Consumido pelo ⌘K (CommandPalette).
 * `icon` é o nome lucide como string — a UI mapeia p/ componente.
 */
export type NavLink = {
  name: string
  href: string
  module: string | null
  icon: string | null
  /** Ponte ACL por espaço (idêntica à da LEAF) — o ⌘K filtra com a mesma resolução da Sidebar. */
  spaceKey: string | null
}

/**
 * Achata a árvore em links planos (só LEAF), PULANDO nós ocultos e qualquer
 * descendente de um grupo oculto ("excluir aba" some da navegação inteira).
 * Ordem = pré-ordem da árvore (respeita `order`).
 */
export function navTreeToNavLinks(tree: NavTree): NavLink[] {
  const out: NavLink[] = []
  const walk = (nodes: NavTreeNode[]) => {
    for (const n of nodes) {
      if (n.hidden) continue
      if (n.kind === 'LEAF' && n.href) {
        out.push({ name: n.label, href: n.href, module: n.module, icon: n.icon, spaceKey: n.spaceKey })
      } else if (n.kind === 'GROUP') {
        walk(n.children)
      }
    }
  }
  walk(tree.nodes)
  return out
}

// ─── SEED (espelha a organização do ClickUp do Marcos → rotas reais) ─────────
// Estrutura pura de dados. `ensureNavTree()` (server) materializa isto no banco
// SE a tabela estiver vazia. countKey/alert/module/spaceKey por href são
// IDÊNTICOS aos da Sidebar.tsx / nav-spaces.ts atuais (a ACL depende disso).
// Subpastas NÃO recebem spaceKey: a ACL de navegação continua ancorada nas
// LEAVES (cada leaf carrega seu spaceKey canônico, cujo grupo-ACL é resolvido
// por nav-spaces, independente da estrutura visual da árvore). Ver DECISÕES.

export type SeedLeaf = {
  kind: 'LEAF'
  label: string
  href: string
  spaceKey: string
  module: string | null
  icon: string
  countKey?: NavCountKey
  alert?: boolean
}

export type SeedGroup = {
  kind: 'GROUP'
  label: string
  icon: string
  defaultOpen?: boolean
  children: SeedNode[]
}

export type SeedNode = SeedGroup | SeedLeaf

const leaf = (l: Omit<SeedLeaf, 'kind'>): SeedLeaf => ({ kind: 'LEAF', ...l })
const group = (g: Omit<SeedGroup, 'kind'>): SeedGroup => ({ kind: 'GROUP', ...g })

export const NAV_TREE_SEED: SeedGroup[] = [
  group({
    label: 'Comercial & Vendas',
    icon: 'Target',
    children: [
      group({
        label: 'Área de Vendas',
        icon: 'Kanban',
        children: [
          leaf({ label: 'Funil de Vendas', href: '/comercial', spaceKey: 'comercial.funil', module: 'comercial', icon: 'Target' }),
          leaf({ label: 'Estágio da Carteira', href: '/pipeline', spaceKey: 'comercial.pipeline', module: 'comercial', icon: 'Kanban' }),
          leaf({ label: 'Dashboard Comercial', href: '/comercial/dashboard', spaceKey: 'comercial.dashboard', module: 'comercial', icon: 'BarChart3' }),
          leaf({ label: 'Gerador de Proposta', href: '/comercial/proposta', spaceKey: 'comercial.proposta', module: 'comercial', icon: 'FileText' }),
        ],
      }),
      leaf({ label: 'Conversas', href: '/conversas', spaceKey: 'comercial.conversas', module: 'conversas', icon: 'MessagesSquare' }),
    ],
  }),
  group({
    label: 'Gestão Interna',
    icon: 'Activity',
    defaultOpen: true,
    children: [
      leaf({ label: 'Meu Dia', href: '/meu-dia', spaceKey: 'meu-dia', module: 'tarefas', icon: 'Sun', countKey: 'meuDia', alert: true }),
      leaf({ label: 'Cockpit', href: '/cockpit', spaceKey: 'cockpit', module: 'cockpit', icon: 'Gauge' }),
      leaf({ label: 'Central de Tarefas', href: '/operacional', spaceKey: 'operacao.tarefas', module: 'tarefas', icon: 'ListTodo', countKey: 'abertas' }),
      group({
        label: 'Time de CS',
        icon: 'Headset',
        children: [
          leaf({ label: 'Hub de Suporte', href: '/suporte', spaceKey: 'clientes.suporte', module: 'clientes', icon: 'Headset', countKey: 'suporte' }),
          leaf({ label: 'Validação da CS', href: '/validacoes', spaceKey: 'clientes.validacoes', module: 'clientes', icon: 'ShieldCheck', countKey: 'validacoes', alert: true }),
          leaf({ label: 'Check-ins da semana', href: '/check-ins', spaceKey: 'clientes.checkins', module: 'clientes', icon: 'CheckSquare', countKey: 'checkins', alert: true }),
        ],
      }),
      group({
        label: 'Time de Performance',
        icon: 'Gauge',
        children: [
          leaf({ label: 'Aceite Operacional', href: '/aceite', spaceKey: 'operacao.aceite', module: 'operacao', icon: 'ShieldCheck' }),
          leaf({ label: 'Registro de Operações', href: '/operations', spaceKey: 'operacao.operations', module: 'operacao', icon: 'FileText' }),
        ],
      }),
      group({
        label: 'Rotinas',
        icon: 'Repeat',
        children: [
          leaf({ label: 'Rotinas & Recorrências', href: '/recorrencias', spaceKey: 'operacao.recorrencias', module: 'gestaoEquipeEquipe', icon: 'Repeat' }),
          leaf({ label: 'Processos & POPs', href: '/processos', spaceKey: 'operacao.processos', module: 'operacao', icon: 'BookOpen' }),
        ],
      }),
    ],
  }),
  group({
    label: 'Administrativo',
    icon: 'Building2',
    children: [
      group({
        label: 'CRM Clientes Ativos',
        icon: 'Users',
        children: [
          leaf({ label: 'Clientes', href: '/clients', spaceKey: 'clientes.lista', module: 'clientes', icon: 'Users' }),
          leaf({ label: 'Central de Comunicação', href: '/canais', spaceKey: 'clientes.canais', module: 'clientes', icon: 'MessagesSquare' }),
          leaf({ label: 'Relatórios', href: '/reports', spaceKey: 'clientes.reports', module: 'clientes', icon: 'BarChart3' }),
          leaf({ label: 'Acessos do Portal', href: '/portal-acessos', spaceKey: 'clientes.portal-acessos', module: 'gestaoEquipeEquipe', icon: 'KeyRound' }),
        ],
      }),
      group({
        label: 'Jurídico',
        icon: 'Scale',
        children: [
          leaf({ label: 'Jurídico & Contratos', href: '/juridico', spaceKey: 'administrativo.juridico', module: 'juridico', icon: 'Scale' }),
        ],
      }),
      group({
        label: 'Financeiro',
        icon: 'TrendingUp',
        children: [
          leaf({ label: 'DRE — Financeiro', href: '/financeiro', spaceKey: 'administrativo.financeiro', module: 'financeiro', icon: 'TrendingUp' }),
        ],
      }),
      group({
        label: 'Objetivos & Metas',
        icon: 'Target',
        children: [
          leaf({ label: 'Metas da Agência', href: '/agency/metas', spaceKey: 'administrativo.metas', module: 'gestaoEquipeMetas', icon: 'Target' }),
        ],
      }),
    ],
  }),
  group({
    label: 'Risco',
    icon: 'ShieldAlert',
    children: [
      leaf({ label: 'War Room', href: '/anti-churn', spaceKey: 'risco.warroom', module: 'warRoom', icon: 'ShieldAlert', countKey: 'warRooms', alert: true }),
      leaf({ label: 'Alertas', href: '/alerts', spaceKey: 'risco.alertas', module: 'warRoom', icon: 'Bell', countKey: 'alertas', alert: true }),
    ],
  }),
  group({
    label: 'Gestão de Pessoas',
    icon: 'Users',
    children: [
      leaf({ label: 'Equipe', href: '/team', spaceKey: 'administrativo.equipe', module: 'gestaoEquipeEquipe', icon: 'Users' }),
      leaf({ label: 'Atribuições de Clientes', href: '/managers/assignments', spaceKey: 'administrativo.assignments', module: 'gestaoEquipeEquipe', icon: 'UserPlus' }),
      leaf({ label: 'Visão CEO', href: '/agency', spaceKey: 'administrativo.ceo', module: 'gestaoEquipeEquipe', icon: 'Building2' }),
      leaf({ label: 'Visão Gestor', href: '/managers', spaceKey: 'administrativo.gestor', module: 'gestaoEquipeVisaoGestor', icon: 'PieChart' }),
    ],
  }),
  group({
    label: 'Inteligência',
    icon: 'Bot',
    children: [
      leaf({ label: 'Agentes IA', href: '/ai-agents', spaceKey: 'inteligencia.agentes', module: 'inteligencia', icon: 'Bot' }),
      leaf({ label: 'Base de Conhecimento', href: '/knowledge', spaceKey: 'inteligencia.knowledge', module: 'gestaoEquipeEquipe', icon: 'BookMarked' }),
    ],
  }),
]

/**
 * Itens do ClickUp do Marcos que NÃO entram no seed, com o motivo (retornados
 * por `ensureNavTree()` p/ evidência/decisão de produto — CLAUDE.md regra #14).
 */
export const NAV_TREE_SEED_EXCLUDED: { item: string; motivo: string }[] = [
  {
    item: 'Encontros & Rituais',
    motivo: 'Não existe rota própria no Performli; NÃO foi criada aba (evitaria link morto).',
  },
  {
    item: 'Listas por cargo (Tarefas Head / Supervisor / CS / Gestores)',
    motivo:
      'São a mesma Central de Tarefas (/operacional) filtrada por responsável — não viram abas duplicadas. Decisão de produto: filtro dentro da tela, não item de navegação.',
  },
]
