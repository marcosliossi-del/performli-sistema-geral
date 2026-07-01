import Link from 'next/link'
import { requireSession, getMinhaSemana, getGestoresCarga } from '@/lib/dal'
import type { MinhaTarefa, GestorCarga } from '@/lib/dal'
import { Card } from '@/components/ui/card'
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, label } from '@/components/operacional/labels'
import { AlertTriangle, CalendarClock, CalendarRange, Clock, CircleHelp, CheckCircle2, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

const BUCKET_ICON = {
  atrasadas: AlertTriangle,
  hoje: CalendarClock,
  estaSemana: CalendarRange,
  depois: Clock,
  semPrazo: CircleHelp,
} as const

const BUCKET_TONE: Record<string, string> = {
  atrasadas: 'text-[#EF4444]',
  hoje: 'text-[#EAB308]',
  estaSemana: 'text-[#95BBE2]',
  depois: 'text-[#87919E]',
  semPrazo: 'text-[#87919E]',
}

export default async function MeuDiaPage() {
  const { userId, role, name: userName } = await requireSession()
  const [semana, gestores] = await Promise.all([
    getMinhaSemana(userId),
    getGestoresCarga(role),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Meu Dia · Minha Semana</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          {userName ? `${userName.split(' ')[0]}, ` : ''}
          o que precisa da sua ação — por ordem de urgência.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResumoKpi label="Atrasadas" value={semana.atrasadasCount} tone={semana.atrasadasCount > 0 ? 'text-[#EF4444]' : 'text-[#87919E]'} icon={AlertTriangle} />
        <ResumoKpi label="Para hoje" value={semana.hojeCount} tone={semana.hojeCount > 0 ? 'text-[#EAB308]' : 'text-[#87919E]'} icon={CalendarClock} />
        <ResumoKpi label="Abertas (total)" value={semana.total} tone="text-[#EBEBEB]" icon={Clock} />
        <Card className="p-3 flex flex-col justify-center">
          <Link href="/operacional" className="text-[11px] text-[#95BBE2] hover:underline">Ver Central Operacional →</Link>
        </Card>
      </div>

      {semana.total === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 size={28} className="text-[#22C55E] mx-auto mb-2" />
          <p className="text-[#EBEBEB] font-medium">Nada na sua fila</p>
          <p className="text-[#87919E] text-sm mt-1">Você não tem tarefas abertas atribuídas.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {semana.buckets.filter((b) => b.tasks.length > 0).map((b) => {
            const Icon = BUCKET_ICON[b.key]
            return (
              <div key={b.key}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={15} className={BUCKET_TONE[b.key]} />
                  <h2 className={`text-sm font-semibold ${BUCKET_TONE[b.key]}`}>{b.label}</h2>
                  <span className="text-[11px] text-[#87919E]">· {b.tasks.length} · {b.pergunta}</span>
                </div>
                <div className="space-y-1.5">
                  {b.tasks.map((t) => <TarefaLinha key={t.id} t={t} urgente={b.key === 'atrasadas'} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {gestores && gestores.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className="text-[#95BBE2]" />
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Carga por gestor</h2>
            <span className="text-[11px] text-[#87919E]">· quem está acumulando demanda</span>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[#87919E] border-b border-[#1F2937]">
                  <th className="text-left font-medium px-3 py-2">Gestor</th>
                  <th className="text-right font-medium px-3 py-2">Abertas</th>
                  <th className="text-right font-medium px-3 py-2">Atrasadas</th>
                  <th className="text-right font-medium px-3 py-2">Sem prazo</th>
                  <th className="text-right font-medium px-3 py-2">Concluídas (7d)</th>
                </tr>
              </thead>
              <tbody>
                {gestores.map((g) => <GestorLinha key={g.id} g={g} />)}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}

function ResumoKpi({ label: l, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: typeof Clock }) {
  return (
    <Card className="p-3 ak-lift">
      <div className="flex items-center gap-2">
        <Icon size={14} className={tone} />
        <p className="text-[10px] text-[#87919E] uppercase tracking-wider">{l}</p>
      </div>
      <p className={`text-2xl font-bold mt-1 tabular ${tone}`}>{value}</p>
    </Card>
  )
}

function TarefaLinha({ t, urgente }: { t: MinhaTarefa; urgente: boolean }) {
  return (
    <Link
      href={`/operacional?task=${t.id}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-[#0F1623] hover:bg-[#141C2B] transition-colors ${urgente ? 'border-[#EF4444]/30' : 'border-[#1F2937]'}`}
    >
      <span className={`text-[11px] shrink-0 ${PRIORITY_COLORS[t.priority] ?? 'text-[#87919E]'}`}>
        {label(PRIORITY_LABELS, t.priority)}
      </span>
      <span className="flex-1 min-w-0 truncate text-[#EBEBEB]">{t.title}</span>
      {t.clientName && <span className="text-[11px] text-[#87919E] shrink-0 hidden sm:inline">{t.clientName}</span>}
      {t.popCode && <span className="text-[10px] text-[#576070] shrink-0 hidden md:inline">{t.popCode}</span>}
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[t.status] ?? 'text-[#87919E] border-[#38435C]'}`}>
        {label(STATUS_LABELS, t.status)}
      </span>
      <span className="text-[11px] text-[#87919E] shrink-0 w-14 text-right">
        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
      </span>
    </Link>
  )
}

function GestorLinha({ g }: { g: GestorCarga }) {
  return (
    <tr className={`border-b border-[#1F2937] last:border-0 ${g.gargalo ? 'bg-[#EF4444]/5' : ''}`}>
      <td className="px-3 py-2">
        <span className="text-[#EBEBEB]">{g.name}</span>
        <span className="text-[10px] text-[#576070] ml-2">{g.role}</span>
        {g.gargalo && <span className="text-[10px] text-[#EF4444] ml-2">· gargalo</span>}
      </td>
      <td className="px-3 py-2 text-right text-[#EBEBEB]">{g.abertas}</td>
      <td className={`px-3 py-2 text-right ${g.atrasadas > 0 ? 'text-[#EF4444] font-medium' : 'text-[#87919E]'}`}>{g.atrasadas}</td>
      <td className={`px-3 py-2 text-right ${g.semPrazo > 0 ? 'text-[#EAB308]' : 'text-[#87919E]'}`}>{g.semPrazo}</td>
      <td className="px-3 py-2 text-right text-[#22C55E]">{g.concluidas7d}</td>
    </tr>
  )
}
