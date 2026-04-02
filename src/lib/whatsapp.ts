/**
 * WhatsApp via Z-API (https://z-api.io)
 *
 * Variáveis de ambiente necessárias:
 *   ZAPI_INSTANCE_ID      — ID da instância Z-API
 *   ZAPI_TOKEN            — Token da instância
 *   ZAPI_CLIENT_TOKEN     — Client-Token (header de segurança, opcional)
 *
 * Destinatários (pelo menos um):
 *   WHATSAPP_GROUP_ID     — ID do grupo (ex: 120363XXXXXXXXXXXXXXXXXX@g.us)
 *                           Prioridade sobre números individuais.
 *   WHATSAPP_NOTIFY_NUMBERS — números separados por vírgula: 5511999999999
 *                             Usado como fallback se GROUP_ID não estiver definido.
 */

const ZAPI_BASE = 'https://api.z-api.io/instances'

function baseHeaders() {
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  return {
    'Content-Type': 'application/json',
    ...(clientToken ? { 'Client-Token': clientToken } : {}),
  }
}

function endpoint(path: string) {
  const id    = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  return `${ZAPI_BASE}/${id}/token/${token}/${path}`
}

/** Envia mensagem para um número ou ID de grupo */
export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!process.env.ZAPI_INSTANCE_ID || !process.env.ZAPI_TOKEN) {
    console.warn('[whatsapp] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados.')
    return false
  }

  try {
    const res = await fetch(endpoint('send-text'), {
      method:  'POST',
      headers: baseHeaders(),
      body:    JSON.stringify({ phone, message }),
    })

    if (!res.ok) {
      console.error(`[whatsapp] Erro ao enviar para ${phone}: HTTP ${res.status} — ${await res.text()}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[whatsapp] Falha inesperada ao enviar para ${phone}:`, err)
    return false
  }
}

/**
 * Envia para o grupo configurado em WHATSAPP_GROUP_ID.
 * Se não houver grupo, usa WHATSAPP_NOTIFY_NUMBERS (lista de números).
 * Retorna quantos envios foram bem-sucedidos.
 */
export async function broadcastWhatsApp(message: string): Promise<number> {
  const groupId = process.env.WHATSAPP_GROUP_ID?.trim()

  if (groupId) {
    const ok = await sendWhatsApp(groupId, message)
    return ok ? 1 : 0
  }

  const raw = process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!raw) {
    console.warn('[whatsapp] Nenhum destinatário configurado (WHATSAPP_GROUP_ID ou WHATSAPP_NOTIFY_NUMBERS).')
    return 0
  }

  const phones  = raw.split(',').map((n) => n.trim()).filter(Boolean)
  const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
  return results.filter(Boolean).length
}

/**
 * Lista os grupos do WhatsApp vinculado à instância.
 * Útil para descobrir o WHATSAPP_GROUP_ID correto.
 */
export async function listGroups(): Promise<{ id: string; name: string }[]> {
  if (!process.env.ZAPI_INSTANCE_ID || !process.env.ZAPI_TOKEN) return []

  try {
    const res = await fetch(endpoint('chats?onlyGroups=true'), {
      headers: baseHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json() as Array<{ id?: string; name?: string; subject?: string }>
    return json.map((g) => ({ id: g.id ?? '', name: g.name ?? g.subject ?? g.id ?? '' }))
  } catch {
    return []
  }
}
