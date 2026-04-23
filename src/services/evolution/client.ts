import { prisma } from '@/lib/prisma'

export interface EvolutionConfig {
  url:      string
  apiKey:   string
  instance: string
}

export interface EvolutionStatus {
  connected: boolean
  number?:   string
  name?:     string
}

async function getConfig(): Promise<EvolutionConfig | null> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { in: ['EVOLUTION_URL', 'EVOLUTION_KEY', 'EVOLUTION_INSTANCE'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!map.EVOLUTION_URL || !map.EVOLUTION_KEY || !map.EVOLUTION_INSTANCE) return null
  return { url: map.EVOLUTION_URL, apiKey: map.EVOLUTION_KEY, instance: map.EVOLUTION_INSTANCE }
}

async function req<T>(
  config: EvolutionConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${config.url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export async function createInstance(config: EvolutionConfig): Promise<void> {
  await req(config, 'POST', '/instance/create', {
    instanceName: config.instance,
    integration:  'WHATSAPP-BAILEYS',
    qrcode:        true,
  }).catch(() => {
    // Instance may already exist — ignore error
  })
}

export async function getQrCode(config: EvolutionConfig): Promise<string | null> {
  try {
    const data = await req<{ base64?: string; qrcode?: { base64?: string } }>(
      config, 'GET', `/instance/connect/${config.instance}`,
    )
    return data.base64 ?? data.qrcode?.base64 ?? null
  } catch {
    return null
  }
}

export async function getStatus(config: EvolutionConfig): Promise<EvolutionStatus> {
  try {
    const data = await req<{
      instance?: { state?: string; profileName?: string; wuid?: string }
    }>(config, 'GET', `/instance/fetchInstances?instanceName=${config.instance}`)

    const inst = Array.isArray(data) ? (data as unknown[])[0] : data?.instance
    const state = (inst as Record<string, unknown>)?.state as string | undefined
    const connected = state === 'open'

    return {
      connected,
      number: (inst as Record<string, unknown>)?.wuid as string | undefined,
      name:   (inst as Record<string, unknown>)?.profileName as string | undefined,
    }
  } catch {
    return { connected: false }
  }
}

export async function setWebhook(config: EvolutionConfig, webhookUrl: string): Promise<void> {
  await req(config, 'POST', `/webhook/set/${config.instance}`, {
    webhook: {
      enabled: true,
      url:     webhookUrl,
      events:  ['MESSAGES_UPSERT'],
    },
  })
}

export async function sendText(
  config: EvolutionConfig,
  to: string,
  text: string,
): Promise<void> {
  await req(config, 'POST', `/message/sendText/${config.instance}`, {
    number:  to,
    text,
  })
}

export { getConfig }
