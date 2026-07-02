/**
 * RBAC v2 — Papéis canônicos (5 roles) e normalização de legados.
 *
 * O enum Prisma `Role` (schema/banco) ainda contém os valores legados MANAGER e
 * ANALYST (DECISIONS.md D-011): a remoção de valor de enum é destrutiva, então
 * eles permanecem até uma limpeza futura. Todo o Policy Engine trabalha apenas
 * com os 5 papéis canônicos — a fronteira de entrada normaliza os legados via
 * `normalizeRole()`. Nenhuma outra parte do engine deve comparar com literais
 * 'MANAGER'/'ANALYST'.
 *
 * Equivalências: MANAGER ≡ GESTOR_TRAFEGO · ANALYST ≡ ANALISTA_TRAFEGO.
 */

import type { Role } from '@prisma/client'

/** Os 5 papéis canônicos da matriz oficial RBAC v2. */
export type Role5 =
  | 'ADMIN'
  | 'SUPERVISOR_TRAFEGO'
  | 'ANALISTA_TRAFEGO'
  | 'CS'
  | 'GESTOR_TRAFEGO'

/** Lista imutável dos papéis canônicos (útil para varreduras/self-test). */
export const ROLE5_ALL = [
  'ADMIN',
  'SUPERVISOR_TRAFEGO',
  'ANALISTA_TRAFEGO',
  'CS',
  'GESTOR_TRAFEGO',
] as const satisfies readonly Role5[]

/**
 * Converte um papel do enum Prisma `Role` (que pode conter legados) para o
 * papel canônico correspondente. Deny-by-default de identidade: qualquer valor
 * desconhecido cai para o papel de menor privilégio real (ANALISTA_TRAFEGO)
 * NÃO — em vez disso lançamos, porque um papel não reconhecido é um erro de
 * dados, não uma condição de negócio silenciável.
 */
export function normalizeRole(role: Role | string): Role5 {
  switch (role) {
    case 'MANAGER':
    case 'GESTOR_TRAFEGO':
      return 'GESTOR_TRAFEGO'
    case 'ANALYST':
    case 'ANALISTA_TRAFEGO':
      return 'ANALISTA_TRAFEGO'
    case 'SUPERVISOR_TRAFEGO':
      return 'SUPERVISOR_TRAFEGO'
    case 'CS':
      return 'CS'
    case 'ADMIN':
      return 'ADMIN'
    default:
      throw new Error(`Papel de usuário não reconhecido: ${String(role)}`)
  }
}

/** Type guard para papel canônico. */
export function isRole5(value: unknown): value is Role5 {
  return (
    typeof value === 'string' &&
    (ROLE5_ALL as readonly string[]).includes(value)
  )
}
