'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, CheckCircle, XCircle, RefreshCw, Trash2, Loader2, ExternalLink, FlaskConical, Copy } from 'lucide-react'

interface Status {
  configured: boolean
  connected:  boolean
  number?:    string
  name?:      string
  instanceId?: string
}

export function WhatsAppConnect() {
  const [status,    setStatus]    = useState<Status | null>(null)
  const [qr,        setQr]        = useState<string | null>(null)
  const [qrError,   setQrError]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [polling,   setPolling]   = useState(false)
  const [testing,   setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)
  const [form, setForm] = useState({ instanceId: '', token: '', clientToken: '' })

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : '/api/webhooks/whatsapp'

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/webhooks/whatsapp/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      setTestResult(data.ok ? 'Lead de teste criado no CRM!' : (data.error ?? 'Erro'))
    } catch {
      setTestResult('Erro de conexão')
    }
    setTesting(false)
  }

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/settings/whatsapp')
    if (res.ok) {
      const data = await res.json()
      setStatus(data)
      if (data.instanceId) setForm(f => ({ ...f, instanceId: data.instanceId }))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Poll every 4s while QR is shown
  useEffect(() => {
    if (!qr || status?.connected) return
    setPolling(true)
    const interval = setInterval(async () => {
      const res = await fetch('/api/settings/whatsapp')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.connected) { setQr(null); setPolling(false); clearInterval(interval) }
      }
    }, 4000)
    return () => { clearInterval(interval); setPolling(false) }
  }, [qr, status?.connected])

  async function handleSave() {
    if (!form.instanceId || !form.token) return
    setSaving(true)
    setQrError(null)
    try {
      const res = await fetch('/api/settings/whatsapp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      setStatus(data)
      if (!data.connected) await fetchQr()
    } finally {
      setSaving(false)
    }
  }

  async function fetchQr() {
    setQrError(null)
    const res  = await fetch('/api/settings/whatsapp', { method: 'PATCH' })
    const data = await res.json()
    if (data.qr) {
      setQr(data.qr)
    } else {
      setQrError(data.error ?? 'Não foi possível gerar o QR code')
    }
  }

  async function handleDisconnect() {
    await fetch('/api/settings/whatsapp', { method: 'DELETE' })
    setStatus(null); setQr(null)
    setForm({ instanceId: '', token: '', clientToken: '' })
  }

  const inputCls = 'w-full h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors'

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-[#87919E] py-2">
      <Loader2 size={14} className="animate-spin" /> Carregando...
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="flex items-center gap-2">
        {status?.connected ? (
          <>
            <CheckCircle size={15} className="text-[#22C55E]" />
            <span className="text-sm text-[#22C55E] font-medium">Conectado</span>
            {status.name   && <span className="text-xs text-[#87919E]">· {status.name}</span>}
            {status.number && <span className="text-xs text-[#87919E]">{status.number}</span>}
          </>
        ) : status?.configured ? (
          <>
            <XCircle size={15} className="text-[#F59E0B]" />
            <span className="text-sm text-[#F59E0B] font-medium">Configurado — aguardando QR</span>
          </>
        ) : (
          <>
            <XCircle size={15} className="text-[#87919E]" />
            <span className="text-sm text-[#87919E]">Não configurado</span>
          </>
        )}
      </div>

      {/* QR Error */}
      {qrError && !qr && (
        <div className="rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2">
          <p className="text-xs text-[#EF4444]">{qrError}</p>
        </div>
      )}

      {/* QR Code */}
      {qr && !status?.connected && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-xs text-[#87919E]">Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border border-[#38435C] bg-white p-1" />
          {polling && (
            <div className="flex items-center gap-1.5 text-xs text-[#87919E]">
              <Loader2 size={12} className="animate-spin" /> Aguardando leitura...
            </div>
          )}
          <button onClick={fetchQr} className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <RefreshCw size={12} /> Novo QR Code
          </button>
        </div>
      )}

      {/* Config form */}
      {!status?.connected && (
        <div className="space-y-3">
          <a
            href="https://z-api.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#95BBE2] hover:underline"
          >
            Criar conta na Z-API <ExternalLink size={11} />
          </a>
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">Instance ID</label>
            <input
              value={form.instanceId}
              onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))}
              placeholder="Ex: 3C5A6B7D8E..."
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">Token</label>
            <input
              value={form.token}
              onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
              placeholder="Seu token Z-API"
              type="password"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">
              Client Token
              <span className="text-[#EF4444] ml-0.5">*</span>
              <span className="text-[#87919E]/60 ml-1">(obrigatório — gerado no painel Z-API)</span>
            </label>
            <input
              value={form.clientToken}
              onChange={e => setForm(f => ({ ...f, clientToken: e.target.value }))}
              placeholder="Security → Client Token"
              type="password"
              className={inputCls}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !form.instanceId || !form.token || !form.clientToken}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#25D366] text-white hover:bg-[#22BF5B] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
            {saving ? 'Salvando...' : 'Salvar e gerar QR Code'}
          </button>
        </div>
      )}

      {/* Connected */}
      {status?.connected && (
        <div className="flex items-center gap-3">
          <button
            onClick={fetchQr}
            className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] border border-[#38435C] px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={12} /> Reconectar
          </button>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors"
          >
            <Trash2 size={12} /> Desconectar
          </button>
        </div>
      )}

      {/* Webhook config box */}
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-3 space-y-2.5">
        <p className="text-[11px] text-[#87919E] font-medium uppercase tracking-wide">Configure no painel Z-API</p>

        <div className="space-y-1">
          <p className="text-[11px] text-[#87919E]">Webhook de recebimento (On Message Received):</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] text-[#95BBE2] bg-[#0A1E2C] px-2 py-1 rounded flex-1 truncate">{webhookUrl}</code>
            <button onClick={copyWebhook} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors flex-shrink-0">
              {copied ? <CheckCircle size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-[#87919E]">
          Mensagens de números desconhecidos criam leads automaticamente no CRM.
        </p>

        {/* Test button */}
        <div className="pt-1 border-t border-[#38435C]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 text-[11px] text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />}
              Simular mensagem de teste
            </button>
            {testResult && (
              <span className={`text-[11px] ${testResult.includes('Erro') ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                {testResult}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#87919E]/60 mt-1">Cria um lead fictício no CRM para confirmar que o pipeline está funcionando.</p>
        </div>
      </div>
    </div>
  )
}
