import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * State assinado do OAuth da Nuvemshop.
 *
 * O `state` do OAuth é a única barreira entre o callback público e a criação de
 * PlatformAccount/Client. Sem assinatura, qualquer um pode forjar `clientId` e
 * vincular uma loja arbitrária. Assinamos com HMAC-SHA256 e validamos de forma
 * timing-safe, com janela de validade (TTL) para evitar replay.
 */

export type NuvemshopState = {
  clientId?: string
  userId: string
  /** epoch ms de emissão */
  ts: number
}

const STATE_TTL_MS = 15 * 60 * 1000 // 15 minutos

/**
 * Segredo dedicado; cai para CRON_SECRET como compatibilidade. Retorna null se
 * nenhum estiver configurado — o caller decide (em produção, negar).
 */
function getStateSecret(): string | null {
  return process.env.NUVEMSHOP_STATE_SECRET || process.env.CRON_SECRET || null
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * Gera um state assinado. Lança se não houver segredo configurado.
 */
export function createSignedState(data: { clientId?: string; userId: string }): string {
  const secret = getStateSecret()
  if (!secret) {
    throw new Error('Integração indisponível: segredo de assinatura do OAuth não configurado.')
  }
  const payload: NuvemshopState = { ...data, ts: Date.now() }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

/**
 * Valida um state assinado. Retorna o payload se válido; null caso contrário
 * (assinatura ausente/inválida, expirado, ou segredo não configurado).
 */
export function verifySignedState(stateParam: string | null | undefined): NuvemshopState | null {
  if (!stateParam) return null
  const secret = getStateSecret()
  if (!secret) return null // sem segredo → em produção o caller nega o acesso

  const dot = stateParam.lastIndexOf('.')
  if (dot <= 0) return null

  const payloadB64 = stateParam.slice(0, dot)
  const providedSig = stateParam.slice(dot + 1)
  const expectedSig = sign(payloadB64, secret)

  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: NuvemshopState
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as NuvemshopState
  } catch {
    return null
  }

  if (typeof payload.ts !== 'number' || Date.now() - payload.ts > STATE_TTL_MS) return null
  if (!payload.userId) return null

  return payload
}

/** True quando há segredo configurado (para bloquear em produção quando ausente). */
export function hasStateSecret(): boolean {
  return getStateSecret() !== null
}
