'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

export function SendDigestButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/trigger-digest', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setResult(`✓ Enviado`)
        setTimeout(() => setResult(null), 3000)
      } else {
        setResult(data.error ?? 'Erro ao enviar')
        setTimeout(() => setResult(null), 5000)
      }
    } catch {
      setResult('Erro ao enviar')
      setTimeout(() => setResult(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-50"
      title="Enviar resumo de saúde via WhatsApp agora"
    >
      <MessageCircle size={12} className={loading ? 'animate-pulse' : ''} />
      <span>{result ?? 'Enviar digest WhatsApp'}</span>
    </button>
  )
}
