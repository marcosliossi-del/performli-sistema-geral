'use client'

import { useState } from 'react'
import { Loader2, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { setTaskRecurrence } from '@/app/actions/tasks'
import type { RecurrenceRule, RecurrenceFreq } from '@/lib/tasks/recurrence'

/**
 * Editor de recorrência por task (ClickUp-like, D-010). Monta o objeto no shape
 * exato do parseRecurrenceRule: { freq, interval, byWeekday (0=domingo, só
 * WEEKLY), mode:'onComplete', skipWeekends }.
 *
 * Modo fixo 'onComplete': ao concluir a tarefa, o backend cria a próxima
 * ocorrência automaticamente (updateTaskStatus → clone). O modo 'schedule'
 * (varredura por data) é do cron/A5 e não é oferecido aqui.
 */

const FREQ_OPTIONS: { value: RecurrenceFreq; label: string; unit: (n: number) => string }[] = [
  { value: 'DAILY', label: 'Diariamente', unit: (n) => (n === 1 ? 'dia' : 'dias') },
  { value: 'WEEKLY', label: 'Semanalmente', unit: (n) => (n === 1 ? 'semana' : 'semanas') },
  { value: 'MONTHLY', label: 'Mensalmente', unit: (n) => (n === 1 ? 'mês' : 'meses') },
]

// Domingo-primeiro (0..6), como o byWeekday do computeNextOccurrence espera.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: 'dom' },
  { value: 1, label: '2ª' },
  { value: 2, label: '3ª' },
  { value: 3, label: '4ª' },
  { value: 4, label: '5ª' },
  { value: 5, label: '6ª' },
  { value: 6, label: 'sáb' },
]

const WEEKDAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Frase-resumo operacional da regra atual. */
export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return 'Não se repete'
  const n = rule.interval
  let base: string
  if (rule.freq === 'DAILY') {
    base = n === 1 ? 'Repete todos os dias' : `Repete a cada ${n} dias`
  } else if (rule.freq === 'WEEKLY') {
    const days = (rule.byWeekday ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_FULL[d])
    const every = n === 1 ? 'toda semana' : `a cada ${n} semanas`
    base = days.length ? `Repete ${every} (${days.join(', ')})` : `Repete ${every}`
  } else {
    base = n === 1 ? 'Repete todo mês' : `Repete a cada ${n} meses`
  }
  const tail = rule.skipWeekends ? ' · pula fim de semana' : ''
  return `${base} · ao concluir${tail}`
}

const FALLBACK_RULE: RecurrenceRule = { freq: 'WEEKLY', interval: 1, byWeekday: [1], mode: 'onComplete' }

