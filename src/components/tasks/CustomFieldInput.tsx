'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { CustomFieldType } from '@prisma/client'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/** Definição (subset visual do model TaskCustomFieldDefinition). */
export type CustomFieldDef = {
  id: string
  key: string
  label: string
  type: CustomFieldType
  options?: string[]
  required?: boolean
}

/**
 * Entrada de campo customizado com switch por tipo. O valor persiste como
 * string (shape de TaskCustomFieldValue.value); MULTISELECT serializa em JSON.
 * onChange assíncrono com pending; erro não é engolido.
 */
export function CustomFieldInput({
  def,
  value,
  onChange,
  onError,
  className,
}: {
  def: CustomFieldDef
  value: string | null
  onChange: (next: string | null) => Promise<void>
  onError?: (message: string) => void
  className?: string
}) {
  const [pending, setPending] = useState(false)

  async function commit(next: string | null) {
    setPending(true)
    try {
      await onChange(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar o campo.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  const inputCls =
    'w-full h-9 rounded-lg border border-[var(--ak-hair)] bg-surface px-2.5 text-[13px] text-text-hi outline-none placeholder:text-text-low focus:border-[var(--ak-brand)] disabled:opacity-60'

  function control() {
    switch (def.type) {
      case 'BOOLEAN':
        return (
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value === 'true'}
              disabled={pending}
              onChange={(e) => commit(e.target.checked ? 'true' : 'false')}
              className="h-4 w-4 accent-[var(--ak-brand)]"
            />
            <span className="text-[13px] text-text-mid">{value === 'true' ? 'Sim' : 'Não'}</span>
          </label>
        )

      case 'NUMBER':
      case 'CURRENCY':
      case 'PERCENT':
        return (
          <div className="relative">
            {def.type === 'CURRENCY' && (
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-text-low">
                R$
              </span>
            )}
            <input
              type="number"
              inputMode="decimal"
              defaultValue={value ?? ''}
              disabled={pending}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (value ?? '')) commit(v === '' ? null : v)
              }}
              placeholder="0"
              className={cn(inputCls, def.type === 'CURRENCY' && 'pl-8', def.type === 'PERCENT' && 'pr-7')}
            />
            {def.type === 'PERCENT' && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-text-low">
                %
              </span>
            )}
          </div>
        )

      case 'DATE':
        return (
          <input
            type="date"
            defaultValue={value ?? ''}
            disabled={pending}
            onChange={(e) => commit(e.target.value === '' ? null : e.target.value)}
            className={inputCls}
          />
        )

      case 'URL':
        return (
          <input
            type="url"
            defaultValue={value ?? ''}
            disabled={pending}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (value ?? '')) commit(v === '' ? null : v)
            }}
            placeholder="https://…"
            className={inputCls}
          />
        )

      case 'SELECT':
      case 'USER_REF':
      case 'CLIENT_REF':
        return (
          <select
            value={value ?? ''}
            disabled={pending}
            onChange={(e) => commit(e.target.value === '' ? null : e.target.value)}
            className={inputCls}
          >
            <option value="">— selecione —</option>
            {(def.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )

      case 'MULTISELECT': {
        let selected: string[] = []
        try {
          selected = value ? (JSON.parse(value) as string[]) : []
        } catch {
          selected = []
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {(def.options ?? []).map((opt) => {
              const on = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const next = on ? selected.filter((s) => s !== opt) : [...selected, opt]
                    commit(next.length ? JSON.stringify(next) : null)
                  }}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-60',
                    on
                      ? 'border-[color-mix(in_srgb,var(--ak-brand)_40%,transparent)] bg-[color-mix(in_srgb,var(--ak-brand)_15%,transparent)] text-brand-strong'
                      : 'border-[var(--ak-hair)] text-text-mid hover:bg-surface-raised',
                  )}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        )
      }

      case 'TEXT':
      default:
        return (
          <input
            type="text"
            defaultValue={value ?? ''}
            disabled={pending}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== (value ?? '')) commit(v === '' ? null : v)
            }}
            placeholder="—"
            className={inputCls}
          />
        )
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <label className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-low">
        {def.label}
        {def.required && <span className="text-danger">*</span>}
        {pending && <Loader2 size={11} className="animate-spin" aria-hidden />}
      </label>
      {control()}
    </div>
  )
}
