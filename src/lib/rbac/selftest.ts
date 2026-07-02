/**
 * RBAC v2 — Self-test puro do Policy Engine.
 *
 * O repositório NÃO tem runner de testes configurado (package.json: sem jest/
 * vitest/node --test). Para não introduzir dependência nova (regra #9) e ainda
 * entregar evidência (regra #14), o engine expõe `runRbacSelfTest()`: uma
 * função PURA que verifica a matriz célula a célula + scope/serialize/fieldGuard
 * e devolve um resumo. O Agente 5 pluga a execução (ex.: script tsx ou rota
 * admin-only). Zero dependência, zero efeito colateral.
 */

import { normalizeRole, ROLE5_ALL, type Role5 } from './roles'
import { can, type Action, type Module } from './permissions'
import { scopeClients, scopeTasks } from './scope'
import { stripSensitive } from './serialize'
import { assertTaskPatchAllowed, isTaskPatchAllowed } from './taskFieldGuard'

export type RbacSelfTestResult = {
  passed: number
  failed: number
  failures: string[]
}

type Case = { name: string; ok: boolean }

/** Matriz esperada, expressa como oráculo independente (não importa da fonte). */
function expectedCan(role: Role5, action: Action, module: Module): boolean {
  const staff: Role5[] = ['ADMIN', 'SUPERVISOR_TRAFEGO', 'ANALISTA_TRAFEGO', 'CS']
  const isStaff = staff.includes(role)
  const isAdmin = role === 'ADMIN'
  const isGestor = role === 'GESTOR_TRAFEGO'
  const crud: Action[] = ['view', 'create', 'update', 'delete']

  switch (module) {
    case 'tarefas':
      if (isStaff) return crud.includes(action)
      if (isGestor) return action === 'view' || action === 'update_status_only'
      return false
    case 'cockpit':
    case 'inteligencia':
      return action === 'view'
    case 'clientes':
    case 'operacao':
    case 'warRoom':
      // staff + gestor têm CRUD (gestor restrito por scope, não por ação)
      return crud.includes(action)
    case 'comercial':
    case 'financeiro':
    case 'juridico':
    case 'gestaoEquipeEquipe':
      return isAdmin && crud.includes(action)
    case 'gestaoEquipeVisaoGestor':
      if (isAdmin) return crud.includes(action)
      return action === 'view' // SUP/ANA/CS/GESTOR: view
    case 'gestaoEquipeMetas':
      if (isAdmin) return crud.includes(action)
      if (isGestor) return false
      return action === 'view' // SUP/ANA/CS
    default:
      return false
  }
}

