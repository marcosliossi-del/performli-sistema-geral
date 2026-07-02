import type { StatusGroup, TaskStatus, TaskPriority } from '@prisma/client'

/**
 * Tokens de domínio do módulo Tasks.
 *
 * REGRA DE COR: nenhum hex novo. As cores saem SEMPRE das variáveis --ak-* do
 * design system (globals.css). Onde a cor é dinâmica (dot do status custom,
 * avatar determinístico, tag por hash) usamos `var(--ak-...)` inline, nunca hex.
 */

// Paleta de sinal reaproveitável (apenas --ak-* existentes)
export const AK = {
  brand: 'var(--ak-brand)',
  brand2: 'var(--ak-brand-2)',
  green: 'var(--ak-green)',
  amber: 'var(--ak-amber)',
  red: 'var(--ak-red)',
  orange: 'var(--ak-orange)',
  violet: 'var(--ak-violet)',
  low: 'var(--ak-low)',
  mid: 'var(--ak-mid)',
  hi: 'var(--ak-hi)',
} as const

// ─── Status legado (enum TaskStatus) → label operacional + cor + grupo ─────────
// Mapa de grupo conforme D-004 (DECISIONS.md).
export const LEGACY_STATUS: Record<
  TaskStatus,
  { label: string; color: string; group: StatusGroup }
> = {
  A_FAZER: { label: 'A fazer', color: AK.low, group: 'NOT_STARTED' },
  EM_ANDAMENTO: { label: 'Em andamento', color: AK.brand, group: 'ACTIVE' },
  AGUARDANDO_CLIENTE: { label: 'Aguardando cliente', color: AK.amber, group: 'ACTIVE' },
  AGUARDANDO_GESTOR: { label: 'Aguardando gestor', color: AK.amber, group: 'ACTIVE' },
  AGUARDANDO_CS: { label: 'Aguardando CS', color: AK.amber, group: 'ACTIVE' },
  EM_VALIDACAO: { label: 'Em validação', color: AK.violet, group: 'ACTIVE' },
  AJUSTES_SOLICITADOS: { label: 'Ajustes solicitados', color: AK.orange, group: 'ACTIVE' },
  BLOQUEADO: { label: 'Bloqueado', color: AK.red, group: 'ACTIVE' },
  ATRASADO: { label: 'Atrasado', color: AK.red, group: 'ACTIVE' },
  CONCLUIDO: { label: 'Concluído', color: AK.green, group: 'DONE' },
  CANCELADO: { label: 'Cancelado', color: AK.low, group: 'CLOSED' },
}

// Grupos que representam tarefa encerrada (recebem check).
export const CLOSED_GROUPS: StatusGroup[] = ['DONE', 'CLOSED']

// ─── Prioridade → label operacional + classe utilitária de cor ─────────────────
export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; textClass: string; color: string }
> = {
  CRITICA: { label: 'Urgente', textClass: 'text-danger', color: AK.red },
  ALTA: { label: 'Alta', textClass: 'text-warning', color: AK.amber },
  MEDIA: { label: 'Normal', textClass: 'text-info', color: AK.brand },
  BAIXA: { label: 'Baixa', textClass: 'text-text-low', color: AK.low },
}

// Ordem de exibição (mais crítico primeiro) para dropdowns de prioridade.
export const PRIORITY_ORDER: TaskPriority[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA']

// ─── Avatar: cor determinística por userId ─────────────────────────────────────
const AVATAR_PALETTE = [
  AK.brand,
  AK.green,
  AK.amber,
  AK.violet,
  AK.orange,
  AK.red,
  AK.brand2,
] as const

/** Hash estável (djb2) → índice. Mesmo id sempre gera a mesma cor. */
export function stableHash(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i)
  }
  return Math.abs(h)
}

export function avatarColor(userId: string): string {
  return AVATAR_PALETTE[stableHash(userId) % AVATAR_PALETTE.length]
}

/** Iniciais a partir do nome (até 2 letras). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Tag: cor suave determinística por texto ───────────────────────────────────
// Retorna cor base (var --ak-*) que a TagChip usa com baixa opacidade.
const TAG_PALETTE = [AK.brand, AK.green, AK.amber, AK.violet, AK.orange, AK.brand2] as const

export function tagColor(label: string): string {
  return TAG_PALETTE[stableHash(label) % TAG_PALETTE.length]
}
