import 'server-only'

/**
 * Client da WhatsApp Cloud API (Graph API da Meta) para o módulo Conversas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERSÃO DA GRAPH API: v25.0
 * FONTE: doc oficial da Meta consultada via web search em 2026-07-13 —
 *   "Introducing Graph API v25.0 and Marketing API v25.0" (blog oficial
 *   developers.facebook.com, publicado 2026-02-18). v25.0 é a mais recente
 *   estável na data. Shapes de payload/endpoint abaixo seguem a Cloud API
 *   estável; antes do go-live, smoke-test real contra
 *   https://developers.facebook.com/docs/whatsapp/cloud-api :
 *     - POST /{phone_number_id}/messages (envio de texto e template)
 *     - resposta { messages: [{ id: "wamid..." }] }
 *     - regra da janela de atendimento de 24h (texto livre só com janela aberta)
 * A versão é isolada na constante GRAPH_API_VERSION para troca de 1 linha.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * REGRA DE SEGURANÇA: o access token do canal vive CIFRADO em
 * `ConversationChannel.credentials` (AES-256-GCM). Aqui ele é decifrado só em
 * memória, no momento da chamada, e NUNCA é logado (nem em erro).
 * REGRA #6 (CLAUDE.md): toda chamada externa tem timeout — AbortSignal.timeout(15s).
 */

import { decryptSecret } from '@/lib/conversas/crypto'

/** Versão da Graph API (v25.0 = mais recente estável, doc oficial 2026-02-18). */
export const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = 'https://graph.facebook.com'
const REQUEST_TIMEOUT_MS = 15_000

/** Janela de atendimento (customer service window) do WhatsApp: 24 horas. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Formato do JSON cifrado em `ConversationChannel.credentials`.
 * Mantido mínimo de propósito — só o necessário para enviar.
 */
export interface ChannelCredentials {
  /** Token de acesso permanente/system-user da WABA (Bearer). NUNCA logar. */
  accessToken: string
}

/** Subconjunto do ConversationChannel que este client precisa. */
export interface ChannelForSend {
  id: string
  phoneNumberId: string | null
  credentials: string // cifrado
}

/** Subconjunto do Conversation necessário para calcular a janela de 24h. */
export interface ConversationWindowInput {
  lastInboundAt: Date | null
}

/** Estado da janela de 24h — consumido pela UI (Fase 2) e pelo guard de envio. */
export interface WindowState {
  /** true se a janela de atendimento de 24h está aberta. */
  open: boolean
  /** Minutos restantes até fechar (0 se fechada). */
  minutesRemaining: number
  /** Quando a janela fecha (null se já fechada / nunca houve inbound). */
  closesAt: Date | null
}

/**
 * Erro tipado das chamadas à Cloud API. `code` = código de erro da Meta (quando
 * disponível), `status` = HTTP status. Mensagem SEMPRE em pt-BR e SEM segredo.
 */
export class ConversasApiError extends Error {
  readonly code: string | number | null
  readonly status: number | null

  constructor(message: string, opts: { code?: string | number | null; status?: number | null } = {}) {
    super(message)
    this.name = 'ConversasApiError'
    this.code = opts.code ?? null
    this.status = opts.status ?? null
  }
}

/**
 * Helper PURO: a janela de atendimento de 24h está aberta?
 * Base = lastInboundAt + 24h. Sem inbound registrado → fechada.
 */
export function getWindowState(
  conversation: ConversationWindowInput,
  now: Date = new Date(),
): WindowState {
  const last = conversation.lastInboundAt
  if (!last) {
    return { open: false, minutesRemaining: 0, closesAt: null }
  }
  const closesAt = new Date(last.getTime() + WHATSAPP_WINDOW_MS)
  const remainingMs = closesAt.getTime() - now.getTime()
  if (remainingMs <= 0) {
    return { open: false, minutesRemaining: 0, closesAt }
  }
  return {
    open: true,
    minutesRemaining: Math.ceil(remainingMs / 60_000),
    closesAt,
  }
}

/** Decifra e valida o token do canal. Erros pt-BR, sem vazar conteúdo. */
function resolveAccessToken(channel: ChannelForSend): string {
  let creds: ChannelCredentials
  try {
    const raw = decryptSecret(channel.credentials)
    creds = JSON.parse(raw) as ChannelCredentials
  } catch {
    // Não repassa a causa crua (pode conter fragmento sensível).
    throw new ConversasApiError(
      'Não foi possível ler as credenciais do canal (formato inválido ou chave de criptografia ausente).',
    )
  }
  if (!creds?.accessToken || typeof creds.accessToken !== 'string') {
    throw new ConversasApiError('Canal sem token de acesso configurado.')
  }
  return creds.accessToken
}

/**
 * Extrai mensagem/código de erro da resposta da Graph API sem vazar segredo.
 * Formato Meta: { error: { message, code, error_subcode, type } }.
 */
function parseGraphError(json: unknown, status: number): ConversasApiError {
  const err = (json as { error?: { message?: string; code?: number } } | null)?.error
  const metaMsg = err?.message
  const code = err?.code ?? null
  return new ConversasApiError(
    metaMsg
      ? `A Meta recusou o envio: ${metaMsg}`
      : `Falha ao enviar mensagem pelo WhatsApp (HTTP ${status}).`,
    { code, status },
  )
}

/**
 * Envia uma mensagem de TEXTO livre pela Cloud API.
 * PRÉ-CONDIÇÃO: a janela de 24h deve estar aberta — este guard é reforçado no
 * caller (server action) e aqui é assumido. Retorna o wa message id (wamid...).
 *
 * @throws ConversasApiError em erro de credencial, rede/timeout ou recusa da Meta.
 */
export async function sendTextMessage(
  channel: ChannelForSend,
  toPhone: string,
  body: string,
): Promise<string> {
  if (!channel.phoneNumberId) {
    throw new ConversasApiError('Canal sem phoneNumberId — configuração incompleta.')
  }
  const accessToken = resolveAccessToken(channel)
  const url = `${GRAPH_BASE}/${GRAPH_API_VERSION}/${channel.phoneNumberId}/messages`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    // Timeout do AbortSignal chega como DOMException 'TimeoutError'.
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    throw new ConversasApiError(
      isTimeout
        ? 'Tempo esgotado ao falar com o WhatsApp (15s). Tente novamente.'
        : 'Não foi possível conectar ao WhatsApp. Verifique a conexão e tente novamente.',
    )
  }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok) {
    throw parseGraphError(json, res.status)
  }

  const messageId = (json as { messages?: Array<{ id?: string }> } | null)?.messages?.[0]?.id
  if (!messageId) {
    throw new ConversasApiError('WhatsApp aceitou a requisição mas não retornou o id da mensagem.', {
      status: res.status,
    })
  }
  return messageId
}

/**
 * Envio de TEMPLATE aprovado (para uso FORA da janela de 24h).
 * Assinatura preparada para a Fase 3 — NÃO implementado nesta fatia.
 */
export async function sendTemplateMessage(
  _channel: ChannelForSend,
  _toPhone: string,
  _templateName: string,
  _language: string,
  _variables?: string[],
): Promise<string> {
  throw new ConversasApiError('Envio de template ainda não disponível (Fase 3).')
}
