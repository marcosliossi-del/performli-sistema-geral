'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createPortalAccess,
  resetPortalPassword,
  setPortalAccessActive,
} from '@/app/actions/portalAccess'
import { toast } from '@/lib/toast'
import {
  UserPlus,
  KeyRound,
  Copy,
  Check,
  Store,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'

type PortalUser = {
  id: string
  email: string
  name: string
  active: boolean
  lastLoginAt: string | null
}

type ClientRow = {
  id: string
  name: string
  users: PortalUser[]
}

export function PortalAcessosManager({ clients }: { clients: ClientRow[] }) {
  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-6 text-sm text-[#87919E]">
        Nenhum cliente ativo para liberar acesso no momento.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {clients.map((c) => (
        <ClientBlock key={c.id} client={c} />
      ))}
    </div>
  )
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Nunca acessou'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ClientBlock({ client }: { client: ClientRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // Senha temporária exibida UMA vez após criar/resetar (por usuário/novo acesso).
  const [tempPassword, setTempPassword] = useState<{ label: string; value: string } | null>(null)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    startTransition(async () => {
      const res = await createPortalAccess(client.id, email.trim(), name.trim())
      if (res.error) {
        toast(res.error, 'err')
        return
      }
      toast('Acesso criado. Copie a senha temporária.', 'ok')
      if (res.tempPassword) {
        setTempPassword({ label: email.trim(), value: res.tempPassword })
      }
      setName('')
      setEmail('')
      setShowForm(false)
      router.refresh()
    })
  }

  function handleReset(user: PortalUser) {
    startTransition(async () => {
      const res = await resetPortalPassword(user.id)
      if (res.error) {
        toast(res.error, 'err')
        return
      }
      toast('Senha redefinida. Envie a nova senha ao cliente.', 'ok')
      if (res.tempPassword) {
        setTempPassword({ label: user.email, value: res.tempPassword })
      }
      router.refresh()
    })
  }

  function handleToggle(user: PortalUser) {
    startTransition(async () => {
      const res = await setPortalAccessActive(user.id, !user.active)
      if (res.error) {
        toast(res.error, 'err')
        return
      }
      toast(user.active ? 'Acesso revogado.' : 'Acesso reativado.', 'ok')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store size={16} className="text-[#95BBE2]" />
          <h2 className="text-sm font-semibold text-[#EBEBEB]">{client.name}</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#38435C] px-2.5 py-1.5 text-xs font-medium text-[#EBEBEB] transition-colors hover:bg-[#38435C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
        >
          <UserPlus size={13} />
          Criar acesso
        </button>
      </div>

      {tempPassword && (
        <TempPasswordBlock
          label={tempPassword.label}
          value={tempPassword.value}
          onDismiss={() => setTempPassword(null)}
        />
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 grid gap-2.5 rounded-xl border border-[#38435C] bg-[#05141C] p-3.5 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-1">
            <label htmlFor={`name-${client.id}`} className="text-[11px] font-medium text-[#87919E]">
              Nome do responsável
            </label>
            <input
              id={`name-${client.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ex.: Ana Souza"
              className="h-9 w-full rounded-lg border border-[#38435C] bg-[#0A1E2C] px-2.5 text-sm text-[#EBEBEB] placeholder-[#647488] focus:border-[#95BBE2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`email-${client.id}`} className="text-[11px] font-medium text-[#87919E]">
              E-mail
            </label>
            <input
              id={`email-${client.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ana@loja.com.br"
              className="h-9 w-full rounded-lg border border-[#38435C] bg-[#0A1E2C] px-2.5 text-sm text-[#EBEBEB] placeholder-[#647488] focus:border-[#95BBE2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="h-9 w-full rounded-lg bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] px-4 text-sm font-semibold text-[#021015] transition-all hover:brightness-[1.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 disabled:opacity-50 sm:w-auto"
            >
              {pending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      )}

      {client.users.length === 0 ? (
        <p className="text-xs text-[#647488]">Nenhum acesso liberado ainda.</p>
      ) : (
        <ul className="divide-y divide-[#38435C]/60">
          {client.users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-[#EBEBEB]">{u.name}</p>
                  {u.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#22C55E]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]">
                      <ShieldCheck size={10} /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EF4444]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#EF4444]">
                      <ShieldOff size={10} /> Revogado
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[#87919E]">{u.email}</p>
                <p className="text-[11px] text-[#647488]">Último acesso: {formatLastLogin(u.lastLoginAt)}</p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => handleReset(u)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#38435C] px-2.5 py-1.5 text-xs font-medium text-[#EBEBEB] transition-colors hover:bg-[#38435C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 disabled:opacity-50"
                >
                  <KeyRound size={13} />
                  Redefinir senha
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(u)}
                  disabled={pending}
                  className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 disabled:opacity-50 ${
                    u.active
                      ? 'border border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/10'
                      : 'border border-[#38435C] text-[#EBEBEB] hover:bg-[#38435C]'
                  }`}
                >
                  {u.active ? 'Revogar' : 'Reativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TempPasswordBlock({
  label,
  value,
  onDismiss,
}: {
  label: string
  value: string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast('Senha copiada.', 'ok')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Não foi possível copiar. Selecione e copie manualmente.', 'err')
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[#95BBE2]/40 bg-[#95BBE2]/10 p-3.5">
      <p className="text-xs font-semibold text-[#95BBE2]">
        Senha temporária de {label}
      </p>
      <p className="mt-0.5 text-[11px] text-[#87919E]">
        Anote agora — ela aparece só uma vez. Envie ao cliente por um canal seguro.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg border border-[#38435C] bg-[#05141C] px-3 py-2 font-mono text-sm tracking-wide text-[#EBEBEB]">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar senha temporária"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#38435C] px-2.5 text-xs font-medium text-[#EBEBEB] transition-colors hover:bg-[#38435C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
        >
          {copied ? <Check size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-[11px] text-[#647488] underline-offset-2 hover:text-[#87919E] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
      >
        Já anotei, ocultar
      </button>
    </div>
  )
}
