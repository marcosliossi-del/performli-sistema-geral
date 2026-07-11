import { PortalHeader } from '@/components/portal/PortalHeader'

export const dynamic = 'force-dynamic'

/**
 * Layout PRÓPRIO do portal do cliente (lojista). NÃO herda a sidebar interna
 * da agência. Não chamamos getAuthorizedClient aqui porque a página de login
 * também usa este layout — a autenticação é resolvida em cada página protegida.
 * O nome da loja no header vem de um Server Component que se autoprotege.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#05141C] text-[#EBEBEB] antialiased">
      {/* Brilho premium sutil no topo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(149,187,226,0.10),transparent_70%)]"
      />
      <PortalHeader />
      <main className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {children}
      </main>
    </div>
  )
}