export function runRbacSelfTest(): RbacSelfTestResult {
  const cases: Case[] = []
  const push = (name: string, ok: boolean) => cases.push({ name, ok })

  const modules: Module[] = [
    'tarefas',
    'cockpit',
    'clientes',
    'operacao',
    'warRoom',
    'comercial',
    'financeiro',
    'juridico',
    'gestaoEquipeVisaoGestor',
    'gestaoEquipeMetas',
    'gestaoEquipeEquipe',
    'inteligencia',
  ]
  const actions: Action[] = ['view', 'create', 'update', 'delete', 'update_status_only']

  // 1. Matriz can() célula a célula contra o oráculo.
  for (const role of ROLE5_ALL) {
    for (const module of modules) {
      for (const action of actions) {
        const got = can(role, action, module)
        const want = expectedCan(role, action, module)
        push(`can(${role},${action},${module})=${got} esperado ${want}`, got === want)
      }
    }
  }

  // 2. normalizeRole (legados).
  push('normalize MANAGER→GESTOR', normalizeRole('MANAGER') === 'GESTOR_TRAFEGO')
  push('normalize ANALYST→ANALISTA', normalizeRole('ANALYST') === 'ANALISTA_TRAFEGO')
  push('normalize ADMIN→ADMIN', normalizeRole('ADMIN') === 'ADMIN')
  push('normalize CS→CS', normalizeRole('CS') === 'CS')
  push(
    'normalize desconhecido lança',
    (() => {
      try {
        normalizeRole('XPTO')
        return false
      } catch {
        return true
      }
    })(),
  )

  // 3. scopeClients / scopeTasks.
  push('scopeClients ADMIN vazio', Object.keys(scopeClients('ADMIN', 'u1')).length === 0)
  push('scopeClients CS vazio', Object.keys(scopeClients('CS', 'u1')).length === 0)
  push(
    'scopeClients GESTOR filtra carteira',
    JSON.stringify(scopeClients('GESTOR_TRAFEGO', 'u1')) ===
      JSON.stringify({ assignments: { some: { userId: 'u1' } } }),
  )
  push('scopeTasks ADMIN vazio', Object.keys(scopeTasks('ADMIN', 'u1')).length === 0)
  push(
    'scopeTasks GESTOR tem OR de 3',
    (() => {
      const w = scopeTasks('GESTOR_TRAFEGO', 'u1') as { OR?: unknown[] }
      return Array.isArray(w.OR) && w.OR.length === 3
    })(),
  )

  // 4. stripSensitive.
  const clientRow = {
    id: 'c1',
    name: 'Loja X',
    feeAmount: 3000,
    contractValue: 4000,
    billingDueDay: 10,
    investimentoMeta: 5000, // budget de mídia — deve permanecer
    faturamentoEsperado: 90000, // performance — deve permanecer
  }
  push('strip Client ADMIN intacto', 'feeAmount' in stripSensitive('ADMIN', 'Client', clientRow))
  {
    const stripped = stripSensitive('CS', 'Client', clientRow)
    push('strip Client CS remove feeAmount', !('feeAmount' in stripped))
    push('strip Client CS remove contractValue', !('contractValue' in stripped))
    push('strip Client CS remove billingDueDay', !('billingDueDay' in stripped))
    push('strip Client CS mantém budget mídia', 'investimentoMeta' in stripped)
    push('strip Client CS mantém faturamentoEsperado', 'faturamentoEsperado' in stripped)
  }
  {
    const contract = { id: 'k1', feeValue: 3000, status: 'VIGENTE' }
    push(
      'strip Contract não-ADMIN esvazia',
      Object.keys(stripSensitive('SUPERVISOR_TRAFEGO', 'Contract', contract)).length === 0,
    )
    push('strip Contract ADMIN intacto', 'feeValue' in stripSensitive('ADMIN', 'Contract', contract))
  }
  {
    const revenueGoal = { id: 'g1', metric: 'FATURAMENTO', targetValue: 100000 }
    const opGoal = { id: 'g2', metric: 'ROAS', targetValue: 3.5 }
    push(
      'strip Goal receita remove targetValue (SUP)',
      !('targetValue' in stripSensitive('SUPERVISOR_TRAFEGO', 'Goal', revenueGoal)),
    )
    push(
      'strip Goal operacional mantém targetValue (SUP)',
      'targetValue' in stripSensitive('SUPERVISOR_TRAFEGO', 'Goal', opGoal),
    )
  }

  // 5. taskFieldGuard.
  push(
    'gestor patch status OK',
    (() => {
      try {
        assertTaskPatchAllowed('GESTOR_TRAFEGO', ['status'])
        return true
      } catch {
        return false
      }
    })(),
  )
  push(
    'gestor patch title lança',
    (() => {
      try {
        assertTaskPatchAllowed('GESTOR_TRAFEGO', ['status', 'title'])
        return false
      } catch {
        return true
      }
    })(),
  )
  push('analista patch qualquer OK', isTaskPatchAllowed('ANALISTA_TRAFEGO', ['title', 'dueDate']))
  push('gestor isTaskPatchAllowed title false', !isTaskPatchAllowed('GESTOR_TRAFEGO', ['title']))

  const failures = cases.filter((c) => !c.ok).map((c) => c.name)
  return {
    passed: cases.length - failures.length,
    failed: failures.length,
    failures,
  }
}
