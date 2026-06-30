'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Target, AlertTriangle, Save, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { saveWarRoomPlan, closeWarRoom, type WarRoomPlanInput } from '@/app/actions/warRoom'
import { MetricType, WarRoomOutcome } from '@prisma/client'

export type WarRoomPlan = {
  id: string
  clientName: string
  status: string
  diagnosis: string | null
  exitCriteria: string | null
  exitMetric: MetricType | null
  exitTarget: string | null // Decimal serializado
  responsibleId: string | null
  responsibleName: string | null
  deadline: Date | null
}

type ResponsibleOption = { id: string; name: string; role: string }

// Métricas que fazem sentido como critério de saída de uma conta crítica.
const EXIT_METRIC_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'ROAS', label: 'ROAS' },
  { value: 'FATURAMENTO', label: 'Faturamento' },
  { value: 'CPL', label: 'CPL (custo por lead)' },
  { value: 'CPA', label: 'CPA (custo por aquisição)' },
  { value: 'CAC', label: 'CAC' },
  { value: 'TICKET_MEDIO', label: 'Ticket médio' },
  { value: 'TAXA_CONVERSAO', label: 'Taxa de conversão' },
  { value: 'LEADS', label: 'Leads' },
]

function fmtDateInput(d: Date | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toISOString().slice(0, 10)
}

export function WarRoomPlanPanel({
  plan,
  responsibleOptions,
  canEdit,
}: {
  plan: WarRoomPlan
  responsibleOptions: ResponsibleOption[]
  canEdit: boolean
}) {
  const [diagnosis, setDiagnosis] = useState(plan.diagnosis ?? '')
  const [exitCriteria, setExitCriteria] = useState(plan.exitCriteria ?? '')
  const [exitMetric, setExitMetric] = useState<string>(plan.exitMetric ?? '')
  const [exitTarget, setExitTarget] = useState(plan.exitTarget ?? '')
  const [responsibleId, setResponsibleId] = useState(plan.responsibleId ?? '')
  const [deadline, setDeadline] = useState(fmtDateInput(plan.deadline))
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEncerrado = plan.status === 'ENCERRADO'
  const hasExitCriteria = !!plan.exitCriteria?.trim()

  function handleSave() {
    setMsg(null)
    const input: WarRoomPlanInput = {
      diagnosis,
      exitCriteria,
      exitMetric: exitMetric ? (exitMetric as MetricType) : null,
      exitTarget: exitTarget ? Number(exitTarget) : null,
      responsibleId,
      deadline,
    }
    startTransition(async () => {
      const res = await saveWarRoomPlan(plan.id, input)
      setMsg('error' in res ? res.error : 'Plano da War Room salvo.')
    })
  }

  function handleClose(outcome: WarRoomOutcome) {
    setMsg(null)
    startTransition(async () => {
      const res = await closeWarRoom(plan.id, outcome)
      if ('error' in res) setMsg(res.error)
    })
  }

  // Visão de leitura para quem não pode editar ou War Room encerrada
  if (!canEdit || isEncerrado) {
    return (
      <Card className="p-4 border-l-4 border-l-[#95BBE2]/40 bg-[#0A1E2C]/40">
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} className="text-[#95BBE2]" />
          <p className="text-xs font-semibold text-[#EBEBEB] uppercase tracking-wider">
            Plano da War Room · {plan.clientName}
          </p>
        </div>
        {hasExitCriteria ? (
          <div className="space-y-1 text-xs text-[#87919E]">
            <p><span className="text-[#EBEBEB]">Critério de saída:</span> {plan.exitCriteria}</p>
            {plan.responsibleName && <p><span className="text-[#EBEBEB]">Responsável:</span> {plan.responsibleName}</p>}
            {plan.deadline && <p><span className="text-[#EBEBEB]">Prazo:</span> {new Date(plan.deadline).toLocaleDateString('pt-BR')}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#EAB308]">
            <AlertTriangle size={13} />
            War Room sem critério de saída definido.
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="p-4 border-l-4 border-l-[#95BBE2] bg-[#0A1E2C]/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-[#95BBE2]" />
          <p className="text-xs font-semibold text-[#EBEBEB] uppercase tracking-wider">
            Plano da War Room · {plan.clientName}
          </p>
        </div>
        {!hasExitCriteria && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#EAB308] bg-[#EAB308]/10 border border-[#EAB308]/20 rounded px-2 py-1">
            <AlertTriangle size={11} />
            Sem critério de saída — não pode encerrar
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
            Diagnóstico (hipótese de causa)
          </label>
          <textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Por que este cliente está crítico? Qual a causa provável?"
            rows={3}
            className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50 resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
            Critério de saída (mensurável) *
          </label>
          <textarea
            value={exitCriteria}
            onChange={(e) => setExitCriteria(e.target.value)}
            placeholder="Ex.: ROAS ≥ 1,5 por 2 semanas consecutivas"
            rows={2}
            className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
              Métrica do critério
            </label>
            <select
              value={exitMetric}
              onChange={(e) => setExitMetric(e.target.value)}
              className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
            >
              <option value="">— opcional —</option>
              {EXIT_METRIC_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
              Valor-alvo
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={exitTarget}
              onChange={(e) => setExitTarget(e.target.value)}
              placeholder="Ex.: 1.5"
              className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
              Responsável *
            </label>
            <select
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
            >
              <option value="">— selecione —</option>
              {responsibleOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-[#87919E] uppercase tracking-wider">
              Prazo *
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20 transition-colors disabled:opacity-50"
        >
          <Save size={12} />
          Salvar plano
        </button>

        {hasExitCriteria && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#87919E]">Encerrar:</span>
            <button
              onClick={() => handleClose('RESOLVIDO_POSITIVO')}
              disabled={isPending}
              title="Recuperado — critério atingido"
              className="flex items-center gap-1 text-[10px] text-[#22C55E] border border-[#22C55E]/30 rounded px-2 py-1 hover:bg-[#22C55E]/10 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={11} /> Recuperado
            </button>
            <button
              onClick={() => handleClose('ENCERRADO_NEUTRO')}
              disabled={isPending}
              title="Encerrado sem resolução clara"
              className="flex items-center gap-1 text-[10px] text-[#87919E] border border-[#38435C] rounded px-2 py-1 hover:bg-[#38435C]/30 transition-colors disabled:opacity-50"
            >
              <MinusCircle size={11} /> Neutro
            </button>
            <button
              onClick={() => handleClose('PERDIDO_CHURN')}
              disabled={isPending}
              title="Cliente cancelou"
              className="flex items-center gap-1 text-[10px] text-[#EF4444] border border-[#EF4444]/30 rounded px-2 py-1 hover:bg-[#EF4444]/10 transition-colors disabled:opacity-50"
            >
              <XCircle size={11} /> Churn
            </button>
          </div>
        )}
      </div>

      {msg && <p className="text-[11px] text-[#95BBE2]">{msg}</p>}
    </Card>
  )
}
