'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, ShieldCheck, UserCheck, UserX, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateUserRole, toggleUserActive, deleteUser } from '@/app/actions/team'
import { Role } from '@prisma/client'

const roleLabels: Record<string, string> = { ADMIN: 'Admin', MANAGER: 'Gestor', ANALYST: 'Analista' }
const roleBadge: Record<string, string> = {
  ADMIN:   'bg-[#95BBE2]/15 text-[#95BBE2]',
  MANAGER: 'bg-[#A78BFA]/15 text-[#A78BFA]',
  ANALYST: 'bg-[#38435C]/50 text-[#87919E]',
}

interface Props {
  user: {
    id: string
    name: string
    email: string
    role: Role
    active: boolean
    createdAt: Date
    _count: { managedClients: number }
  }
  isSelf: boolean
  isAdmin: boolean
}

export function TeamMemberRow({ user, isSelf, isAdmin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  function changeRole(role: Role) {
    setMenuOpen(false)
    startTransition(() => updateUserRole(user.id, role))
  }

  function handleToggleActive() {
    setMenuOpen(false)
    startTransition(() => toggleUserActive(user.id))
  }

  function handleDelete() {
    setConfirmDelete(false)
    startTransition(() => deleteUser(user.id))
  }

  return (
    <>
      <tr className={cn('border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors', !user.active && 'opacity-50')}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#38435C] flex items-center justify-center text-[#95BBE2] text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-[#EBEBEB]">
                {user.name}
                {isSelf && <span className="ml-1.5 text-[10px] text-[#87919E]">(você)</span>}
              </p>
              <p className="text-xs text-[#87919E]">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', roleBadge[user.role])}>
            <ShieldCheck size={10} />
            {roleLabels[user.role]}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-[#87919E]">
          {user._count.managedClients} cliente{user._count.managedClients !== 1 ? 's' : ''}
        </td>
        <td className="px-4 py-3">
          <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs', user.active ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]')}>
            {user.active ? <UserCheck size={10} /> : <UserX size={10} />}
            {user.active ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-[#87919E]">
          {user.createdAt.toLocaleDateString('pt-BR')}
        </td>
        {isAdmin && !isSelf ? (
          <td className="px-4 py-3">
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(!menuOpen); setConfirmDelete(false) }}
                disabled={isPending}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#38435C] text-[#87919E] hover:text-[#EBEBEB] transition-colors disabled:opacity-40"
              >
                <MoreHorizontal size={14} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-48 bg-[#0A1E2C] border border-[#38435C] rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-[#87919E] uppercase tracking-wider">Alterar perfil</p>
                    {(['ADMIN', 'MANAGER', 'ANALYST'] as Role[])
                      .filter((r) => r !== user.role)
                      .map((r) => (
                        <button
                          key={r}
                          onClick={() => changeRole(r)}
                          className="w-full text-left px-3 py-2 text-sm text-[#EBEBEB] hover:bg-[#38435C]/50 transition-colors"
                        >
                          Tornar {roleLabels[r]}
                        </button>
                      ))}

                    <div className="border-t border-[#38435C] mt-1 pt-1">
                      <button
                        onClick={handleToggleActive}
                        className={cn('w-full text-left px-3 py-2 text-sm transition-colors', user.active ? 'text-[#F59E0B] hover:bg-[#F59E0B]/10' : 'text-[#22C55E] hover:bg-[#22C55E]/10')}
                      >
                        {user.active ? 'Desativar acesso' : 'Reativar acesso'}
                      </button>
                    </div>

                    <div className="border-t border-[#38435C] mt-1 pt-1">
                      <button
                        onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                        className="w-full text-left px-3 py-2 text-sm text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors flex items-center gap-2"
                      >
                        <Trash2 size={13} />
                        Excluir permanentemente
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </td>
        ) : (
          <td className="px-4 py-3" />
        )}
      </tr>

      {/* Inline delete confirmation row */}
      {confirmDelete && (
        <tr className="border-b border-[#38435C]/50 bg-[#EF4444]/5">
          <td colSpan={6} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={15} className="text-[#EF4444] flex-shrink-0" />
              <p className="text-sm text-[#EF4444] flex-1">
                Excluir <strong>{user.name}</strong>? Essa ação é irreversível e remove todos os dados do membro.
              </p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="h-7 px-3 rounded-lg text-xs text-[#87919E] hover:text-[#EBEBEB] border border-[#38435C] hover:border-[#87919E] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="h-7 px-3 rounded-lg text-xs text-white bg-[#EF4444] hover:bg-[#DC2626] transition-colors"
              >
                Confirmar exclusão
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
