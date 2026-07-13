import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

/**
 * Trilha de navegação simples (Clientes › Nome do cliente).
 * - Último item nunca é link (posição atual).
 * - Separador › entre itens.
 * - Trunca rótulos longos (mobile ok).
 * Componente puro (sem estado) — pode ser usado em Server Components.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Trilha de navegação" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-[#87919E]">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <ChevronRight size={14} className="shrink-0 text-[#576070]" aria-hidden />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate max-w-[10rem] sm:max-w-[16rem] hover:text-[#EBEBEB] transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`truncate max-w-[10rem] sm:max-w-[20rem] ${isLast ? 'text-[#EBEBEB] font-medium' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
