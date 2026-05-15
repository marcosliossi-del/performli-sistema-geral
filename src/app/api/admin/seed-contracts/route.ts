import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { ContractStatus } from '@prisma/client'

/**
 * POST /api/admin/seed-contracts
 * Seeds contracts from ClickUp data for existing clients.
 * Matches by partial client name (case-insensitive).
 * Safe to run multiple times — skips clients that already have a contract.
 */

type SeedEntry = {
  clientMatch: string   // substring to match against client.name (case insensitive)
  startDate:   string   // YYYY-MM-DD
  endDate:     string   // YYYY-MM-DD
  status:      ContractStatus
}

const SEED_DATA: SeedEntry[] = [
  // ── RENOVAÇÃO ───────────────────────────────────────────────────────────────
  { clientMatch: 'Use Rosa Menta',  startDate: '2025-07-16', endDate: '2026-01-16', status: 'RENOVACAO' },
  { clientMatch: 'My Muse',         startDate: '2025-07-16', endDate: '2026-01-16', status: 'RENOVACAO' },
  { clientMatch: 'Leticia Store',   startDate: '2025-11-04', endDate: '2026-03-04', status: 'RENOVACAO' },
  { clientMatch: 'Lalluzi',         startDate: '2025-11-07', endDate: '2026-05-07', status: 'RENOVACAO' },

  // ── EM VIGOR ─────────────────────────────────────────────────────────────────
  { clientMatch: 'Via Miami',       startDate: '2025-11-20', endDate: '2026-05-20', status: 'VIGENTE' },
  { clientMatch: 'Lamici',          startDate: '2025-11-22', endDate: '2026-05-26', status: 'VIGENTE' },
  { clientMatch: 'Laralu',          startDate: '2025-12-08', endDate: '2026-06-11', status: 'VIGENTE' },
  { clientMatch: 'Boom Closet',     startDate: '2025-12-16', endDate: '2026-06-15', status: 'VIGENTE' },
  { clientMatch: 'Girl Store',      startDate: '2025-12-17', endDate: '2026-06-20', status: 'VIGENTE' },
  { clientMatch: 'Duplo Sentido',   startDate: '2026-01-08', endDate: '2026-07-07', status: 'VIGENTE' },
  { clientMatch: 'Twins',           startDate: '2026-01-22', endDate: '2026-07-26', status: 'VIGENTE' },
  { clientMatch: 'Bambola',         startDate: '2027-01-26', endDate: '2027-07-26', status: 'VIGENTE' },
  { clientMatch: 'Lavinny',         startDate: '2026-01-29', endDate: '2026-08-02', status: 'VIGENTE' },
  { clientMatch: 'Catita',          startDate: '2026-02-05', endDate: '2026-08-09', status: 'VIGENTE' },
  { clientMatch: 'Tuca',            startDate: '2026-03-12', endDate: '2026-06-09', status: 'VIGENTE' },
  { clientMatch: 'Lalolli',         startDate: '2026-03-20', endDate: '2026-09-21', status: 'VIGENTE' },
  { clientMatch: 'New Man',         startDate: '2026-03-24', endDate: '2026-09-28', status: 'VIGENTE' },
  { clientMatch: 'Skaebne',         startDate: '2026-04-01', endDate: '2026-10-03', status: 'VIGENTE' },
  { clientMatch: 'Family Pizzaria', startDate: '2026-05-06', endDate: '2026-11-07', status: 'VIGENTE' },
  { clientMatch: 'Soul By Dm',      startDate: '2026-05-06', endDate: '2026-11-07', status: 'VIGENTE' },
]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load all clients
  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
  })

  // Load clients that already have at least one contract
  const existing = await prisma.contract.findMany({
    select: { clientId: true },
  })
  const alreadyHasContract = new Set(existing.map(c => c.clientId))

  const results: { match: string; clientName: string; status: 'created' | 'skipped_no_match' | 'skipped_has_contract' }[] = []
  let created = 0

  for (const entry of SEED_DATA) {
    // Find matching client (case insensitive substring)
    const match = clients.find(c =>
      c.name.toLowerCase().includes(entry.clientMatch.toLowerCase()) ||
      entry.clientMatch.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
    )

    if (!match) {
      results.push({ match: entry.clientMatch, clientName: '—', status: 'skipped_no_match' })
      continue
    }

    if (alreadyHasContract.has(match.id)) {
      results.push({ match: entry.clientMatch, clientName: match.name, status: 'skipped_has_contract' })
      continue
    }

    await prisma.contract.create({
      data: {
        clientId:  match.id,
        status:    entry.status,
        type:      'FEE_MENSAL',
        feeValue:  0,           // to be filled via bulk fee editor
        startDate: new Date(entry.startDate + 'T00:00:00'),
        endDate:   new Date(entry.endDate   + 'T00:00:00'),
        noticeDays: 30,
      },
    })

    alreadyHasContract.add(match.id) // prevent double-seeding same client
    results.push({ match: entry.clientMatch, clientName: match.name, status: 'created' })
    created++
  }

  return NextResponse.json({
    ok: true,
    created,
    total: SEED_DATA.length,
    results,
  })
}
