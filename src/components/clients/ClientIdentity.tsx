import Link from 'next/link'

interface Props {
  /** Nome fantasia — sempre em destaque na primeira linha. */
  name: string
  /** Razão social — subtexto discreto na segunda linha. Opcional. */
  razaoSocial?: string | null
  /** Quando presente, o nome fantasia vira link para o cliente. */
  href?: string
  /** Densidade do texto. 'sm' para listas densas, 'md' para cabeçalhos. */
  size?: 'sm' | 'md'
}

/**
 * Identidade padronizada do cliente em toda superfície que o exibe:
 * nome fantasia em destaque + razão social como subtexto discreto.
 *
 * Server-safe (sem hooks/'use client'): pode ser usado tanto em Server
 * quanto em Client Components. Sem razão social, renderiza apenas a
 * fantasia — zero mudança visual em quem não tem o campo preenchido.
 */
export function ClientIdentity({ name, razaoSocial, href, size = 'sm' }: Props) {
  const nameClass =
    size === 'md'
      ? 'font-semibold text-[#EBEBEB]'
      : 'font-medium text-[#EBEBEB]'

  const nameNode = href ? (
    <Link href={href} className={`${nameClass} hover:text-[#95BBE2] transition-colors`}>
      {name}
    </Link>
  ) : (
    <span className={nameClass}>{name}</span>
  )

  // Só mostra a razão social quando existe e é DIFERENTE do nome fantasia
  // (comparação case-insensitive, ignorando espaços nas pontas).
  const legal = razaoSocial?.trim()
  const showLegal =
    !!legal && legal.toLowerCase() !== name.trim().toLowerCase()

  return (
    <span className="block min-w-0">
      <span className="block truncate">{nameNode}</span>
      {showLegal && (
        <span
          className="block truncate text-[11px] text-[#647488]"
          title={legal}
        >
          {legal}
        </span>
      )}
    </span>
  )
}
