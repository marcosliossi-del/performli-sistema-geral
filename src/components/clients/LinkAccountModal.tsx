'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react'
import { linkMetaAccount, validateMetaToken } from '@/app/actions/platformAccounts'
import { useRouter } from 'next/navigation'

interface LinkAccountModalProps {
  clientId: string
  clientSlug: string
}

type Step = 'form' | 'verifying' | 'accounts' | 'linking' | 'done'

interface AdAccount {
  id: string
  name: string
  currency: string
}

export function LinkAccountModal({ clientId, clientSlug }: LinkAccountModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successName, setSuccessName] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setStep('form')
    setToken('')
    setAccounts([])
    setSelectedAccountId('')
    setError(null)
    setSuccessName(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function handleVerify() {
    if (!token.trim()) {
      setError('Informe o token de acesso.')
      return
    }
    setError(null)
    setStep('verifying')

    startTransition(async () => {
      const result = await validateMetaToken(token.trim())
      if (!result.valid) {
        setError(result.error ?? 'Token inválido.')
        setStep('form')
        return
      }
      setAccounts(result.accounts)
      if (result.accounts.length === 1) {
        setSelectedAccountId(result.accounts[0].id)
      }
      setStep('accounts')
    })
  }

  function handleLink() {
    if (!selectedAccountId) {
      setError('Selecione uma conta de anúncios.')
      return
    }
    setError(null)
    setStep('linking')

    const selected = accounts.find((a) => a.id === selectedAccountId)

    startTransition(async () => {
      const result = await linkMetaAccount(
        clientId,
        selectedAccountId,
        token.trim(),
        selected?.name
      )
      if (result.error) {
        setError(result.error)
        setStep('accounts')
        return
      }
      setSuccessName(result.accountName ?? selectedAccountId)
      setStep('done')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#95BBE2] hover:text-[#EBEBEB] transition-colors"
      >
        <Plus size={13} />
        Vincular conta Meta
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <div>
                <h2 className="text-[#EBEBEB] font-semibold">Vincular conta Meta Ads</h2>
                <p className="text-[#87919E] text-xs mt-0.5">
                  {step === 'form' && 'Cole o token de acesso do Meta Business'}
                  {step === 'verifying' && 'Verificando token...'}
                  {step === 'accounts' && 'Selecione a conta de anúncios'}
                  {step === 'linking' && 'Vinculando conta...'}
                  {step === 'done' && 'Conta vinculada com sucesso!'}
                </p>
              </div>
              <button
                onClick={close}
                className="text-[#87919E] hover:text-[#EBEBEB] transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Step: form */}
              {(step === 'form' || step === 'verifying') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#87919E] mb-1.5">
                      Token de acesso (User Access Token ou System User Token)
                    </label>
                    <textarea
                      className="w-full bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-xs text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] resize-none font-mono"
                      rows={3}
                      placeholder="EAAxxxxxxxxxxxxxxx..."
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      disabled={step === 'verifying'}
                    />
                    <p className="text-[10px] text-[#87919E] mt-1">
                      Gere um token com permissões <code className="text-[#95BBE2]">ads_read</code> e <code className="text-[#95BBE2]">business_management</code>.
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[#EF4444]">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleVerify}
                    disabled={step === 'verifying' || !token.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#95BBE2] hover:bg-[#95BBE2]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#05141C] font-semibold rounded-xl py-2.5 text-sm transition-colors"
                  >
                    {step === 'verifying' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      'Verificar token'
                    )}
                  </button>
                </>
              )}

              {/* Step: accounts */}
              {(step === 'accounts' || step === 'linking') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#87919E] mb-1.5">
                      Conta de anúncios ({accounts.length} {accounts.length === 1 ? 'encontrada' : 'encontradas'})
                    </label>
                    {accounts.length === 0 ? (
                      <p className="text-sm text-[#87919E] text-center py-4">
                        Nenhuma conta de anúncios acessível com este token.
                      </p>
                    ) : (
                      <div className="relative">
                        <select
                          className="w-full appearance-none bg-[#05141C] border border-[#38435C] rounded-xl px-3 py-2.5 text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] pr-8"
                          value={selectedAccountId}
                          onChange={(e) => setSelectedAccountId(e.target.value)}
                          disabled={step === 'linking'}
                        >
                          <option value="">Selecione uma conta...</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.id}) — {acc.currency}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87919E] pointer-events-none"
                        />
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[#EF4444]">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setStep('form'); setError(null) }}
                      disabled={step === 'linking'}
                      className="flex-1 border border-[#38435C] hover:border-[#95BBE2] text-[#87919E] hover:text-[#EBEBEB] rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleLink}
                      disabled={step === 'linking' || !selectedAccountId}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#95BBE2] hover:bg-[#95BBE2]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#05141C] font-semibold rounded-xl py-2.5 text-sm transition-colors"
                    >
                      {step === 'linking' ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Vinculando...
                        </>
                      ) : (
                        'Vincular conta'
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* Step: done */}
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
