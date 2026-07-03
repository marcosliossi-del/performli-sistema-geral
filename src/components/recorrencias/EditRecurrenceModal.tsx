'use client'

import { useState, useTransition } from 'react'
import { Pencil, Archive, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useModalA11y } from '@/lib/useModalA11y'
import { toast } from '@/lib/toast'
import {
  updateRecurrenceRule,
  archiveRecurrenceRule,
  type UpdateRecurrenceInput,
} from '@/app/actions/recurrences'

// Opções alinhadas à régua real do motor (recurrence-engine.shouldRunToday).
const FREQUENCIES: { value: string; label: string }[] = [
  { value: 'DIARIA', label: 'Todo dia' },
  { value: 'DIA_UTIL', label: 'Todo dia útil (seg a sex)' },
  { value: 'SEMANAL', label: 'Toda semana (dia da semana)' },
  { value: 'DIA_DA_SEMANA', label: 'Dia da semana' },
  { value: 'QUINZENAL', label: 'A cada 15 dias' },
  { value: 'MENSAL', label: 'Todo mês (dia do mês)' },
  { value: 'DIA_DO_MES', label: 'Dia do mês' },
  { value: 'TRIMESTRAL', label: 'A cada 3 meses' },
]

// Papéis que o motor distribui por cliente ativo (fan-out). ADMIN/ANALYST fora.
const ROLES: { value: string; label: string }[] = [
  { value: 'GESTOR', label: 'Gestor' },
  { value: 'CS', label: 'Sucesso do Cliente' },
  { value: 'CRM', label: 'CRM / Comercial' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'HEAD', label: 'Head' },
]

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// Frequências que usam dia-da-semana / dia-do-mês (mostra o campo certo).
const USES_DOW = new Set(['SEMANAL', 'DIA_DA_SEMANA', 'QUINZENAL'])
const USES_DOM = new Set(['MENSAL', 'DIA_DO_MES', 'TRIMESTRAL'])

export type EditableRecurrence = {
  id: string
  templateName: string
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  hour: number | null
  minute: number | null
  defaultAssigneeRole: string | null
  templateId: string | null
  hasTemplate: boolean
}

export type TemplateOption = { id: string; name: string }

