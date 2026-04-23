import { requireSession } from '@/lib/dal'
import { ProfileForm }     from '@/components/settings/ProfileForm'
import { PasswordForm }    from '@/components/settings/PasswordForm'
import { WhatsAppConnect } from '@/components/settings/WhatsAppConnect'
import { AsaasStatus }     from '@/components/settings/AsaasStatus'
import { User, Lock, MessageCircle, Landmark } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requireSession()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://performli.arkza.com.br')

  const hasAsaasKey = !!process.env.ASAAS_API_KEY

  const isAdmin = session.role === 'ADMIN'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Configurações</h1>
        <p className="text-[#87919E] text-sm mt-0.5">Gerencie perfil, segurança e integrações</p>
      </div>

      {/* Profile */}
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <User size={16} className="text-[#95BBE2]" />
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Perfil</h2>
        </div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-[#38435C] flex items-center justify-center text-[#95BBE2] text-xl font-bold">
            {session.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-[#EBEBEB]">{session.name}</p>
            <p className="text-xs text-[#87919E]">{session.email}</p>
          </div>
        </div>
        <ProfileForm defaultName={session.name} />
      </div>

      {/* Password */}
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-[#95BBE2]" />
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Alterar Senha</h2>
        </div>
        <PasswordForm />
      </div>

      {/* Integrations — ADMIN only */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-[#38435C]" />
            <span className="text-xs text-[#87919E] uppercase tracking-wider">Integrações</span>
            <div className="h-px flex-1 bg-[#38435C]" />
          </div>

          {/* WhatsApp */}
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle size={16} className="text-[#25D366]" />
              <h2 className="text-sm font-semibold text-[#EBEBEB]">WhatsApp</h2>
              <span className="text-[10px] text-[#87919E] border border-[#38435C] px-1.5 py-0.5 rounded-full ml-auto">
                Evolution API
              </span>
            </div>
            <p className="text-xs text-[#87919E] mb-5">
              Mensagens recebidas de números desconhecidos viram leads no CRM automaticamente.
            </p>
            <WhatsAppConnect />
          </div>

          {/* Asaas */}
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Landmark size={16} className="text-[#95BBE2]" />
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Asaas</h2>
              <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ml-auto ${
                hasAsaasKey
                  ? 'text-[#22C55E] border-[#22C55E]/30'
                  : 'text-[#EF4444] border-[#EF4444]/30'
              }`}>
                {hasAsaasKey ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <p className="text-xs text-[#87919E] mb-5">
              Sincronização financeira automática via API do Asaas.
            </p>
            <AsaasStatus appUrl={appUrl} hasKey={hasAsaasKey} />
          </div>
        </>
      )}
    </div>
  )
}
