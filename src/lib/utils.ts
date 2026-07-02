import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay() // 0=Dom, 6=Sab
  const start = new Date(d)
  start.setDate(d.getDate() - day) // domingo da semana
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6) // sábado da semana
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function getMonthRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/**
 * Fuso da operação (Arkza é Brasil; SP não tem horário de verão desde 2019,
 * então o offset fixo -03:00 é correto e estável).
 */
export const SAO_PAULO_TZ = 'America/Sao_Paulo'
const SAO_PAULO_OFFSET = '-03:00'

/** 'YYYY-MM-DD' do dia-parede atual em America/Sao_Paulo. */
export function saoPauloDateString(now: Date = new Date()): string {
  // en-CA => formato YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Converte 'YYYY-MM-DD' (dia-parede SP) para o instante UTC do início desse dia. */
export function saoPauloDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${SAO_PAULO_OFFSET}`)
}

/**
 * Início do dia de HOJE (00:00) no fuso America/Sao_Paulo, como instante UTC.
 * Use para comparar `dueDate` (meio-dia UTC) sem marcar atraso às 09h do dia do
 * prazo: uma tarefa só está atrasada se dueDate < início de HOJE em SP.
 */
export function startOfTodaySaoPaulo(now: Date = new Date()): Date {
  return saoPauloDayStart(saoPauloDateString(now))
}

/** Formata um instante como data/hora legível no fuso America/Sao_Paulo. */
export function formatSaoPauloDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}
