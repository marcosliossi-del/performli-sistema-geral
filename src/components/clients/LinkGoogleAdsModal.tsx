'use client'

import { useState, useTransition } from 'react'
import { validateGoogleAdsAccount, linkGoogleAdsAccount } from '@/app/actions/platformAccounts'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'

interface Props {
  clientId: string
}

type Step = 'form' | 'verifying' | 'done'

export function LinkGoogleAdsModal({ clientId }: Props) {
  const [open,        setOpen]        = useState(false)
  const [step,        setStep]        = useState<Step>('form')
  const [customerId,  setCustomerId]  = useState('')
  const [accountName, setAccountName] = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)
  const [,            startTransition] = useTransition()
  const router = useRouter()

  function reset() { setStep('form'); setCustomerId(''); setAccountName(''); setError(null); setSuccessName(null) }
  function close()  { setOpen(false); reset() }

  function handleLink() {
    const id = customerId.trim()
    if (!id) { setError('Informe o Customer ID da conta Google Ads.'); return }
    setError(null)
    setStep('verifying')

    startTransition(async () => {
      const validation = await validateGoogleAdsAccount(id)
      if (!validation.valid) {
        setError(validation.error ?? 'Conta não acessível. Verifique o Customer ID e as credenciais do Service Account.')
        setStep('form')
        return
      }

      const result = await linkGoogleAdsAccount(clientId, id, accountName.trim() || undefined)
      if (result.error) {
        setError(result.error)
        setStep('form')
        return
      }

      setSuccessName(result.accountName ?? id)
      setStep('done')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[#4285F4] border border-[#4285F4]/30 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus size={12} />
        Google Ads
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C]">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#4285F4]/20 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-[#4285F4]">G</span>
                </div>
                <h2 className="text-sm font-semibold text-[#EBEBEB]">Vincular Google Ads</h2>
              </div>
              <button onClick={close} className="text-[#87919E] hover:text-[#EBEBEB]"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
              {step === 'done' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 size={32} className="text-[#22C55E]" />
                  <p className="text-sm font-semibold text-[#EBEBEB]">Conta vinculada!</p>
                  <p className="text-xs text-[#87919E]">{successName}</p>
                  <button onClick={close} className="mt-2 px-4 py-2 text-sm bg-[#95BBE2] text-[#0A1E2C] font-semibold rounded-lg">Fechar</button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#87919E]">Customer ID <span className="text-[#EF4444]">*</span></label>
                    <input
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      placeholder="123-456-7890 ou 1234567890"
                      className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#4285F4]/50"
                    />
                    <p className="text-[10px] text-[#87919E]">Encontre em: Google Ads → Admin → Informações da conta</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#87919E]">Nome (opcional)</label>
                    <input
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Ex: Google Ads — Loja X"
                      className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#4285F4]/50"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3">
                      <AlertCircle size={14} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-[#EF4444]">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={close} className="flex-1 px-4 py-2 text-sm text-[#87919E] hover:text-[#EBEBEB] border border-[#38435C] rounded-lg transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleLink}
                      disabled={step === 'verifying'}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-[#4285F4] text-white font-semibold rounded-lg hover:bg-[#4285F4]/90 disabled:opacity-50 transition-colors"
                    >
                      {step === 'verifying' ? <><Loader2 size={14} className="animate-spin" /> Verificando...</> : 'Vincular'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
