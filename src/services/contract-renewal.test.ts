import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRenewalDates } from './contract-renewal-dates'

test('renova pelo MESMO período: novo início = fim anterior, novo fim = +duração', () => {
  const start = new Date('2025-01-01T00:00:00.000Z')
  const end   = new Date('2025-07-01T00:00:00.000Z') // ~6 meses
  const { newStart, newEnd } = computeRenewalDates(start, end)
  // Continuidade: começa onde o anterior terminou.
  assert.equal(newStart.toISOString(), end.toISOString())
  // Mesma duração em ms aplicada a partir do fim anterior.
  const duration = end.getTime() - start.getTime()
  assert.equal(newEnd.getTime(), end.getTime() + duration)
})

test('contrato de 1 ano renova por mais 1 ano contíguo', () => {
  const start = new Date('2024-03-10T00:00:00.000Z')
  const end   = new Date('2025-03-10T00:00:00.000Z')
  const { newStart, newEnd } = computeRenewalDates(start, end)
  assert.equal(newStart.toISOString(), '2025-03-10T00:00:00.000Z')
  assert.equal(newEnd.toISOString(), '2026-03-10T00:00:00.000Z')
})
