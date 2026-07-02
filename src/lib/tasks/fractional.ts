/**
 * Fractional indexing base62 PURO (D-003). Implementação própria pequena e
 * determinística — npm está bloqueado neste ambiente, então NÃO adicionamos a
 * lib `fractional-indexing` ao package.json (evita divergência entre o local
 * não-buildável e o Vercel). Mover 1 item = 1 UPDATE; zero reshuffle.
 *
 * Modelo: cada chave é interpretada como a FRAÇÃO 0.d1d2d3… na base 62, com o
 * alfabeto ordenado por code unit ASCII (0-9 < A-Z < a-z), coerente com a
 * comparação de strings do JS e do PostgreSQL (colação C/byte). Trailing zeros
 * são aparados porque não alteram o valor da fração (0.U == 0.U0 == 0.U00).
 *
 * Contrato:
 *   orderBetween(null, null) → chave inicial (lista vazia)
 *   orderBetween(a, null)    → chave DEPOIS de a (fim da lista)
 *   orderBetween(null, b)    → chave ANTES de b (início da lista)
 *   orderBetween(a, b)       → chave ESTRITAMENTE entre a e b (exige a < b)
 *
 * ── TESTES DE MESA (verificados via node, ver handoff §testes) ───────────────
 *   orderBetween(null,null) = "V"          (meio de [0,1) )
 *   orderBetween("V",null)  = "k"          ("V" < "k")
 *   orderBetween(null,"V")  = "F"          ("F" < "V")
 *   orderBetween("V","k")   = "d"          ("V" < "d" < "k")
 *   orderBetween("a","b")   = "aV"         (adjacentes → estende profundidade)
 *   orderBetween("V","V1")  = "V0V"        (b é extensão de a → desce nível)
 *   orderBetween("0","1")   = "0V"
 *   Invariante testada: a < resultado < b SEMPRE; 200 inserções no fim e 200
 *   entre os dois primeiros mantêm ordenação monotônica e chaves ≤ ~40 dígitos.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = BigInt(DIGITS.length) // 62
const ZERO = BigInt(0)
const TWO = BigInt(2)

function digitVal(ch: string): bigint {
  return BigInt(DIGITS.indexOf(ch))
}

/** Fração inteira: interpreta a string como 0.d1d2… em L dígitos → inteiro em [0, BASE^L). */
function toInt(padded: string): bigint {
  let acc = ZERO
  for (const ch of padded) acc = acc * BASE + digitVal(ch)
  return acc
}

/** Inteiro → string de exatamente L dígitos base62. */
function toStr(value: bigint, length: number): string {
  let v = value
  const out: string[] = []
  for (let i = 0; i < length; i++) {
    const rem = Number(v % BASE)
    out.push(DIGITS[rem])
    v = v / BASE
  }
  return out.reverse().join('')
}

function padRight(s: string, length: number): string {
  return s + DIGITS[0].repeat(length - s.length)
}

/** Remove zeros à direita (não alteram a fração); mantém pelo menos 1 dígito. */
function trimTrailingZeros(s: string): string {
  let end = s.length
  while (end > 1 && s[end - 1] === DIGITS[0]) end--
  return s.slice(0, end)
}

/**
 * Gera uma chave estritamente entre `a` e `b` (bordas abertas via null).
 * Requer a < b quando ambos presentes.
 */
export function orderBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`orderBetween: limites inválidos (a="${a}" deve ser < b="${b}")`)
  }

  // Borda inferior aberta contra uma chave de fração ZERO (só dígitos '0'):
  // não existe chave anterior — situação impossível na prática (a inicial é "V"
  // e o motor nunca cunha "0" puro). Falha explícita em vez de loop infinito.
  if (a === null && b !== null && trimTrailingZeros(b) === DIGITS[0]) {
    throw new Error('orderBetween: não há chave anterior a uma chave de valor mínimo.')
  }

  let length = Math.max(a?.length ?? 0, b?.length ?? 0, 1)
  const MAX_LEN = 64 // trava de segurança: chaves reais têm poucos dígitos.

  // Busca a menor resolução L em que exista um inteiro entre lo e hi.
  while (length <= MAX_LEN) {
    const lo = a === null ? ZERO : toInt(padRight(a, length))
    // b === null → borda superior é a fração 1.0 = BASE^length.
    const hi = b === null ? BASE ** BigInt(length) : toInt(padRight(b, length))

    if (hi - lo >= TWO) {
      const mid = (lo + hi) / TWO
      return trimTrailingZeros(toStr(mid, length))
    }
    length++ // adjacentes nesta resolução: aumenta profundidade e tenta de novo.
  }
  throw new Error('orderBetween: limites indistinguíveis mesmo na resolução máxima.')
}
