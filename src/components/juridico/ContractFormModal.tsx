'use client'

import { useActionState, useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createContract, updateContract, ContractRow } from '@/app/actions/contracts'
import { ContractStatus, ContractType } from '@prisma/client'
import { useModalA11y } from '@/lib/useModalA11y'

type Client = { id: string; name: string }
type User   = { id: string; name: string }

type Props = {
  clients:     Client[]
  users:       User[]
  contract?:   ContractRow
  defaultClientId?: string
  onClose:     () => void
  onSaved:     () => void
}

const TYPE_LABELS: Record<ContractType, string> = {
  FEE_MENSAL: 'Fee Mensal',
  PROJETO:    'Projeto',
  AVULSO:     'Avulso',
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  RASCUNHO:  'Rascunho',
  VIGENTE:   'Em Vigor',
  RENOVACAO: 'Renovação',
  CANCELADO: 'Cancelado',
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function ContractFormModal({ clients, users, contract, defaultClientId, onClose, onSaved }: Props) {
  const isEdit = !!contract
  const action = isEdit ? updateContract : createContract

  const [state, formAction, pending] = useActionState(action, {})
  const [durationMonths, setDurationMonths] = useState<string>('')
  const [startDate, setStartDate] = useState(toDateInput(contract?.startDate) || '')
  const [endDate, setEndDate]     = useState(toDateInput(contract?.endDate)   || '')
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  // Auto-calc end date from duration
  function handleDurationChange(months: string) {
    setDurationMonths(months)
    if (startDate && months) {
      const start = new Date(startDate + 'T00:00:00')
      const end   = new Date(start.getFullYear(), start.getMonth() + parseInt(months, 10), start.getDate())
      setEndDate(end.toISOString().slice(0, 10))
    }
  }

  function handleStartChange(value: string) {
    setStartDate(value)
    if (durationMonths && value) {
      const start = new Date(value + 'T00:00:00')
      const end   = new Date(start.getFullYear(), start.getMonth() + parseInt(durationMonths, 10), start.getDate())
      setEndDate(end.toISOString().slice(0, 10))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar Contrato' : 'Novo Contrato'}
        className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
          <h2 className="text-base font-semibold text-[#EBEBEB]">
            {isEdit ? 'Editar Contrato' : 'Novo Contrato'}
          </h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="px-6 py-5 space-y-5">
          {isEdit && <input type="hidden" name="id" value={contract.id} />}

          {state.error && (
            <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{state.error}</p>
          )}

          {/* Cliente + Responsável */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Cliente *</label>
              {isEdit ? (
                <>
                  <input type="hidden" name="clientId" value={contract.clientId} />
                  <div className="h-9 flex items-center px-3 rounded-lg bg-[#38435C]/30 border border-[#38435C] text-sm text-[#EBEBEB]">
                    {contract.client.name}
                  </div>
                </>
              ) : (
                <select
                  name="clientId"
                  defaultValue={defaultClientId || ''}
                  required
                  className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
                >
                  <option value="">Selecione...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Responsável</label>
              <select
                name="responsibleId"
                defaultValue={contract?.responsibleId || ''}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              >
                <option value="">Sem responsável</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Tipo</label>
              <select
                name="type"
                defaultValue={contract?.type || 'FEE_MENSAL'}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              >
                {(Object.keys(TYPE_LABELS) as ContractType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Status</label>
              <select
                name="status"
                defaultValue={contract?.status || 'RASCUNHO'}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              >
                {(Object.keys(STATUS_LABELS) as ContractStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Fee Mensal (R$) *</label>
              <input
                type="number"
                name="feeValue"
                step="0.01"
                min="0"
                required
                defaultValue={contract?.feeValue}
                placeholder="ex: 2500.00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#4A5568] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Setup / Onboarding (R$)</label>
              <input
                type="number"
                name="setupFee"
                step="0.01"
                min="0"
                defaultValue={contract?.setupFee ?? ''}
                placeholder="ex: 500.00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#4A5568] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Data Início *</label>
              <input
                type="date"
                name="startDate"
                required
                value={startDate}
                onChange={e => handleStartChange(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Duração (meses)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={durationMonths}
                onChange={e => handleDurationChange(e.target.value)}
                placeholder="ex: 12"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#4A5568] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Data Vencimento *</label>
              <input
                type="date"
                name="endDate"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
          </div>

          {/* Assinatura + Aviso prévio */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Data Assinatura</label>
              <input
                type="date"
                name="signedAt"
                defaultValue={toDateInput(contract?.signedAt)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#87919E] mb-1.5">Aviso prévio (dias)</label>
              <input
                type="number"
                name="noticeDays"
                min="0"
                defaultValue={contract?.noticeDays ?? 30}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]"
              />
            </div>
          </div>

          {/* Documento URL */}
          <div>
            <label className="block text-xs text-[#87919E] mb-1.5">Link do Contrato (PDF)</label>
            <input
              type="url"
              name="documentUrl"
              defaultValue={contract?.documentUrl || ''}
              placeholder="https://drive.google.com/..."
              className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#4A5568] focus:outline-none focus:border-[#95BBE2]"
            />
            <p className="text-[11px] text-[#87919E] mt-1">Cole o link do Google Drive, Dropbox ou similar.</p>
          </div>

          {/* Renovação automática */}
          <div className="flex items-center gap-3">
            <input
              type="hidden" name="autoRenew" value="false"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="autoRenew"
                value="true"
                defaultChecked={contract?.autoRenew}
                className="rounded border-[#38435C] bg-[#1B2B3A] text-[#95BBE2] focus:ring-[#95BBE2]"
              />
              <span className="text-sm text-[#EBEBEB]">Renovação automática</span>
            </label>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs text-[#87919E] mb-1.5">Observações internas</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={contract?.notes || ''}
              placeholder="Condições especiais, histórico de negociação..."
              className="w-full px-3 py-2 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#4A5568] focus:outline-none focus:border-[#95BBE2] resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[#38435C]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 h-9 px-5 rounded-lg bg-[#95BBE2]/15 text-[#95BBE2] hover:bg-[#95BBE2]/25 text-sm font-medium transition-colors disabled:opacity-50 border border-[#95BBE2]/20"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
