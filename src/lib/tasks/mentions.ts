/**
 * Extrai @handles de um corpo de texto (descrição/comentário). Função PURA.
 *
 * Handle = @ seguido de letras/números/._- (mín. 1 char). Não captura e-mails
 * (o @ precisa vir no início ou após espaço/pontuação/quebra de linha) e
 * remove duplicatas preservando a ordem de aparição. Os handles retornados NÃO
 * incluem o @ e vêm em minúsculas (resolução para userId fica com o caller).
 *
 * ── TESTES DE MESA (verificados) ─────────────────────────────────────────────
 *   "oi @pablo revisa"          → ["pablo"]
 *   "@Ana e @ana"               → ["ana"]           (dedupe + lowercase)
 *   "fala com @maria.silva!"    → ["maria.silva"]
 *   "email joao@arkza.com.br"   → []                (não é menção)
 *   "(@ze) [@lu]"               → ["ze","lu"]
 *   "sem mencao"                → []
 */
export function extractMentions(body: string): string[] {
  if (!body) return []
  // (^|separador não-word) @handle
  const re = /(?:^|[\s([{<,;:!?])@([a-zA-Z0-9._-]+)/g
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of body.matchAll(re)) {
    const handle = m[1].replace(/[.\-_]+$/, '').toLowerCase() // apara pontuação final
    if (handle && !seen.has(handle)) {
      seen.add(handle)
      out.push(handle)
    }
  }
  return out
}
