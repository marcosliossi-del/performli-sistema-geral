import Link from 'next/link'
import { Compass, ArrowLeft } from 'lucide-react'

/**
 * 404 global — quando o endereço não existe (link antigo, URL digitada errada).
 * Mesma linguagem operacional do error boundary do dashboard: explica o que
 * aconteceu e oferece o caminho de volta.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#05141C] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#95BBE2]/12 flex items-center justify-center mb-4">
        <Compass size={22} className="text-[#95BBE2]" />
      </div>
      <h1 className="text-lg font-semibold text-[#EBEBEB]">Esta página não existe</h1>
      <p className="text-sm text-[#87919E] mt-1 max-w-md">
        O endereço que você abriu não está no sistema — pode ser um link antigo
        ou uma rota que mudou. O resto do Performli continua funcionando.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#021015] bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] rounded-lg px-4 py-2"
      >
        <ArrowLeft size={13} /> Voltar ao início
      </Link>
    </div>
  )
}
