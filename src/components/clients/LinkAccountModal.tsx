'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { linkMetaAccount, validateWindsorMetaAccount } from '@/app/actions/platformAccounts'
import { useRouter } from 'next/navigation'

interface LinkAccountModalProps {
  clientId: string
  clientSlug: string
}

type Step = 'form' | 'verifying' | 'done'

export function LinkAccountModal({ clientId, clientSlug: _ }: LinkAccountModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [accountId, setAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setStep('form')
    setAccountId('')
    setAccountName('')
    setError(null)
    setSuccessName(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function handleVerifyAndLink() {
    const trimmedId = accountId.trim()
    if (!trimmedId) {
      setError('Informe o ID da conta de anúncios.')
      return
    }
    setError(null)
    setStep('verifying')

    startTransition(async () => {
      // Valida acesso via Windsor antes de salvar
      const validation = await validateWindsorMetaAccount(trimmedId)
      if (!validation.valid) {
        setError(validation.error ?? 'Conta não acessível via Windsor.')
        setStep('form')
        return
      }

      const result = await linkMetaAccount(
        clientId,
        trimmedId,
        accountName.trim() || undefined
      )
      if (result.error) {
        setError(result.error)
        setStep('form')
        return
      }

      setSuccessName(result.accountName ?? trimmedId)
      setStep('done')
      router.refresh()
    })
  }

  const stepLabel = {
    form: 'Informe o ID da conta de anúncios',
    verifying: 'Verificando acesso via Windsor...',
    done: 'Conta vinculada com sucesso!',
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#95BBE2] hover:text-[#EBEBEB] transition-colors"
      >
        <Plus size={13} />
        Vincular Meta
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div>
                <h2 className="text-[#EBEBEB] font-semibold">Vincular conta Meta Ads</h2>
                <p className="text-[#87919E] text-xs mt-0.5">{stepLabel[step]}</p>
              </div>
              <button
                onClick={close}
                className="text-[#87919E] hover:text-[#EBEBEB] transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {step !== 'done' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#87919E] mb-1.5">
                      ID da conta de anúncios (Ad Account ID)
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] font-mono"
                      placeholder="act_XXXXXXXXXX ou só o número"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      disabled={step === 'verifying'}
                    />
                    <p className="text-[10px] text-[#87919E] mt-1">
                      Encontre em Meta Business → Configurações → Contas de Anúncios.
                      A conta deve estar conectada no Windsor.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#87919E] mb-1.5">
                      Nome da conta{' '}
                      <span className="text-[#87919E] font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2]"
                      placeholder="Ex: Conta Principal"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      disabled={step === 'verifying'}
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[#EF4444]">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleVerifyAndLink}
                    disabled={step === 'verifying' || !accountId.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#95BBE2] hover:bg-[#95BBE2]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#05141C] font-semibold rounded-xl py-2.5 text-sm transition-colors"
                  >
                    {step === 'verifying' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Verificando via Windsor...
                      </>
                    ) : (
                      'Verificar e vincular'
                    )}
                  </button>
                </>
              )}

              {step === 'done' && (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                  <CheckCircle2 size={40} className="text-[#22C55E]" />
                  <div>
                    <p className="text-[#EBEBEB] font-semibold">Conta vinculada!</p>
                    <p className="text-[#87919E] text-sm mt-1">{successName}</p>
                  </div>
                  <button
                    onClick={close}
                    className="mt-2 bg-[#95BBE2] hover:bg-[#95BBE2]/90 text-[#05141C] font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
