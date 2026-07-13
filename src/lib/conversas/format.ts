/**
 * Helpers de formatação do módulo Conversas — PUROS e client-safe (sem I/O,
 * sem server-only). Fuso fixo America/Sao_Paulo e linguagem operacional pt-BR.
 */

const TZ = 'America/Sao_Paulo'

const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
})

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const dayFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Hora curta (HH:mm) no fuso de São Paulo. */
export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return ''
  return timeFmt.format(new Date(d))
}

/** Data + hora (dd/mm HH:mm) no fuso de São Paulo. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return dateTimeFmt.format(new Date(d))
}

/** Dia (dd/mm/aaaa) no fuso de São Paulo — usado nos separadores da thread. */
export function fmtDay(d: Date | string | null | undefined): string {
  if (!d) return ''
  return dayFmt.format(new Date(d))
}

/** "há X" operacional e curto (min/h/d). Vazio se sem data. */
export function fmtRelative(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return ''
  const then = new Date(d).getTime()
  const diffMin = Math.max(0, Math.floor((now.getTime() - then) / 60000))
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.floor(h / 24)
  return `há ${days} d`
}

/** Rótulo operacional do estado da janela de 24h da Cloud API. */
export function windowLabel(window: { open: boolean; minutesRemaining?: number | null }): {
  text: string
  tone: 'ok' | 'warn' | 'closed'
} {
  if (!window.open) {
    return { text: 'Janela de 24h fechada', tone: 'closed' }
  }
  const mins = window.minutesRemaining ?? null
  if (mins != null && mins <= 60) {
    return { text: `Janela fecha em ${mins} min`, tone: 'warn' }
  }
  if (mins != null) {
    const h = Math.floor(mins / 60)
    return { text: `Janela aberta • ${h} h restantes`, tone: 'ok' }
  }
  return { text: 'Janela de 24h aberta', tone: 'ok' }
}

/** Rótulo operacional do status da conversa. */
export function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Em aberto'
    case 'PENDING': return 'Aguardando'
    case 'CLOSED': return 'Encerrada'
    default: return status
  }
}

/** Rótulo do status do lead no funil. */
export function leadStatusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Em aberto'
    case 'WON': return 'Ganho'
    case 'LOST': return 'Perdido'
    default: return status
  }
}

/** Valor em R$ curto para cards do funil. */
export function fmtBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

/** Nome de exibição do contato (fallback para telefone / "Contato sem nome"). */
export function contactLabel(contact: { name: string | null; phone: string | null }): string {
  if (contact.name && contact.name.trim()) return contact.name.trim()
  if (contact.phone) return contact.phone
  return 'Contato sem nome'
}
