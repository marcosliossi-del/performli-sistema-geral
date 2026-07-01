import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ArrowRight, type LucideIcon } from 'lucide-react'

export type Severity = 'critical' | 'warning' | 'ok' | 'neutral'

const SEV: Record<Severity, { border: string; value: string; icon: string }> = {
  critical: { border: 'border-l-[#EF4444]', value: 'text-[#EF4444]', icon: 'text-[#EF4444]' },
  warning:  { border: 'border-l-[#EAB308]', value: 'text-[#EAB308]', icon: 'text-[#EAB308]' },
  ok:       { border: 'border-l-[#22C55E]', value: 'text-[#22C55E]', icon: 'text-[#22C55E]' },
  neutral:  { border: 'border-l-[#95BBE2]', value: 'text-[#EBEBEB]', icon: 'text-[#95BBE2]' },
}

/**
 * Card orientado à ação do Cockpit. Responde às 6 perguntas do CLAUDE.md:
 * título (o que vejo / o que está errado) · why (por que importa) ·
 * responsible (quem) · deadline (prazo) · impact (impacto se não) · action (ação agora).
 */
export function OperationalCard({
  icon: Icon,
  title,
  value,
  severity = 'neutral',
  why,
  responsible,
  deadline,
  impact,
  action,
}: {
  icon: LucideIcon
  title: string
  value: ReactNode
  severity?: Severity
  why: string
  responsible?: string
  deadline?: string
  impact?: string
  action?: { href: string; label: string }
}) {
  const sev = SEV[severity]
  return (
    <Card className={`p-4 border-l-4 ${sev.border} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className={sev.icon} />
          <p className="text-xs font-semibold text-[#EBEBEB]">{title}</p>
        </div>
        <p className={`text-2xl font-bold leading-none ${sev.value}`}>{value}</p>
      </div>

      <p className="text-[11px] text-[#87919E] leading-snug">{why}</p>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#87919E]/80">
        {responsible && <span>Responsável: <span className="text-[#EBEBEB]">{responsible}</span></span>}
        {deadline && <span>Prazo: <span className="text-[#EBEBEB]">{deadline}</span></span>}
      </div>
      {impact && <p className="text-[10px] text-[#87919E]/70 italic">Se não agir: {impact}</p>}

      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline self-start"
        >
          {action.label} <ArrowRight size={11} />
        </Link>
      )}
    </Card>
  )
}
