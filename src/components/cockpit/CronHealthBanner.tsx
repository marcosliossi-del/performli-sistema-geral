import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CronHealth } from '@/lib/dal'

/**
 * WATCHDOG de cron (S1-007) — camada 2, superfície de aviso.
 *
 * Quando a atualização automática (cron diário) para de rodar, health/churn
 * congelam e as telas passam a mostrar dado velho como se fosse atual
 * (CLAUDE.md #9/#10). Este banner denuncia isso no Cockpit, em linguagem
 * operacional. Roda no servidor quando o Marcos abre a tela — não depende do
 * cron estar vivo.
 *
 * - `stale` → banner de alerta vermelho, com há quanto tempo e a última sync.
 * - saudável → nota discreta "Atualizado há X h" (cumpre a regra 10).
 */
export function CronHealthBanner({ health }: { health: CronHealth }) {
  const { stale, horasAtras, lastRunAt } = health

  const ultimaSync = lastRunAt
    ? new Date(lastRunAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  if (!stale) {
    // Saudável: nota discreta de frescor do dado.
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-[#87919E]">
        <CheckCircle2 size={12} className="text-[#22C55E]" />
        Atualização automática em dia
        {horasAtras !== null && ` · rodou há ${horasAtras}h`}
        {ultimaSync && ` (${ultimaSync})`}
      </p>
    )
  }

  const quanto =
    horasAtras !== null ? `há ${horasAtras} horas` : 'e não há registro de execução'

  return (
    <div
      role="alert"
      className="lg-card flex items-start gap-3 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-3"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#EF4444]" />
      <div className="text-sm">
        <p className="font-semibold text-[#EF4444]">
          A atualização automática não roda {quanto} — os números abaixo podem estar desatualizados.
        </p>
        <p className="mt-0.5 text-[12px] text-[#EBEBEB]/80">
          {ultimaSync
            ? `Última sincronização: ${ultimaSync}.`
            : 'A rotina diária nunca registrou execução.'}{' '}
          Verifique o cron diário (/api/cron/daily) antes de tomar decisões pelos indicadores.
        </p>
      </div>
    </div>
  )
}
