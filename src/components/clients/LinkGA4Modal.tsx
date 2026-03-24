'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { linkGA4Account } from '@/app/actions/platformAccounts'
import { useRouter } from 'next/navigation'

interface LinkGA4ModalProps {
  clientId: string
}

type Step = 'form' | 'linking' | 'done'

export function LinkGA4Modal({ clientId }: LinkGA4ModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [propertyId, setPropertyId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setStep('form')
    setPropertyId('')
    setName('')
    setError(null)
    setSuccessName(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function handleLink() {
    const trimmedId = propertyId.trim()
    if (!trimmedId) {
      setError('Informe o identificador da propriedade GA4.')
      return
    }
    setError(null)
    setStep('linking')

    startTransition(async () => {
      const result = await linkGA4Account(clientId, trimmedId, name.trim() || undefined)
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

  const stepLabel: Record<Step, string> = {
    form: 'Informe o identificador da propriedade',
    linking: 'Vinculando propriedade...',
    done: 'Propriedade vinculada com sucesso!',
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#E37400] hover:text-[#E37400]/80 transition-colors"
      >
        <Plus size={13} />
        Vincular GA4
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div>
                <h2 className="text-[#EBEBEB] font-semibold">Vincular propriedade GA4</h2>
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
                      Identificador da propriedade no Windsor
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#E37400] font-mono"
                      placeholder="Nome ou ID da propriedade"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      disabled={step === 'linking'}
                    />
                    <p className="text-[10px] text-[#87919E] mt-1">
                      Use o mesmo identificador configurado na conta Windsor
                      (nome da propriedade GA4).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#87919E] mb-1.5">
                      Nome de exibição{' '}
                      <span className="font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#E37400]"
                      placeholder="Ex: Site Principal"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={step === 'linking'}
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[#EF4444]">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleLink}
                    disabled={step === 'linking' || !propertyId.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#E37400] hover:bg-[#E37400]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
                  >
                    {step === 'linking' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Vinculando...
                      </>
                    ) : (
                      'Vincular propriedade'
                    )}
                  </button>
                </>
              )}

              {step === 'done' && (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                  <CheckCircle2 size={40} className="text-[#22C55E]" />
                  <div>
                    <p className="text-[#EBEBEB] font-semibold">Propriedade vinculada!</p>
                    <p className="text-[#87919E] text-sm mt-1">{successName}</p>
                  </div>
                  <button
                    onClick={close}
                    className="mt-2 bg-[#E37400] hover:bg-[#E37400]/90 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors"
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
