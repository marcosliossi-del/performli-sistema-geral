/**
 * RBAC v2 — Serialização com recorte de campos sensíveis (row → colunas).
 *
 * `stripSensitive()` remove os campos financeiros/comerciais de um registro
 * (ou lista) para papéis não-ADMIN, segundo `sensitiveFields.ts`. Função PURA,
 * sem `any`: usa generics e devolve `Partial<T>` (campos podem ter sido
 * removidos). ADMIN recebe o objeto intacto.
 *
 * Composição: can() (ação) → scope (linhas) → stripSensitive (colunas).
 */

import type { Role5 } from './roles'
import {
  SENSITIVE_FIELDS,
  isFullySensitiveModel,
  isRevenueMetric,
  type SensitiveModel,
} from './sensitiveFields'

/** Registro genérico serializável (chaves string). */
type Record_ = Record<string, unknown>

/**
 * Remove campos sensíveis de `data` para não-ADMIN.
 *
 * - ADMIN → retorna `data` sem alteração.
 * - Model `'*'` (Contract/Asaas/Expense) → retorna `{}` (nada vaza).
 * - Goal → só remove `targetValue` quando `data.metric` é métrica de receita;
 *   metas operacionais permanecem intactas.
 * - Demais models → remove os campos listados.
 *
 * Aceita objeto único; para listas use `stripSensitiveMany`.
 */
export function stripSensitive<T extends Record_>(
  role: Role5,
  model: SensitiveModel,
  data: T,
): Partial<T> {
  if (role === 'ADMIN') return data

  // Model inteiramente sensível: nada deve vazar.
  if (isFullySensitiveModel(model)) return {}

  const fields = SENSITIVE_FIELDS[model]
  const out: Partial<T> = { ...data }

  for (const field of fields) {
    if (field === '*') continue // já tratado acima
    // Regra especial de Goal: targetValue só é sensível em metas de receita.
    if (model === 'Goal' && field === 'targetValue') {
      const metric = out['metric']
      if (typeof metric === 'string' && !isRevenueMetric(metric)) {
        continue // meta operacional → mantém o valor
      }
    }
    delete out[field as keyof T]
  }

  return out
}

/** Versão para listas — aplica `stripSensitive` a cada item. */
export function stripSensitiveMany<T extends Record_>(
  role: Role5,
  model: SensitiveModel,
  rows: readonly T[],
): Partial<T>[] {
  return rows.map((row) => stripSensitive(role, model, row))
}
