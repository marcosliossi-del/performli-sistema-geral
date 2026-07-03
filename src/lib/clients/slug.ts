import { prisma } from '@/lib/prisma'

/**
 * Garante um slug único adicionando sufixo numérico (slug-2, slug-3...) quando
 * o slug base já está em uso. `excludeId` ignora o próprio cliente (edição).
 * Usado por createClient/updateClient para desambiguar nomes distintos que
 * geram o mesmo slug — sem bloquear o cadastro de um nome legítimo.
 */
export async function uniqueClientSlug(base: string, excludeId?: string): Promise<string> {
  let suffix = 1
  while (true) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    const conflict = await prisma.client.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
    if (!conflict) return candidate
    suffix++
  }
}
