import Link from 'next/link'
import { requireSession, getAceiteOperacional } from '@/lib/dal'
import type { AceiteSignal } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { ShieldCheck, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AceitePage() {
  const { userId, role } = await requireSession()
  const { signals, geradoEm } = await getAceiteOperacional(userId, role)

  const criticos = signals.filter((s) => s.severity === 'critico')
  const atencao = signals.filter((s) => s.severity === 'atencao')
  const ok = signals.filter((s) => s.severity === 'ok')
  const tudoOk = criticos.length === 0 && atencao.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Aceite Operacional</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          O que pode quebrar silenciosamente — atraso, falta de dono, falta de evidência, rotina que não rodou.
        </p>
        <p className="text-[10px] text-[#576070] mt-1 tabular">
          Atualizado em {new Date(geradoEm).toLocaleString('pt-BR')}
        </p>
      </div>

      {tudoOk ? (
        <Card className="p-8 text-center">
          <ShieldCheck size={30} className="text-[#22C55E] mx-auto mb-2" />
          <p className="text-[#EBEBEB] font-medium">Operação saudável</p>
          <p className="text-[#87919E] text-sm mt-1">Nenhum processo crítico quebrando agora.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {criticos.length > 0 && (
            <Section title="Crítico — agir hoje" tone="text-[#EF4444]" icon={AlertTriangle}>
              {criticos.map((s) => <SignalRow key={s.key} s={s} />)}
            </Section>
          )}
          {atencao.length > 0 && (
            <Section title="Em atenção" tone="text-[#EAB308]" icon={AlertTriangle}>
              {atencao.map((s) => <SignalRow key={s.key} s={s} />)}
            </Section>
          )}
        </div>
      )}

      {ok.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#576070] mb-2">Sob controle</p>
          <div className="flex flex-wrap gap-2">
            {ok.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-[#87919E] bg-[#0A1E2C]/40 border border-[#38435C]/50 rounded-full px-2.5 py-1">
                <CheckCircle2 size={12} className="text-[#22C55E]" /> {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, tone, icon: Icon, children }: { title: string; tone: string; icon: typeof AlertTriangle; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={tone} />
        <h2 className={`text-sm font-semibold ${tone}`}>{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SignalRow({ s }: { s: AceiteSignal }) {
  const border = s.severity === 'critico' ? 'border-[#EF4444]/30' : 'border-[#EAB308]/30'
  const numColor = s.severity === 'critico' ? 'text-[#EF4444]' : 'text-[#EAB308]'
  return (
    <Link href={s.href} className={`flex items-center gap-4 px-4 py-3 rounded-xl border bg-[#0F1623] hover:bg-[#141C2B] transition-colors ${border}`}>
      <span className={`text-2xl font-bold tabular w-12 text-center shrink-0 ${numColor}`}>{s.count}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[#EBEBEB] text-sm font-medium">{s.label}</p>
        <p className="text-[11px] text-[#87919E]">{s.problema}</p>
      </div>
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-[#576070]">Ação</p>
        <p className="text-[11px] text-[#95BBE2]">{s.acao}</p>
      </div>
      <ArrowRight size={15} className="text-[#576070] shrink-0" />
    </Link>
  )
}
