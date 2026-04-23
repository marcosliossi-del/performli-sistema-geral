'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, CheckCircle, XCircle, RefreshCw, Trash2, Loader2 } from 'lucide-react'

interface Status {
  configured: boolean
  connected:  boolean
  number?:    string
  name?:      string
  url?:       string
  instance?:  string
}

export function WhatsAppConnect() {
  const [status,   setStatus]   = useState<Status | null>(null)
  const [qr,       setQr]       = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [polling,  setPolling]  = useState(false)
  const [form, setForm] = useState({ url: '', apiKey: '', instance: 'performli' })

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/settings/whatsapp')
    if (res.ok) {
      const data = await res.json()
      setStatus(data)
      if (data.configured && data.url) setForm(f => ({ ...f, url: data.url, instance: data.instance }))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Poll for connection while QR is shown
  useEffect(() => {
    if (!qr || status?.connected) return
    setPolling(true)
    const interval = setInterval(async () => {
      const res = await fetch('/api/settings/whatsapp')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.connected) {
          setQr(null)
          setPolling(false)
          clearInterval(interval)
        }
      }
    }, 4000)
    return () => { clearInterval(interval); setPolling(false) }
  }, [qr, status?.connected])

  async function handleSave() {
    if (!form.url || !form.apiKey || !form.instance) return
    setSaving(true)
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
    const res = await fetch('/api/settings/whatsapp', { method: 'PATCH' })
    if (res.ok) {
      const data = await res.json()
      if (data.qr) setQr(data.qr)
    }
  }

  async function handleDisconnect() {
    await fetch('/api/settings/whatsapp', { method: 'DELETE' })
    setStatus(null)
    setQr(null)
    setForm({ url: '', apiKey: '', instance: 'performli' })
  }

  const inputCls = 'w-full h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors'

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-[#87919E] py-4">
      <Loader2 size={14} className="animate-spin" /> Carregando...
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        {status?.connected ? (
          <>
            <CheckCircle size={15} className="text-[#22C55E]" />
            <span className="text-sm text-[#22C55E] font-medium">Conectado</span>
            {status.name && <span className="text-xs text-[#87919E]">· {status.name}</span>}
            {status.number && <span className="text-xs text-[#87919E]">{status.number}</span>}
          </>
        ) : status?.configured ? (
          <>
            <XCircle size={15} className="text-[#F59E0B]" />
            <span className="text-sm text-[#F59E0B] font-medium">Configurado, aguardando conexão</span>
          </>
        ) : (
          <>
            <XCircle size={15} className="text-[#87919E]" />
            <span className="text-sm text-[#87919E]">Não configurado</span>
          </>
        )}
      </div>

      {/* QR Code */}
      {qr && !status?.connected && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-xs text-[#87919E]">Escaneie com o WhatsApp do celular</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border border-[#38435C]" />
          {polling && (
            <div className="flex items-center gap-1.5 text-xs text-[#87919E]">
              <Loader2 size={12} className="animate-spin" />
              Aguardando leitura...
            </div>
          )}
          <button onClick={fetchQr} className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <RefreshCw size={12} /> Gerar novo QR
          </button>
        </div>
      )}

      {/* Config form */}
      {!status?.connected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">URL da Evolution API</label>
            <input
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://evolution.seudominio.com.br"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">API Key</label>
            <input
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder="sua-api-key"
              type="password"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#87919E]">Nome da instância</label>
            <input
              value={form.instance}
              onChange={e => setForm(f => ({ ...f, instance: e.target.value }))}
              placeholder="performli"
              className={inputCls}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !form.url || !form.apiKey}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#25D366] text-white hover:bg-[#22BF5B] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
            {saving ? 'Conectando...' : 'Salvar e conectar'}
          </button>
        </div>
      )}

      {/* Connected actions */}
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

      {/* Info */}
      <p className="text-[11px] text-[#87919E] leading-relaxed">
        Mensagens recebidas de novos números criam leads automaticamente no CRM.
        URL do webhook: <code className="text-[#95BBE2]">/api/webhooks/whatsapp</code>
      </p>
    </div>
  )
}
