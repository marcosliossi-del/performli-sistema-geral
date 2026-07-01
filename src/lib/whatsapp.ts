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

/** Envia mensagem para um número ou ID de grupo, com menções opcionais */
export async function sendWhatsApp(
  phone: string,
  message: string,
  mentioned?: string[],
): Promise<boolean> {
  if (!process.env.ZAPI_INSTANCE_ID || !process.env.ZAPI_TOKEN) {
    console.warn('[whatsapp] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados.')
    return false
  }

  try {
    const body: Record<string, unknown> = { phone, message }
    if (mentioned && mentioned.length > 0) body.mentioned = mentioned

    const res = await fetch(endpoint('send-text'), {
      method:  'POST',
      headers: baseHeaders(),
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      // Não loga o corpo bruto da resposta do Z-API (pode conter dados sensíveis).
      console.error(`[whatsapp] Erro ao enviar para ${phone}: HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[whatsapp] Falha inesperada ao enviar para ${phone}:`, err)
    return false
  }
}

/**
 * Busca os participantes de um grupo Z-API.
 * Retorna lista de phones (ex: "5511999999999").
 */
export async function getGroupParticipants(groupId: string): Promise<string[]> {
  if (!process.env.ZAPI_INSTANCE_ID || !process.env.ZAPI_TOKEN) return []

  try {
    // Z-API endpoint: GET /group-participants/{phone}
    // O groupId já vem no formato "120363XXXX@g.us"
    const phone = encodeURIComponent(groupId)
    const res = await fetch(endpoint(`group-participants/${phone}`), {
      headers: baseHeaders(),
    })
    if (!res.ok) {
      console.warn(`[whatsapp] Não foi possível buscar participantes: HTTP ${res.status}`)
      return []
    }
    const json = await res.json() as Array<Record<string, unknown>>
    // Z-API retorna array de objetos com campo "phone" ou "id"
    return json
      .map((p) => String(p.phone ?? p.id ?? '').replace(/[^0-9]/g, ''))
      .filter((p) => p.length >= 10)
  } catch (err) {
    console.warn('[whatsapp] Erro ao buscar participantes do grupo:', err)
    return []
  }
}

/**
 * Envia para o grupo (WHATSAPP_GROUP_ID) mencionando todos os participantes.
 * Se não houver grupo configurado, envia para WHATSAPP_NOTIFY_NUMBERS sem menções.
 */
export async function broadcastWhatsApp(message: string, mentionAll = false): Promise<number> {
  const groupId = process.env.WHATSAPP_GROUP_ID?.trim()

  if (groupId) {
    let mentioned: string[] | undefined
    if (mentionAll) {
      const participants = await getGroupParticipants(groupId)
      if (participants.length > 0) {
        // Adiciona "@phone" ao final da mensagem para cada participante
        const mentionLine = participants.map((p) => `@${p}`).join(' ')
        message = `${message}\n${mentionLine}`
        mentioned = participants
      }
    }
    const ok = await sendWhatsApp(groupId, message, mentioned)
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
    const json = await res.json() as Array<Record<string, unknown>>
    return json.map((g) => ({
      // Z-API pode retornar o ID em diferentes campos dependendo da versão
      id:   String(g.phone ?? g.chatId ?? g.groupId ?? g.id ?? ''),
      name: String(g.name ?? g.subject ?? g.title ?? g.phone ?? g.id ?? ''),
    })).filter((g) => g.id)
  } catch {
    return []
  }
}
