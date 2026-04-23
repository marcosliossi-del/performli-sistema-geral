import { prisma } from '@/lib/prisma'

export interface ZApiConfig {
  instanceId:   string
  token:        string
  clientToken:  string  // webhook security token
}

export interface ZApiStatus {
  connected: boolean
  number?:   string
  name?:     string
}

export async function getConfig(): Promise<ZApiConfig | null> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: ['ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!map.ZAPI_INSTANCE_ID || !map.ZAPI_TOKEN) return null
  return {
    instanceId:  map.ZAPI_INSTANCE_ID,
    token:       map.ZAPI_TOKEN,
    clientToken: map.ZAPI_CLIENT_TOKEN ?? '',
  }
}

function base(config: ZApiConfig) {
  return `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}`
}

async function req<T>(config: ZApiConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base(config)}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'client-token':  config.clientToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Z-API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getQrCode(config: ZApiConfig): Promise<string | null> {
  try {
    const data = await req<{ value?: string; qrcode?: string }>(config, 'GET', '/qr-code')
    const raw  = data.value ?? data.qrcode ?? null
    if (!raw) return null
    return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
  } catch {
    return null
  }
}

export async function getStatus(config: ZApiConfig): Promise<ZApiStatus> {
  try {
    const data = await req<{
      connected?: boolean
      smartphoneConnected?: boolean
      session?: string
      phone?: { phone?: string; businessName?: string; profileName?: string }
    }>(config, 'GET', '/status')

    const connected = data.connected === true || data.smartphoneConnected === true
    return {
      connected,
      number: data.phone?.phone,
      name:   data.phone?.profileName ?? data.phone?.businessName,
    }
  } catch {
    return { connected: false }
  }
}

export async function sendText(config: ZApiConfig, phone: string, message: string): Promise<void> {
  const digits = phone.replace(/\D/g, '')
  await req(config, 'POST', '/send-messages/text', { phone: digits, message })
}
