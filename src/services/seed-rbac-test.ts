/**
 * Seed de TESTE do RBAC v2 (Agente 1 — Domínio & Schema).
 *
 * Cria/atualiza 1 usuário para cada um dos 5 papéis da matriz oficial
 * (ADMIN, SUPERVISOR_TRAFEGO, ANALISTA_TRAFEGO, CS, GESTOR_TRAFEGO) com e-mails
 * do domínio de teste `@teste.arkza.com.br`, e atribui 2 clientes de carteira
 * ao GESTOR de teste (posse via ClientAssignment) para exercitar as regras de
 * ownership dos Agentes 2/3/4.
 *
 * NÃO usar em produção com dados reais — é infraestrutura de teste. Os e-mails
 * de teste são isoláveis por sufixo `@teste.arkza.com.br`.
 *
 * IDEMPOTENTE:
 *  - User: upsert por `email` (chave natural). passwordHash de usuário já
 *    existente NUNCA é sobrescrito (só o papel/nome são reconciliados).
 *  - ClientAssignment: upsert por (clientId,userId) — o mesmo unique do model.
 *
 * Segurança: a senha é gerada de SENHA_TESTE_RBAC (env) ou, na ausência, de uma
 * senha aleatória forte (crypto.randomBytes) — nunca previsível hardcoded.
 */

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { Role } from '@prisma/client'

const TEST_EMAIL_DOMAIN = '@teste.arkza.com.br'

type SeedRbacUser = {
  name: string
  email: string
  role: Role
}

const TEST_USERS: SeedRbacUser[] = [
  { name: 'RBAC Teste — Admin',      email: `admin${TEST_EMAIL_DOMAIN}`,      role: 'ADMIN' },
  { name: 'RBAC Teste — Supervisor', email: `supervisor${TEST_EMAIL_DOMAIN}`, role: 'SUPERVISOR_TRAFEGO' },
  { name: 'RBAC Teste — Analista',   email: `analista${TEST_EMAIL_DOMAIN}`,   role: 'ANALISTA_TRAFEGO' },
  { name: 'RBAC Teste — CS',         email: `cs${TEST_EMAIL_DOMAIN}`,         role: 'CS' },
  { name: 'RBAC Teste — Gestor',     email: `gestor${TEST_EMAIL_DOMAIN}`,     role: 'GESTOR_TRAFEGO' },
]

const GESTOR_TEST_EMAIL = `gestor${TEST_EMAIL_DOMAIN}`

export type SeedRbacTestResult = {
  usersUpserted: { email: string; role: Role }[]
  gestorId: string | null
  assignedClientIds: string[]
  note: string
}

export async function seedRbacTest(): Promise<SeedRbacTestResult> {
  const usersUpserted: { email: string; role: Role }[] = []
  let gestorId: string | null = null

  for (const u of TEST_USERS) {
    // passwordHash só é gerado para usuário NOVO (não sobrescreve existente).
    const plain = process.env.SENHA_TESTE_RBAC ?? randomBytes(24).toString('hex')
    const passwordHash = await bcrypt.hash(plain, 12)

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, active: true },
      create: { name: u.name, email: u.email, role: u.role, passwordHash, active: true },
      select: { id: true, email: true, role: true },
    })

    usersUpserted.push({ email: user.email, role: user.role })
    if (user.email === GESTOR_TEST_EMAIL) gestorId = user.id
  }

  // ── Posse: 2 clientes de carteira atribuídos ao GESTOR de teste ──────────────
  const assignedClientIds: string[] = []
  let note = ''

  if (gestorId) {
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      take: 2,
      select: { id: true },
    })

    if (clients.length < 2) {
      note = `Apenas ${clients.length} cliente(s) ATIVO(s) encontrado(s) — atribuídos os disponíveis.`
    }

    for (const c of clients) {
      await prisma.clientAssignment.upsert({
        where: { clientId_userId: { clientId: c.id, userId: gestorId } },
        update: {},
        create: { clientId: c.id, userId: gestorId, isPrimary: false },
      })
      assignedClientIds.push(c.id)
    }
  } else {
    note = 'Gestor de teste não resolvido — atribuição de posse ignorada.'
  }

  return { usersUpserted, gestorId, assignedClientIds, note }
}
