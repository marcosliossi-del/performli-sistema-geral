'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { subscribeToasts, dismissToast, type ToastItem } from '@/lib/toast'

const TONE = {
  ok: { icon: CheckCircle2, cls: 'text-[#34c97a]' },
  err: { icon: AlertTriangle, cls: 'text-[#ff5e6a]' },
  info: { icon: Info, cls: 'text-[#54e0ee]' },
} as const

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none"
    >
      {items.map((t) => {
        const { icon: Icon, cls } = TONE[t.tone]
        return (
          <div
            key={t.id}
            className="lg-glass-strong pointer-events-auto flex items-center gap-2.5 border border-white/[0.09] rounded-xl px-4 py-2.5 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.62)] animate-[ak-fade-in_.2s_ease]"
          >
            <span className="sr-only">{t.tone === 'err' ? 'Erro: ' : t.tone === 'ok' ? 'Sucesso: ' : 'Aviso: '}</span>
            <Icon size={15} className={cls} />
            <span className="text-[12.5px] text-[#f2f6fa]">{t.msg}</span>
            <button onClick={() => dismissToast(t.id)} aria-label="Dispensar notificação" className="text-[#647488] hover:text-[#f2f6fa] ml-1"><X size={13} /></button>
          </div>
        )
      })}
    </div>
  )
}
