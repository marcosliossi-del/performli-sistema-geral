'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react'

interface Info {
  hasKey: boolean
  masked: string
  baseUrl: string
}

/**
 * Configuração da integração GA4Sync (KPIs de e-commerce Nuvemshop). Espelha o
 * AsaasStatus: cola a chave, salva em IntegrationSetting e testa a conexão. A
 * chave nunca é exibida em claro (só mascarada) nem trafega em log.
 */
export function Ga4SyncStatus() {
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; storeCount?: number; error?: string } | null>(null)
  const [form, setForm] = useState({ apiKey: '', baseUrl: '' })

  const fetchInfo = useCallback(async () => {
    const res = await fetch('/api/settings/ga4sync')
    if (res.ok) {
      const data = await res.json()
      setInfo(data)
      setForm((f) => ({ ...f, baseUrl: data.baseUrl ?? '' }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  async function handleSave() {
    if (!form.apiKey.trim()) return
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch('/api/settings/ga4sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: form.apiKey.trim(), baseUrl: form.baseUrl.trim() }),
      })
      const data = await res.json()
      setResult(data)
      if (data.ok) {
        setForm((f) => ({ ...f, apiKey: '' }))
        await fetchInfo()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    await fetch('/api/settings/ga4sync', { method: 'DELETE' })
    setInfo(null)
    setResult(null)
    setLoading(true)
    await fetchInfo()
  }

  const inputCls =
    'w-full h-9 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors'

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-[#87919E] py-2">
        <Loader2 size={14} className="animate-spin" /> Carregando...
      </div>
    )

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2 flex-wrap">
        {info?.hasKey ? (
          <>
            <CheckCircle size={15} className="text-[#22C55E]" />
            <span className="text-sm text-[#22C55E] font-medium">Conectado</span>
            {info.masked && <span className="text-xs text-[#87919E] font-mono">{info.masked}</span>}
          </>
        ) : (
          <>
            <XCircle size={15} className="text-[#87919E]" />
            <span className="text-sm text-[#87919E]">Não configurado</span>
          </>
        )}
        {result?.ok && result.storeCount !== undefined && (
          <span className="text-xs text-[#22C55E]">
            · {result.storeCount} {result.storeCount === 1 ? 'loja visível' : 'lojas visíveis'}
          </span>
        )}
        {result?.ok === false && <span className="text-xs text-[#EF4444]">· {result.error}</span>}
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-[#87919E]">
            {info?.hasKey ? 'Nova API Key (deixe em branco para manter a atual)' : 'API Key do GA4Sync'}
          </label>
          <input
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder={info?.hasKey ? '••••••••••••••••' : 'cole a chave emitida no GA4Sync'}
            type="password"
            autoComplete="off"
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-[#87919E]">URL base (opcional)</label>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://project-g09fp.vercel.app/api/v1"
            type="url"
            className={inputCls}
          />
          <p className="text-[11px] text-[#647488]">
            Deixe em branco para usar a URL padrão da API.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || (!form.apiKey.trim() && info?.hasKey)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#95BBE2] text-[#0A1E2C] hover:bg-[#95BBE2]/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {saving ? 'Salvando...' : info?.hasKey ? 'Atualizar e testar' : 'Salvar e testar'}
          </button>

          {info?.hasKey && (
            <button
              onClick={handleRemove}
              className="flex items-center gap-1.5 text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors px-3 py-2"
            >
              <Trash2 size={12} /> Remover
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[#87919E] leading-relaxed">
        A chave é somente leitura e alimenta as análises de e-commerce (canais, produtos,
        categorias, regiões e retenção) no portal do cliente. A associação loja↔cliente é
        automática pela loja Nuvemshop já conectada.
      </p>
    </div>
  )
}
