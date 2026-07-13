import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Estado vazio operacional — responde a pergunta "o que eu preciso fazer agora?".
 * Título curto + porquê + (opcional) ação. Padroniza o vazio das telas no lugar
 * de um "Nenhum registro" mudo.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  /**
   * Ação customizada (ex.: botão client-side que dispara uma server action).
   * Quando presente, é renderizada ABAIXO do CTA de link (se ambos existirem).
   */
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-11 h-11 rounded-2xl bg-[#54e0ee]/10 flex items-center justify-center mb-3 text-[#54e0ee]">
          {icon}
        </div>
      )}
      <p className="text-[#EBEBEB] font-medium">{title}</p>
      {description && (
        <p className="text-[#87919E] text-sm mt-1 max-w-sm">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-3.5 py-2"
        >
          {actionLabel}
        </Link>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
