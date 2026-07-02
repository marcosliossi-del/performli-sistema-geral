'use client'

import { useNav } from '@/components/layout/nav-context'
import {
  can,
  normalizeRole,
  roleLabel,
  type Action,
  type Module,
  type Role5,
} from '@/lib/rbac'

export type UsePermissions = {
  /** Papel canônico efetivo (respeita a prévia GESTOR do ADMIN no TopNav). */
  role5: Role5
  /** Rótulo amigável do papel efetivo. */
  label: string
  /** Espelha o policy engine: mesma matriz do backend, deny-by-default. */
  can: (action: Action, module: Module) => boolean
}

/**
 * Hook client de permissões — expõe a MESMA matriz do policy engine
 * (`src/lib/rbac`) para componentes de UI. NÃO é barreira de segurança (o
 * backend já barra); serve para esconder/desabilitar ações que o papel não pode
 * executar, melhorando a UX.
 *
 * O papel vem do `NavProvider` (sessão), então este hook só funciona dentro do
 * `DashboardShell`. A prévia "GESTOR" do ADMIN (viewMode) é respeitada: ela só
 * REBAIXA privilégios (ADMIN→GESTOR_TRAFEGO), nunca eleva — seguro para gating.
 */
export function usePermissions(): UsePermissions {
  const { role, viewMode } = useNav()
  const base = normalizeRole(role)
  const role5: Role5 =
    base === 'ADMIN' && viewMode === 'GESTOR' ? 'GESTOR_TRAFEGO' : base

  return {
    role5,
    label: roleLabel(role5),
    can: (action: Action, module: Module) => can(role5, action, module),
  }
}
