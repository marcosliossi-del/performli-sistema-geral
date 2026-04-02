/**
 * WhatsApp via Z-API (https://z-api.io)
 *
 * Variáveis de ambiente necessárias:
 *   ZAPI_INSTANCE_ID   — ID da instância Z-API
 *   ZAPI_TOKEN         — Token da instância
 *   ZAPI_CLIENT_TOKEN  — Client-Token (header de segurança)
 *   WHATSAPP_NOTIFY_NUMBERS — números separados por vírgula, formato: 5511999999999
 *                             (código do país + DDD + número, sem + ou hífens)
 */

const ZAPI_BASE = 'https://api.z-api.io/instances'

export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId  = process.env.ZAPI_INSTANCE_ID
  const token       = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN

  if (!instanceId || !token) {
    console.warn('[whatsapp] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados — pulando envio.')
    return false
  }

  try {
    const res = await fetch(`${ZAPI_BASE}/${instanceId}/token/${token}/send-text`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientToken ? { 'Client-Token': clientToken } : {}),
      },
      body: JSON.stringify({ phone, message }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[whatsapp] Erro ao enviar para ${phone}: HTTP ${res.status} — ${body}`)
      return false
    }

    return true
  } catch (err) {
    console.error(`[whatsapp] Falha inesperada ao enviar para ${phone}:`, err)
    return false
  }
}

/**
 * Envia a mesma mensagem para todos os números configurados em WHATSAPP_NOTIFY_NUMBERS.
 * Retorna quantos envios foram bem-sucedidos.
 */
export async function broadcastWhatsApp(message: string): Promise<number> {
  const raw = process.env.WHATSAPP_NOTIFY_NUMBERS
  if (!raw) {
    console.warn('[whatsapp] WHATSAPP_NOTIFY_NUMBERS não configurado — pulando broadcast.')
    return 0
  }

  const phones  = raw.split(',').map((n) => n.trim()).filter(Boolean)
  const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
  return results.filter(Boolean).length
}
