import { prisma } from './prisma'

export type RateLimitResult = { allowed: boolean; retryAfterSec: number }

/**
 * Rate limiting por janela fixa (fixed-window), persistido no PostgreSQL para
 * funcionar em ambiente serverless (sem memória compartilhada entre instâncias).
 *
 * O incremento é atômico via UPSERT com CASE — se a janela virou, reinicia a
 * contagem; senão soma 1. Retorna { allowed:false, retryAfterSec } quando o
 * limite é ultrapassado dentro da janela.
 *
 * Fail-open: se o próprio limiter falhar (ex.: hiccup do banco), NÃO bloqueia o
 * usuário legítimo — retorna allowed:true. Rate limit é defesa, não gate crítico.
 *
 * @param key       identificador do bucket (ex.: `login:email:ip`)
 * @param limit     número máximo de eventos permitidos na janela
 * @param windowMs  tamanho da janela em milissegundos
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const nowDate = new Date(now)

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart", "updatedAt")
      VALUES (${key}, 1, ${windowStart}, ${nowDate})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" = ${windowStart} THEN "RateLimit"."count" + 1
          ELSE 1
        END,
        "windowStart" = ${windowStart},
        "updatedAt" = ${nowDate}
      RETURNING "count";`

    const count = Number(rows[0]?.count ?? 1)
    if (count > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000))
      return { allowed: false, retryAfterSec }
    }
    return { allowed: true, retryAfterSec: 0 }
  } catch (err) {
    // Fail-open: falha do limiter não pode derrubar o login/endpoint.
    console.error('[rate-limit] falha ao verificar limite:', err)
    return { allowed: true, retryAfterSec: 0 }
  }
}
