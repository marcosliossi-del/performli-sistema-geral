import 'server-only'
import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Autorização compartilhada das rotas de cron (R do security-review):
 * comparação TIMING-SAFE do CRON_SECRET (=== vaza tempo de comparação).
 * Fail-closed: sem CRON_SECRET configurado, tudo é negado.
 * Aceita `Authorization: Bearer <secret>` OU header `x-cron-secret`.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const provided = bearer ?? request.headers.get('x-cron-secret')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual exige buffers do mesmo tamanho; comparar tamanhos não vaza
  // o conteúdo do segredo.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
