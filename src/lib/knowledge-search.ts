import { prisma } from '@/lib/prisma'

// Common Portuguese stopwords to ignore when searching
const STOPWORDS = new Set([
  'para', 'como', 'mais', 'mas', 'por', 'não', 'são', 'está', 'você',
  'seu', 'sua', 'dos', 'das', 'nos', 'nas', 'pelo', 'pela', 'isso',
  'esse', 'essa', 'este', 'esta', 'tem', 'ter', 'ser', 'foi', 'era',
  'ele', 'ela', 'eles', 'elas', 'pode', 'quando', 'onde', 'quem',
  'qual', 'aqui', 'ali', 'ainda', 'então', 'porque', 'também', 'muito',
  'bem', 'todos', 'todas', 'cada', 'entre', 'sobre', 'após', 'antes',
  'durante', 'através', 'além', 'junto', 'dentro', 'fora', 'mesmo',
  'tanto', 'tudo', 'nada', 'algo', 'alguém', 'ninguém', 'outras', 'outro',
])

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents for better matching
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 10)
}

export async function searchKnowledge(
  query: string,
  agentType: string,
  limit = 4,
): Promise<{ content: string; documentTitle: string }[]> {
  const keywords = extractKeywords(query)
  if (keywords.length === 0) return []

  // Fetch chunks matching any keyword, with agent tag filter
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      OR: keywords.map(kw => ({
        content: { contains: kw, mode: 'insensitive' as const },
      })),
      document: {
        OR: [
          { tags: { has: agentType } },
          { tags: { has: 'ALL' } },
        ],
      },
    },
    include: { document: { select: { title: true } } },
    take: 40,
  })

  if (chunks.length === 0) return []

  // Score each chunk by number of keyword matches
  const scored = chunks.map(chunk => {
    const lower = chunk.content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const score = keywords.filter(kw => lower.includes(kw)).length
    return { content: chunk.content, documentTitle: chunk.document.title, score }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ content, documentTitle }) => ({ content, documentTitle }))
}

export function formatKnowledgeContext(chunks: { content: string; documentTitle: string }[]): string {
  if (chunks.length === 0) return ''

  const lines = ['=== MATERIAL DE APOIO — BASE DE CONHECIMENTO ===']
  for (const chunk of chunks) {
    lines.push(`\n[${chunk.documentTitle}]`)
    lines.push(chunk.content)
  }
  lines.push('\n(Use o material acima como referência metodológica para embasar sua resposta quando relevante.)')
  return lines.join('\n')
}