export function RecurrenceRowActions({
  rule,
  templates,
}: {
  rule: EditableRecurrence
  templates: TemplateOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveRecurrenceRule(rule.id)
      if ('error' in res) {
        toast(res.error, 'err')
        return
      }
      toast(`Recorrência "${rule.templateName}" arquivada. Parou de gerar tarefas.`, 'info')
      setConfirmArchive(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors"
        >
          <Pencil size={13} />
          Editar
        </button>
        <button
          type="button"
          onClick={() => setConfirmArchive((v) => !v)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#38435C] text-xs font-medium text-[#EAB308] hover:bg-[#EAB308]/10 transition-colors"
        >
          <Archive size={13} />
          Arquivar
        </button>
      </div>

      {confirmArchive && (
        <div className="w-64 rounded-lg border border-[#EAB308]/40 bg-[#EAB308]/10 p-3 text-right">
          <p className="text-[11px] text-[#EBEBEB]/90 mb-2 text-left">
            A regra para de gerar tarefas e sai da lista — as tarefas já criadas não são
            afetadas. Você pode restaurá-la depois.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              disabled={isPending}
              className="h-7 px-2.5 rounded-md border border-[#38435C] text-[11px] text-[#87919E] hover:text-[#EBEBEB] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={isPending}
              className="h-7 px-2.5 rounded-md bg-[#EAB308]/20 border border-[#EAB308]/40 text-[11px] font-medium text-[#EAB308] hover:bg-[#EAB308]/30 disabled:opacity-50"
            >
              {isPending ? 'Arquivando...' : 'Arquivar regra'}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditRecurrenceDialog rule={rule} templates={templates} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function EditRecurrenceDialog({
  rule,
  templates,
  onClose,
}: {
  rule: EditableRecurrence
  templates: TemplateOption[]
  onClose: () => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [frequency, setFrequency] = useState(rule.frequency)
  const [dayOfWeek, setDayOfWeek] = useState<string>(rule.dayOfWeek != null ? String(rule.dayOfWeek) : '')
  const [dayOfMonth, setDayOfMonth] = useState<string>(rule.dayOfMonth != null ? String(rule.dayOfMonth) : '')
  const [hour, setHour] = useState<string>(rule.hour != null ? String(rule.hour) : '')
  const [minute, setMinute] = useState<string>(rule.minute != null ? String(rule.minute) : '')
  const [role, setRole] = useState<string>(rule.defaultAssigneeRole ?? '')
  const [templateId, setTemplateId] = useState<string>(rule.templateId ?? '')

  const isEventDriven = frequency.startsWith('POR_')

  function toIntOrNull(v: string): number | null {
    if (v.trim() === '') return null
    const n = Number(v)
    return Number.isInteger(n) ? n : null
  }

  function handleSubmit() {
    setError(null)
    const input: UpdateRecurrenceInput = {
      frequency,
      dayOfWeek: USES_DOW.has(frequency) ? toIntOrNull(dayOfWeek) : null,
      dayOfMonth: USES_DOM.has(frequency) ? toIntOrNull(dayOfMonth) : null,
      hour: toIntOrNull(hour),
      minute: toIntOrNull(minute),
    }
    if (role) input.defaultAssigneeRole = role
    if (rule.hasTemplate && templateId) input.templateId = templateId

    startTransition(async () => {
      const res = await updateRecurrenceRule(rule.id, input)
      if ('error' in res) {
        setError(res.error)
        return
      }
      toast(`Recorrência "${rule.templateName}" atualizada.`, 'ok')
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="lg-overlay absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar recorrência"
        className="lg-glass-strong relative w-full max-w-md bg-[#0A1E2C] border border-[#38435C] rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-[#95BBE2]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Editar recorrência</h2>
          </div>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Modelo de tarefa */}
          {rule.hasTemplate && (
            <Field label="Modelo de tarefa">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={selectCls}
              >
                {/* O template atual da regra vem primeiro — a lista recebida
                    contém apenas templates LIVRES (sem regra vinculada). */}
                {rule.templateId && (
                  <option value={rule.templateId}>{rule.templateName} (atual)</option>
                )}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Frequência */}
          <Field label="Frequência">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={selectCls}>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
              {isEventDriven && <option value={frequency}>Disparada por evento (não editável aqui)</option>}
            </select>
          </Field>

          {isEventDriven && (
            <p className="text-[11px] text-[#EAB308]">
              Esta regra é disparada por evento do sistema — o agendamento por data não se aplica.
            </p>
          )}

          {/* Dia da semana */}
          {USES_DOW.has(frequency) && (
            <Field label="Dia da semana">
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={selectCls}>
                <option value="">A definir</option>
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Dia do mês */}
          {USES_DOM.has(frequency) && (
            <Field label="Dia do mês (1 a 31)">
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                className={inputCls}
                placeholder="ex: 5"
              />
            </Field>
          )}

          {/* Horário */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora (0 a 23)">
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className={inputCls}
                placeholder="ex: 9"
              />
            </Field>
            <Field label="Minuto (0 a 59)">
              <input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className={inputCls}
                placeholder="ex: 0"
              />
            </Field>
          </div>

          {/* Responsável */}
          {rule.hasTemplate && (
            <Field label="Responsável (papel que recebe as tarefas)">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                <option value="">Manter o atual</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-[#87919E] mt-1">
                Só papéis que geram tarefas por cliente. Administrador e Analista não geram.
              </p>
            </Field>
          )}

          {error && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
              <p className="text-[#EF4444] text-xs">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} className="flex-1" onClick={handleSubmit}>
              {isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const selectCls =
  'w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors'
const inputCls = selectCls

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
