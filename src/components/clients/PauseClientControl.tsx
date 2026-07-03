'use client'

import { useState } from 'react'
import { PauseCircle, PlayCircle, X, AlertTriangle } from 'lucide-react'
import { pauseClient, resumeClient } from '@/app/actions/updateClient'
import { useModalA11y } from '@/lib/useModalA11y'

interface Props {
  clientId: string
  status: string
  pausedAt: string | null
  pauseReason: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Controle de PAUSA/RETOMADA do cliente (T-23). Quando pausado, exibe o selo
 * "Pausado desde DD/MM — {motivo}" e o botão de retomar. Quando ativo, oferece
 * o botão de pausar (pede motivo obrigatório). Cliente CHURNED não mostra nada
 * (não é pausável).
 */
export function PauseClientControl({ clientId, status, pausedAt, pauseReason }: Props) {
  const [modal, setModal] = useState<'pause' | 'resume' | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(() => setModal(null))

  if (status === 'CHURNED') return null

  async function handlePause() {
    setLoading(true)
    setError(null)
    const res = await pauseClient(clientId, reason)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setModal(null)
    window.location.reload()
  }

  async function handleResume() {
    setLoading(true)
    setError(null)
    const res = await resumeClient(clientId)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setModal(null)
    window.location.reload()
  }

  return (
    <>
      {status === 'PAUSED' ? (
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border"
            style={{ color: '#F59E0B', borderColor: '#F59E0B55', background: '#F59E0B14' }}
          >
            <PauseCircle size={13} />
            Pausado{pausedAt ? ` desde ${formatDate(pausedAt)}` : ''}
            {pauseReason ? ` — ${pauseReason}` : ''}
          </span>
          <button
            onClick={() => { setError(null); setModal('resume') }}
            className="flex items-center gap-1.5 text-xs text-[#22C55E] hover:text-[#16A34A] transition-colors"
          >
            <PlayCircle size={13} />
            Retomar operação
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setReason(''); setError(null); setModal('pause') }}
          className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#F59E0B] bg-[#38435C]/40 hover:bg-[#38435C]/70 border border-[#38435C] px-3 py-1.5 rounded-lg transition-all"
        >
          <PauseCircle size={12} />
          Pausar cliente
        </button>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'pause' ? 'Pausar cliente' : 'Retomar operação do cliente'}
            className="lg-glass-strong bg-[#0A1E2C] border border-[#38435C] rounded-xl w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C]">
              <h2 className="text-sm font-semibold text-[#EBEBEB]">
                {modal === 'pause' ? 'Pausar cliente' : 'Retomar operação'}
              </h2>
              <button onClick={() => setModal(null)} className="text-[#87919E] hover:text-[#EBEBEB]">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {modal === 'pause' ? (
                <>
                  <p className="text-xs text-[#87919E]">
                    Enquanto pausado, o cliente deixa de ser cobrado por check-in, alertas de
                    saúde/resultado, radares de churn e relatório semanal — mas o contrato e o
                    financeiro seguem intactos. Ele continua visível na carteira com o selo de pausa.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#87919E]">Motivo da pausa *</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="Ex.: pausou a mídia por sazonalidade; em renegociação de contrato…"
                      className="w-full px-3 py-2 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 resize-none"
                    />
                    <p className="text-[10px] text-[#647488]">Máx. 300 caracteres. Aparece na carteira e nos alertas.</p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-[#87919E]">
                  O cliente volta a ser <span className="text-[#EBEBEB] font-medium">Ativo</span> e a
                  ser cobrado normalmente por check-ins, saúde, churn e relatório semanal.
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2">
                  <AlertTriangle size={13} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-[#EBEBEB]">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setModal(null)}
                  className="px-4 py-2 text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={modal === 'pause' ? handlePause : handleResume}
                  disabled={loading || (modal === 'pause' && !reason.trim())}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${
                    modal === 'pause'
                      ? 'bg-[#F59E0B] text-[#0A1E2C] hover:bg-[#F59E0B]/90'
                      : 'bg-[#22C55E] text-white hover:bg-[#16A34A]'
                  }`}
                >
                  {loading ? '...' : modal === 'pause' ? 'Pausar cliente' : 'Retomar operação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
