import { PageSkeleton } from '@/components/ui/Skeleton'

/**
 * Fallback de carregamento compartilhado de TODO o grupo (dashboard).
 * O App Router usa este loading.tsx como Suspense boundary para qualquer rota
 * aninhada que não tenha o seu próprio — mantém a sidebar/topbar fixas e mostra
 * um esqueleto na área de conteúdo durante o fetch server-side (inclui o
 * cold-start do Neon). Rotas com loading.tsx próprio continuam prevalecendo.
 */
export default function Loading() {
  return <PageSkeleton />
}