export function RecurrenceEditor({
  taskId,
  rule,
  canEdit,
  onSaved,
}: {
  taskId: string
  rule: RecurrenceRule | null
  canEdit: boolean
  onSaved: (next: RecurrenceRule | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RecurrenceRule>(rule ?? FALLBACK_RULE)
  const [pending, setPending] = useState<'save' | 'clear' | null>(null)

  function startEdit() {
    setDraft(rule ?? FALLBACK_RULE)
    setOpen(true)
  }

  function setFreq(freq: RecurrenceFreq) {
    setDraft((d) => ({
      freq,
      interval: d.interval,
      mode: 'onComplete',
      skipWeekends: d.skipWeekends,
      // byWeekday só existe em WEEKLY; garante ao menos um dia selecionado.
      byWeekday: freq === 'WEEKLY' ? (d.byWeekday?.length ? d.byWeekday : [1]) : undefined,
    }))
  }

  function toggleWeekday(value: number) {
    setDraft((d) => {
      const cur = new Set(d.byWeekday ?? [])
      if (cur.has(value)) cur.delete(value)
      else cur.add(value)
      const next = Array.from(cur).sort((a, b) => a - b)
      // Nunca deixa WEEKLY sem nenhum dia.
      return { ...d, byWeekday: next.length ? next : [value] }
    })
  }

  async function save() {
    const payload: RecurrenceRule = {
      freq: draft.freq,
      interval: Math.min(365, Math.max(1, Math.floor(draft.interval || 1))),
      mode: 'onComplete',
      ...(draft.freq === 'WEEKLY'
        ? { byWeekday: draft.byWeekday?.length ? draft.byWeekday : [1] }
        : {}),
      ...(draft.skipWeekends ? { skipWeekends: true } : {}),
    }
    setPending('save')
    try {
      const res = await setTaskRecurrence(taskId, payload)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      onSaved(payload)
      setOpen(false)
      toast('Recorrência salva')
    } catch {
      toast('Não foi possível salvar a recorrência.', 'err')
    } finally {
      setPending(null)
    }
  }

  async function clear() {
    setPending('clear')
    try {
      const res = await setTaskRecurrence(taskId, null)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      onSaved(null)
      setOpen(false)
      toast('A tarefa não repete mais')
    } catch {
      toast('Não foi possível remover a recorrência.', 'err')
    } finally {
      setPending(null)
    }
  }

  const busy = pending !== null

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-mid">
          <Repeat size={13} aria-hidden /> Recorrência
        </span>
        {canEdit && !open && (
          <button
            type="button"
            onClick={startEdit}
            className="text-[11px] text-info hover:underline"
          >
            {rule ? 'Editar' : 'Configurar'}
          </button>
        )}
      </div>

      {!open && (
        <p className={cn('text-[13px]', rule ? 'text-text-hi' : 'text-text-low')}>
          {describeRecurrence(rule)}
        </p>
      )}

      {open && (
        <div className="space-y-3 rounded-xl border border-[var(--ak-hair)] bg-surface p-3">
          {/* Frequência + intervalo */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-text-mid">Repetir a cada</span>
            <input
              type="number"
              min={1}
              max={365}
              value={draft.interval}
              onChange={(e) => setDraft((d) => ({ ...d, interval: Number(e.target.value) }))}
              disabled={busy}
              className="h-8 w-16 rounded-lg border border-[var(--ak-hair)] bg-surface-raised px-2 text-[13px] text-text-hi outline-none focus:border-[var(--ak-brand)]"
              aria-label="Intervalo de repetição"
            />
            <select
              value={draft.freq}
              onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}
              disabled={busy}
              className="h-8 rounded-lg border border-[var(--ak-hair)] bg-surface-raised px-2 text-[13px] text-text-hi outline-none focus:border-[var(--ak-brand)]"
              aria-label="Frequência"
            >
              {FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.unit(draft.interval || 1)}
                </option>
              ))}
            </select>
          </div>

          {/* Dias da semana (só WEEKLY) */}
          {draft.freq === 'WEEKLY' && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = (draft.byWeekday ?? []).includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    disabled={busy}
                    aria-pressed={active}
                    className={cn(
                      'h-8 min-w-[34px] rounded-lg border px-2 text-[12px] font-medium transition-colors disabled:opacity-60',
                      active
                        ? 'border-transparent bg-brand text-[var(--ak-s0)]'
                        : 'border-[var(--ak-hair)] text-text-mid hover:bg-surface-raised',
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Ignorar dias não úteis */}
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text-mid">
            <input
              type="checkbox"
              checked={!!draft.skipWeekends}
              onChange={(e) => setDraft((d) => ({ ...d, skipWeekends: e.target.checked }))}
              disabled={busy}
              className="h-3.5 w-3.5 accent-[var(--ak-brand)]"
            />
            Ignorar dias não úteis (joga sábado/domingo para segunda)
          </label>

          {/* Explicação do modo onComplete */}
          <p className="rounded-lg bg-surface-raised px-2.5 py-2 text-[11.5px] leading-snug text-text-low">
            Ao concluir: cria a próxima ocorrência automaticamente, mantendo
            responsáveis e checklist. A nova tarefa nasce em &ldquo;A fazer&rdquo;.
          </p>

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-[var(--ak-s0)] disabled:opacity-60"
            >
              {pending === 'save' && <Loader2 size={13} className="animate-spin" aria-hidden />}
              Salvar
            </button>
            {rule && (
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-danger hover:bg-surface-raised disabled:opacity-60"
              >
                {pending === 'clear' && <Loader2 size={13} className="animate-spin" aria-hidden />}
                Não repetir
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="ml-auto text-[12px] text-text-low hover:text-text-hi disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
