import type { Role, OperationalRole } from '@prisma/client'

/**
 * Pouso por perfil: cada papel entra na SUA tela, em vez de todos caírem em
 * /dashboard. O operationalRole (rotina Arkza) decide primeiro; se ausente,
 * cai no fallback por RBAC (Role).
 *
 * Este helper é puro — não toca no banco. Recebe os dois valores e devolve
 * a rota-home. `operationalRole` é opcional: sessões antigas (token sem o
 * campo) e usuários sem papel operacional caem no fallback por Role.
 */
export function homeForUser(
  role: Role,
  operationalRole?: OperationalRole | null,
): string {
  switch (operationalRole) {
    case 'CS':
      return '/suporte'
    case 'GESTOR':
    case 'CRM':
    case 'ACOMPANHAMENTO':
      return '/meu-dia'
    case 'SUPERVISOR':
      return '/validacoes'
    case 'HEAD':
      return '/cockpit'
  }

  // Fallback por RBAC quando não há papel operacional definido.
  switch (role) {
    case 'ADMIN':
      return '/cockpit'
    case 'CS':
      return '/suporte'
    case 'MANAGER':
    case 'ANALYST':
      return '/meu-dia'
    default:
      return '/meu-dia'
  }
}
