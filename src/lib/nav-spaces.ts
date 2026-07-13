/**
 * Mapa canônico de "espaços" da navegação (spaceKey → rótulo + hrefs reais).
 *
 * Um "espaço" é uma unidade de controle de acesso da ACL de navegação
 * (`NavSpaceMode` / `NavSpaceAccess`). Dois tipos:
 *   • GRUPO  — um bloco colapsável da sidebar (clientes, operacao, risco,
 *     comercial, administrativo, inteligencia). Cobre TODAS as leaves filhas.
 *   • LEAF   — um link individual (ex.: 'clientes.checkins' → /check-ins).
 *   • FIXO   — leaves de topo sem grupo, tratadas como espaço próprio
 *     ('meu-dia', 'cockpit') para poderem ser restringidas isoladamente.
 *
 * Este módulo é PURO (sem I/O, sem server-only) — pode ser importado por
 * client e server. Os hrefs foram derivados 1:1 do `navigation[]` atual de
 * `src/components/layout/Sidebar.tsx`. Ao mexer na sidebar, atualizar aqui.
 *
 * IMPORTANTE: os hrefs de GRUPO propositalmente incluem TODOS os hrefs das
 * leaves filhas — assim `spaceKeyForPath` sempre encontra o grupo de um path,
 * mesmo quando a rota bate só numa leaf.
 */

import type { Role5 } from './rbac/roles'

export type NavSpaceKind = 'group' | 'leaf' | 'fixed'

export type NavSpaceDef = {
  /** Identificador canônico e estável do espaço (chave no banco). */
  key: string
  /** Rótulo operacional pt-BR (usado no modal do ADMIN). */
  label: string
  kind: NavSpaceKind
  /** Hrefs cobertos por este espaço (grupo = união das leaves filhas). */
  hrefs: string[]
  /** spaceKey do grupo pai (só para leaves de grupo). */
  group?: string
}

/** Definição das leaves por grupo — fonte única para derivar tudo abaixo. */
type LeafSeed = { key: string; label: string; href: string }

const CLIENTES_LEAVES: LeafSeed[] = [
  { key: 'clientes.lista', label: 'Clientes', href: '/clients' },
  { key: 'clientes.checkins', label: 'Check-ins da semana', href: '/check-ins' },
  { key: 'clientes.validacoes', label: 'Validação da CS', href: '/validacoes' },
  { key: 'clientes.suporte', label: 'Hub de Suporte', href: '/suporte' },
  { key: 'clientes.canais', label: 'Central de Comunicação', href: '/canais' },
  { key: 'clientes.reports', label: 'Relatórios', href: '/reports' },
  { key: 'clientes.portal-acessos', label: 'Acessos do Portal', href: '/portal-acessos' },
]

const OPERACAO_LEAVES: LeafSeed[] = [
  { key: 'operacao.tarefas', label: 'Central de Tarefas', href: '/operacional' },
  { key: 'operacao.aceite', label: 'Aceite Operacional', href: '/aceite' },
  { key: 'operacao.processos', label: 'Processos & POPs', href: '/processos' },
  { key: 'operacao.recorrencias', label: 'Rotinas & Recorrências', href: '/recorrencias' },
  { key: 'operacao.operations', label: 'Registro de Operações', href: '/operations' },
]

const RISCO_LEAVES: LeafSeed[] = [
  { key: 'risco.warroom', label: 'War Room', href: '/anti-churn' },
  { key: 'risco.alertas', label: 'Alertas', href: '/alerts' },
]

const COMERCIAL_LEAVES: LeafSeed[] = [
  { key: 'comercial.funil', label: 'Funil de Vendas (Leads)', href: '/comercial' },
  { key: 'comercial.pipeline', label: 'Estágio da Carteira', href: '/pipeline' },
  { key: 'comercial.dashboard', label: 'Dashboard Comercial', href: '/comercial/dashboard' },
  { key: 'comercial.proposta', label: 'Gerador de Proposta', href: '/comercial/proposta' },
  { key: 'comercial.conversas', label: 'Conversas', href: '/conversas' },
]

const ADMINISTRATIVO_LEAVES: LeafSeed[] = [
  { key: 'administrativo.financeiro', label: 'DRE — Financeiro', href: '/financeiro' },
  { key: 'administrativo.juridico', label: 'Jurídico & Contratos', href: '/juridico' },
  { key: 'administrativo.metas', label: 'Metas da Agência', href: '/agency/metas' },
  { key: 'administrativo.equipe', label: 'Equipe', href: '/team' },
  { key: 'administrativo.assignments', label: 'Atribuições de Clientes', href: '/managers/assignments' },
  { key: 'administrativo.ceo', label: 'Visão CEO', href: '/agency' },
  { key: 'administrativo.gestor', label: 'Visão Gestor', href: '/managers' },
]

