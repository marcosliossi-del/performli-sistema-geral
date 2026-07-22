import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetasFromBudget, syncBudgetToTotal } from './budget'

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

// ── syncBudgetToTotal (direção METAS → CLIENTES) ────────────────────────────

test('COM breakdown: reescala proporcional preservando a proporção 70/30', () => {
  const d = syncBudgetToTotal(
    { investimentoMeta: 7000, investimentoGoogle: 3000, investimentoTiktok: null },
    20000, // dobra o total
  )
  assert.equal(d.investimentoMeta, 14000)
  assert.equal(d.investimentoGoogle, 6000)
  assert.equal(d.investimentoTiktok, null)
  // soma bate EXATO com o novo total
  assert.equal((d.investimentoMeta ?? 0) + (d.investimentoGoogle ?? 0), 20000)
})

test('SEM breakdown: joga o total inteiro em investimentoMeta (canal dominante)', () => {
  const d = syncBudgetToTotal(
    { investimentoMeta: null, investimentoGoogle: null, investimentoTiktok: null },
    5000,
  )
  assert.equal(d.investimentoMeta, 5000)
  assert.equal(d.investimentoGoogle, null)
  assert.equal(d.investimentoTiktok, null)
})

test('breakdown com soma zero cai na regra sem-breakdown', () => {
  const d = syncBudgetToTotal(
    { investimentoMeta: 0, investimentoGoogle: 0, investimentoTiktok: null },
    3000,
  )
  assert.equal(d.investimentoMeta, 3000)
})

test('resíduo de arredondamento vai para o maior canal e a soma bate exato', () => {
  // 1000/2000/... proporção que gera dízima ao reescalar → soma deve fechar exato
  const d = syncBudgetToTotal(
    { investimentoMeta: 1000, investimentoGoogle: 2000, investimentoTiktok: 0 },
    10000,
  )
  const soma = (d.investimentoMeta ?? 0) + (d.investimentoGoogle ?? 0) + (d.investimentoTiktok ?? 0)
  assert.equal(soma, 10000)
  // maior canal (google) recebeu o dobro proporcional
  assert.ok((d.investimentoGoogle ?? 0) > (d.investimentoMeta ?? 0))
})
