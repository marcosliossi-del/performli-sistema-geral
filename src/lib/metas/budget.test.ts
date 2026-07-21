import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetasFromBudget } from './budget'

test('soma os 3 canais em spendGoal e deriva faturamento = soma × roasMinimo', () => {
  const m = computeMetasFromBudget({
    investimentoMeta: 1000,
    investimentoGoogle: 500,
    investimentoTiktok: 500,
    roasMinimo: 3,
  })
  assert.equal(m.spendGoal, 2000)
  assert.equal(m.faturamentoGoal, 6000)
  assert.equal(m.roasGoal, 3)
})

test('sem roasMinimo → só spendGoal (faturamento e roas null)', () => {
  const m = computeMetasFromBudget({
    investimentoMeta: 800,
    investimentoGoogle: 200,
    investimentoTiktok: null,
    roasMinimo: null,
  })
  assert.equal(m.spendGoal, 1000)
  assert.equal(m.faturamentoGoal, null)
  assert.equal(m.roasGoal, null)
})

test('nenhum canal informado → tudo null (não grava SPEND=0)', () => {
  const m = computeMetasFromBudget({
    investimentoMeta: null,
    investimentoGoogle: null,
    investimentoTiktok: null,
    roasMinimo: 4,
  })
  assert.equal(m.spendGoal, null)
  assert.equal(m.faturamentoGoal, null)
  assert.equal(m.roasGoal, 4)
})

test('roasMinimo <= 0 é tratado como não informado', () => {
  const m = computeMetasFromBudget({
    investimentoMeta: 1000,
    investimentoGoogle: null,
    investimentoTiktok: null,
    roasMinimo: 0,
  })
  assert.equal(m.spendGoal, 1000)
  assert.equal(m.faturamentoGoal, null)
  assert.equal(m.roasGoal, null)
})

test('canal parcialmente informado soma só o que existe', () => {
  const m = computeMetasFromBudget({
    investimentoMeta: null,
    investimentoGoogle: 1500,
    investimentoTiktok: null,
    roasMinimo: 2.5,
  })
  assert.equal(m.spendGoal, 1500)
  assert.equal(m.faturamentoGoal, 3750)
  assert.equal(m.roasGoal, 2.5)
})
