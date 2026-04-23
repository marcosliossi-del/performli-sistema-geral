'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Copy, Check, RefreshCw, Loader2 } from 'lucide-react'

interface Props {
  appUrl: string
  hasKey: boolean
}

export function AsaasStatus({ appUrl, hasKey }: Props) {
  const [copied,  setCopied]  = useState(false)
  const [testing, setTesting] = useState(false)
  const [ok,      setOk]      = useState<boolean | null>(null)

  const webhookUrl = `${appUrl}/api/asaas/webhook`

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function testConnection() {
    setTesting(true)
    setOk(null)
    try {
      const res = await fetch('/api/asaas/sync', { method: 'POST' })
      setOk(res.ok)
    } catch {
      setOk(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        {hasKey ? (
          <>
            <CheckCircle size={15} className="text-[#22C55E]" />
            <span className="text-sm text-[#22C55E] font-medium">API Key configurada</span>
          </>
        ) : (
          <>
            <XCircle size={15} className="text-[#EF4444]" />
            <span className="text-sm text-[#EF4444]">API Key não encontrada</span>
          </>
        )}
        {ok === true  && <span className="text-xs text-[#22C55E]">· Conexão OK</span>}
        {ok === false && <span className="text-xs text-[#EF4444]">· Falha na conexão</span>}
      </div>

      {/* Webhook URL */}
      <div className="space-y-1.5">
        <label className="text-xs text-[#87919E]">URL do Webhook (cadastre no painel Asaas)</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-xs text-[#95BBE2] flex items-center overflow-hidden">
            <span className="truncate">{webhookUrl}</span>
          </code>
          <button
            onClick={copyWebhook}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[#38435C] text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors flex-shrink-0"
          >
            {copied ? <Check size={12} className="text-[#22C55E]" /> : <Copy size={12} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Test */}
      <button
        onClick={testConnection}
        disabled={testing || !hasKey}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[#87919E] hover:text-[#EBEBEB] border border-[#38435C] transition-colors disabled:opacity-50"
      >
        {testing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Testar sincronização
      </button>

      {!hasKey && (
        <p className="text-[11px] text-[#87919E]">
          Adicione <code className="text-[#95BBE2]">ASAAS_API_KEY</code> nas variáveis de ambiente do Vercel.
        </p>
      )}
    </div>
  )
}
