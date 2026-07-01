import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { homeForUser } from '@/lib/home'

// Raiz do app: decide o pouso por perfil. requireSession redireciona p/ /login
// quando não há sessão. redirect() lança internamente — não envolver em try/catch.
export default async function IndexPage() {
  const session = await requireSession()

  // Sessões antigas não têm operationalRole no token — busca no banco.
  let operationalRole = session.operationalRole ?? null
  if (session.operationalRole === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { operationalRole: true },
    })
    operationalRole = user?.operationalRole ?? null
  }

  redirect(homeForUser(session.role, operationalRole))
}
