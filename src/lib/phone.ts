/**
 * Normalização e matching de telefones (dedup de leads/clientes).
 *
 * Problema que isto resolve: `phone: { contains: <últimos 9 dígitos> }` mistura
 * pessoas diferentes cujos números coincidem no final e casa substrings
 * arbitrárias. Aqui normalizamos para dígitos e comparamos por IGUALDADE.
 *
 * Formato canônico de escrita no projeto: `+<digitos>` (só dígitos, com DDI/DDD).
 * Como dados históricos podem ter sido salvos em formatos ligeiramente
 * diferentes (com/sem DDI 55, com/sem `+`), geramos um pequeno conjunto de
 * variantes EXATAS para a cláusula `IN`, em vez de um `contains` frouxo.
 */

/** Só dígitos. */
export function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Variantes EXATAS para dedup por telefone (usar com `phone: { in: variants }`).
 *
 * A partir dos dígitos informados, considera:
 *  - o número como veio (com e sem `+`);
 *  - com DDI 55 (Brasil) prefixado, se ainda não tiver (com e sem `+`);
 *  - sem o DDI 55, se tiver (com e sem `+`).
 *
 * Trade-off documentado: não temos coluna normalizada; então casamos por um
 * conjunto FINITO e ESPECÍFICO de representações canônicas (DDI+DDD+número),
 * nunca por sufixo curto de 9 dígitos. Isso evita falsos positivos entre
 * pessoas distintas mantendo compatibilidade com o histórico.
 */
export function phoneMatchVariants(phone: string | null | undefined): string[] {
  const d = digitsOnly(phone)
  if (d.length < 10) return d ? [d, `+${d}`] : []

  const set = new Set<string>()
  const add = (v: string) => {
    if (v.length >= 10) {
      set.add(v)
      set.add(`+${v}`)
    }
  }

  add(d)
  if (d.startsWith('55')) {
    add(d.slice(2)) // sem DDI
  } else {
    add(`55${d}`) // com DDI Brasil
  }

  return [...set]
}
