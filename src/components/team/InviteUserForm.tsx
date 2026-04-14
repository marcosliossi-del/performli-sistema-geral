'use client'

import { useRef, useState, useTransition } from 'react'
import { UserPlus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteUser } from '@/app/actions/team'

export function InviteUserForm() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await inviteUser(data)
        formRef.current?.reset()
        setSuccess(true)
        setTimeout(() => { setOpen(false); setSuccess(false) }, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao convidar')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={16} />
        Convidar Usuário
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Convidar Usuário</h2>
              <button onClick={() => setOpen(false)} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
                <X size={16} />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">Nome completo *</label>
                <Input name="name" placeholder="Ex: Ana Lima" required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">E-mail *</label>
                <Input name="email" type="email" placeholder="ana@agencia.com.br" required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">Senha inicial *</label>
                <Input name="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Perfil</label>
                <select
                  name="role"
                  defaultValue="MANAGER"
                  className="w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Gestor</option>
                  <option value="CS">Sucesso do Cliente</option>
                  <option value="ANALYST">Analista</option>
                </select>
              </div>

              {error && <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-xs text-[#22C55E] bg-[#22C55E]/10 rounded-lg px-3 py-2">Usuário criado com sucesso!</p>}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {isPending ? 'Criando...' : 'Convidar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