const INTELIGENCIA_LEAVES: LeafSeed[] = [
  { key: 'inteligencia.agentes', label: 'Agentes IA', href: '/ai-agents' },
  { key: 'inteligencia.knowledge', label: 'Base de Conhecimento', href: '/knowledge' },
]

type GroupSeed = { key: string; label: string; leaves: LeafSeed[] }

const GROUPS: GroupSeed[] = [
  { key: 'clientes', label: 'Clientes', leaves: CLIENTES_LEAVES },
  { key: 'operacao', label: 'Operação', leaves: OPERACAO_LEAVES },
  { key: 'risco', label: 'Risco', leaves: RISCO_LEAVES },
  { key: 'comercial', label: 'Comercial', leaves: COMERCIAL_LEAVES },
  { key: 'administrativo', label: 'Administrativo', leaves: ADMINISTRATIVO_LEAVES },
  { key: 'inteligencia', label: 'Inteligência', leaves: INTELIGENCIA_LEAVES },
]

/** Leaves fixas de topo (sem grupo) — restringíveis isoladamente. */
const FIXED: NavSpaceDef[] = [
  { key: 'meu-dia', label: 'Meu Dia', kind: 'fixed', hrefs: ['/meu-dia'] },
  { key: 'cockpit', label: 'Cockpit', kind: 'fixed', hrefs: ['/cockpit'] },
]

/** Todos os espaços, indexados por key. Ordem: fixos → (grupo, suas leaves). */
export const NAV_SPACES: NavSpaceDef[] = [
  ...FIXED,
  ...GROUPS.flatMap((g): NavSpaceDef[] => {
    const groupHrefs = g.leaves.map((l) => l.href)
    const groupDef: NavSpaceDef = {
      key: g.key,
      label: g.label,
      kind: 'group',
      hrefs: groupHrefs,
    }
    const leafDefs: NavSpaceDef[] = g.leaves.map((l) => ({
      key: l.key,
      label: l.label,
      kind: 'leaf',
      hrefs: [l.href],
      group: g.key,
    }))
    return [groupDef, ...leafDefs]
  }),
]

/** Índice key → def (O(1)). */
export const NAV_SPACE_BY_KEY: Record<string, NavSpaceDef> = Object.fromEntries(
  NAV_SPACES.map((s) => [s.key, s]),
)

/** Todas as keys canônicas de espaço. */
export const NAV_SPACE_KEYS: string[] = NAV_SPACES.map((s) => s.key)

function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * spaceKeys que governam um pathname, do MAIS ESPECÍFICO ao mais amplo:
 *   [leafKey?, groupKey?]  ou  [fixedKey]  ou  [].
 *
 * A leaf é escolhida por prefixo mais longo (desempata /comercial vs
 * /comercial/dashboard). O grupo pai é sempre incluído em segundo lugar. Fixos
 * retornam só a própria key.
 */
export function spaceKeyForPath(pathname: string): string[] {
  // Fixos primeiro (exatos por natureza).
  for (const f of FIXED) {
    if (matchesHref(pathname, f.hrefs[0])) return [f.key]
  }

  // Melhor leaf por prefixo mais longo.
  let bestLeaf: NavSpaceDef | null = null
  let bestLen = -1
  for (const s of NAV_SPACES) {
    if (s.kind !== 'leaf') continue
    const href = s.hrefs[0]
    if (matchesHref(pathname, href) && href.length > bestLen) {
      bestLeaf = s
      bestLen = href.length
    }
  }

  if (bestLeaf) {
    return bestLeaf.group ? [bestLeaf.key, bestLeaf.group] : [bestLeaf.key]
  }
  return []
}

/**
 * Contrato para a FATIA DE UI (Sidebar / CommandPalette client-side).
 *
 * Recebe o `Record<spaceKey, boolean>` serializado (do servidor, via
 * `serializeOverrides` em nav-access.ts) + papel canônico + spaceKey do item.
 * Devolve:
 *   • true/false → o override custom decide (o item aparece ou não).
 *   • null       → não há override para este espaço; o chamador deve usar
 *     `can(role, 'view', module)` (matriz RBAC, comportamento atual).
 *
 * ADMIN → sempre true (vê tudo). Puro e client-safe (mora aqui, não em
 * nav-access.ts que é server-only).
 */
export function filterNavByOverrides(
  role: Role5,
  spaceKey: string,
  overrides: Record<string, boolean>,
): boolean | null {
  if (role === 'ADMIN') return true
  if (!(spaceKey in overrides)) return null
  return overrides[spaceKey]
}
