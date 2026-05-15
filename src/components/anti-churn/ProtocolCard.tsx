'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldAlert, Clock, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { updateProtocolStatus, updateProtocolBriefing } from '@/app/actions/protocols'
import { CriticalProtocolStatus, AlertType } from '@prisma/client'
import Link from 'next/link'

type Protocol = {
  id: string
  trigger: AlertType
  status: CriticalProtocolStatus
  activatedAt: Date
  closedAt: Date | null
  briefingCS: string | null
  notes: string | null
  client: { name: string; slug: string }
  managerName: string
  daysSince: number
}

const STATUS_LABELS: Record<CriticalProtocolStatus, string> = {
  ATIVADO:      'Ativado',
  EM_EXECUCAO:  'Em Execução',
  MONITORANDO:  'Monitorando',
  ENCERRADO:    'Encerrado',
}

const STATUS_COLORS: Record<CriticalProtocolStatus, string> = {
  ATIVADO:      'border-l-[#EF4444]',
  EM_EXECUCAO:  'border-l-[#EAB308]',
  MONITORANDO:  'border-l-[#95BBE2]',
  ENCERRADO:    'border-l-[#38435C]',
}

const STATUS_BADGE: Record<CriticalProtocolStatus, 'ruim' | 'regular' | 'otimo'> = {
  ATIVADO:      'ruim',
  EM_EXECUCAO:  'regular',
  MONITORANDO:  'otimo',
  ENCERRADO:    'otimo',
}

const TRIGGER_LABELS: Record<AlertType, string> = {
  ROAS_BELOW_TARGET_2W:          'ROAS abaixo por 2 semanas',
  FATURAMENTO_BELOW_70PCT_WEEK2: 'Faturamento <70% na 2ª semana',
  STATUS_DROPPED_TO_RUIM:        'Status caiu para Ruim',
  STATUS_DROPPED_TO_REGULAR:     'Status caiu para Regular',
  STATUS_IMPROVED_TO_OTIMO:      'Status melhorou para Ótimo',
  SYNC_FAILED:                   'Falha de sync',
  BUDGET_EXHAUSTED:              'Orçamento esgotado',
  BUDGET_WARNING:                'Budget quase esgotado',
  KPI_DROP_24H:                  'Queda de KPI 24h',
  KPI_SPIKE_24H:                 'Alta de KPI 24h',
  CONTRACT_EXPIRING_SOON:        'Contrato vencendo',
}

const NEXT_STATUS: Partial<Record<CriticalProtocolStatus, { to: CriticalProtocolStatus; label: string }>> = {
  ATIVADO:     { to: 'EM_EXECUCAO', label: 'Diagnóstico feito → Em Execução' },
  EM_EXECUCAO: { to: 'MONITORANDO', label: 'CS comunicou → Monitorando' },
  MONITORANDO: { to: 'ENCERRADO',   label: 'Encerrar protocolo' },
}

export function ProtocolCard({ protocol, role }: { protocol: Protocol; role: string }) {
  const [expanded, setExpanded] = useState(false)
  const [briefing, setBriefing] = useState(protocol.briefingCS ?? '')
  const [isPending, startTransition] = useTransition()

  const canEdit = role === 'ADMIN' || role === 'MANAGER' || role === 'CS'
  const next = NEXT_STATUS[protocol.status]
  const isEncerrado = protocol.status === 'ENCERRADO'

  function handleStatusAdvance() {
    if (!next) return
    startTransition(() => updateProtocolStatus(protocol.id, next.to))
  }

  function handleSaveBriefing() {
    startTransition(() => updateProtocolBriefing(protocol.id, briefing))
  }

  return (
    <Card className={`p-5 border-l-4 ${STATUS_COLORS[protocol.status]} ${isEncerrado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#0A1E2C] flex items-center justify-center flex-shrink-0 mt-0.5">
            <ShieldAlert size={18} className={isEncerrado ? 'text-[#87919E]' : 'text-[#EF4444]'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                href={`/clients/${protocol.client.slug}`}
                className="text-sm font-semibold text-[#95BBE2] hover:underline"
              >
                {protocol.client.name}
              </Link>
              <Badge variant={STATUS_BADGE[protocol.status]}>
                {STATUS_LABELS[protocol.status]}
              </Badge>
            </div>
            <p className="text-xs text-[#87919E]">
              {TRIGGER_LABELS[protocol.trigger]} · Gestor: <span className="text-[#EBEBEB]">{protocol.managerName}</span>
            </p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-[#87919E]/70">
              <Clock size={10} />
              <span>
                {isEncerrado
                  ? `Encerrado após ${protocol.daysSince} dia${protocol.daysSince !== 1 ? 's' : ''}`
                  : `${protocol.daysSince} dia${protocol.daysSince !== 1 ? 's' : ''} ativo`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && next && !isEncerrado && (
            <button
              onClick={handleStatusAdvance}
              disabled={isPending}
              className="text-xs text-[#95BBE2] border border-[#95BBE2]/30 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/10 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {next.label}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[#87919E] hover:text-[#EBEBEB] transition-colors p-1"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[#38435C] space-y-3">
          <div>
            <p className="text-xs font-medium text-[#87919E] uppercase tracking-wider mb-2">
              Briefing para o CS
            </p>
            {canEdit && !isEncerrado ? (
              <div className="space-y-2">
                <textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  placeholder="O que está acontecendo · O que já foi feito · O que será feito · O que NÃO dizer ao cliente"
                  rows={5}
                  className="w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50 resize-none"
                />
                <button
                  onClick={handleSaveBriefing}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20 transition-colors disabled:opacity-50"
                >
                  <Save size={12} />
                  Salvar briefing
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#87919E] whitespace-pre-wrap">
                {protocol.briefingCS || 'Nenhum briefing registrado ainda.'}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[10px] text-[#87919E]/50">
              Ativado em {new Date(protocol.activatedAt).toLocaleDateString('pt-BR')}
              {protocol.closedAt && ` · Encerrado em ${new Date(protocol.closedAt).toLocaleDateString('pt-BR')}`}
            </p>
            {canEdit && protocol.status === 'MONITORANDO' && (
              <button
                onClick={() => startTransition(() => updateProtocolStatus(protocol.id, 'ENCERRADO'))}
                disabled={isPending}
                className="text-[10px] text-[#EF4444]/70 hover:text-[#EF4444] transition-colors disabled:opacity-50"
              >
                Encerrar protocolo
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
