import { z } from 'zod'

/**
 * Recorrência por task estilo ClickUp (D-010). Funções PURAS (sem prisma),
 * testáveis. Timezone: UTC no banco, cálculo em America/Sao_Paulo (D-006).
 *
 * NÃO usa lib nova de datas: extrai a data-parede (wall clock) no fuso alvo via
 * Intl.DateTimeFormat, faz aritmética de calendário em pseudo-UTC (métodos
 * getUTC*/Date.UTC — imunes a DST porque é matemática pura de UTC) e reconverte
 * a data-parede resultante para o instante UTC correto.
 */

export const DEFAULT_TZ = 'America/Sao_Paulo'

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type RecurrenceMode = 'onComplete' | 'schedule'

export type RecurrenceRule = {
  freq: RecurrenceFreq
  interval: number
  /** 0=Domingo .. 6=Sábado (só WEEKLY). */
  byWeekday?: number[]
  mode: RecurrenceMode
  skipWeekends?: boolean
}

// ── Validação (zod) ──────────────────────────────────────────────────────────
const recurrenceSchema = z.object({
  freq: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  interval: z.number().int().min(1).max(365),
  byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  mode: z.enum(['onComplete', 'schedule']),
  skipWeekends: z.boolean().optional(),
})

/**
 * Valida/parseia um JSON desconhecido para RecurrenceRule. Retorna null se
 * inválido (nunca lança) — o caller traduz para mensagem operacional.
 */
export function parseRecurrenceRule(json: unknown): RecurrenceRule | null {
  const parsed = recurrenceSchema.safeParse(json)
  if (!parsed.success) return null
  const rule = parsed.data
  // byWeekday só faz sentido em WEEKLY — normaliza descartando fora de contexto.
  if (rule.freq !== 'WEEKLY' && rule.byWeekday) {
    return { ...rule, byWeekday: undefined }
  }
  return rule
}

// ── Helpers de timezone (sem dependência externa) ────────────────────────────
type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function getWallParts(date: Date, tz: string): WallParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  }
}

/** Offset (ms) do fuso em relação a UTC no instante dado. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = getWallParts(new Date(utcMs), tz)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - utcMs
}

/** Converte uma data-parede no fuso alvo para o instante UTC correspondente. */
function wallToUtc(p: WallParts, tz: string): Date {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offset = tzOffsetMs(guess, tz)
  return new Date(guess - offset)
}

// ── Motor de próxima ocorrência ──────────────────────────────────────────────
/**
 * Próxima ocorrência a partir de `from`, calculada na data-parede de `tz`.
 * Preserva a hora local de `from`. Bordas cobertas: domingo→segunda (WEEKLY com
 * byWeekday e skipWeekends) e virada de mês (MONTHLY faz clamp ao último dia).
 */
export function computeNextOccurrence(rule: RecurrenceRule, from: Date, tz: string = DEFAULT_TZ): Date {
  const p = getWallParts(from, tz)
  // Pseudo-UTC representando a data-parede: aritmética via getUTC*/setUTC* sem DST.
  const cursor = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))

  const interval = Math.max(1, Math.floor(rule.interval))

  if (rule.freq === 'DAILY') {
    cursor.setUTCDate(cursor.getUTCDate() + interval)
  } else if (rule.freq === 'WEEKLY') {
    if (rule.byWeekday && rule.byWeekday.length > 0) {
      const sorted = [...new Set(rule.byWeekday)].sort((a, b) => a - b)
      const cur = cursor.getUTCDay()
      const nextInWeek = sorted.find((w) => w > cur)
      // Bordas: dom(0)→seg(1) = +1 dia; sex(5) semanal[seg] = +3 (vira semana).
      const addDays = nextInWeek !== undefined ? nextInWeek - cur : interval * 7 - cur + sorted[0]
      cursor.setUTCDate(cursor.getUTCDate() + addDays)
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + interval * 7)
    }
  } else {
    // MONTHLY — soma meses e faz clamp ao último dia do mês alvo (31→28/29/30).
    const originalDay = p.day
    const monthIndex = p.month - 1 + interval
    const targetYear = p.year + Math.floor(monthIndex / 12)
    const targetMonth = ((monthIndex % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
    const day = Math.min(originalDay, lastDay)
    cursor.setUTCFullYear(targetYear, targetMonth, day)
  }

  if (rule.skipWeekends) {
    const wd = cursor.getUTCDay()
    if (wd === 6) cursor.setUTCDate(cursor.getUTCDate() + 2) // sábado → segunda
    else if (wd === 0) cursor.setUTCDate(cursor.getUTCDate() + 1) // domingo → segunda
  }

  return wallToUtc(
    {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      hour: cursor.getUTCHours(),
      minute: cursor.getUTCMinutes(),
      second: cursor.getUTCSeconds(),
    },
    tz,
  )
}
