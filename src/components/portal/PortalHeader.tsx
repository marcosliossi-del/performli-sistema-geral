import { getPortalSession } from '@/lib/portal/session'
import { prisma } from '@/lib/prisma'
import { portalLogout } from '@/app/actions/portalAuth'
import { LogOut } from 'lucide-react'

/**
 * Header do portal. Server Component que se autoprotege via getPortalSession
 * (retorna null sem redirect — a página de login usa o mesmo layout).
 * Mostra "Arkza" sempre e o nome da loja + botão sair quando o lojista está logado.
 */
export async function PortalHeader() {
  const session = await getPortalSession()

  let storeName: string | null = null
  if (session) {
    // Defesa em profundidade: filtramos clientId explicitamente mesmo com sessão.
    const client = await prisma.client.findUnique({
      where: { id: session.clientId },
      select: { name: true },
    })
    storeName = client?.name ?? null
  }

  return (
    <header className="relative z-10 border-b border-[#38435C] bg-[#0A1E2C]/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <span className="text-base font-bold tracking-tight text-[#EBEBEB]">
          Ark<span className="text-[#95BBE2]">za</span>
        </span>
        {storeName && (
          <>
            <span aria-hidden className="h-4 w-px bg-[#38435C]" />
            <span className="truncate text-sm font-medium text-[#87919E]">{storeName}</span>
          </>
        )}
        {session && (
          <form action={portalLogout} className="ml-auto">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#87919E] transition-colors hover:bg-white/[0.05] hover:text-[#EBEBEB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        )}
      </div>
    </header>
  )
}
