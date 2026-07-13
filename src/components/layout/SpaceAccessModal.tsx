'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Search, Lock, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { roleLabel } from '@/lib/rbac'
import { NAV_SPACE_BY_KEY } from '@/lib/nav-spaces'
import { toast } from '@/lib/toast'
import {
  getSpaceAccessAdmin,
  setSpaceAccessMode,
  setSpaceAccessUsers,
  type SpaceAccessAdminUser,
} from '@/app/actions/space-access'

/**
 * Modal "Gerenciar acesso" de UM espaço da navegação (padrão ClickUp: kebab no
 * item da sidebar → aqui). SÓ é montado para ADMIN real (o kebab que o abre só
 * aparece fora da prévia "ver como gestor"). A segurança real está no backend —
 * todas as actions revalidam papel ADMIN estrito; este componente só melhora a
 * UX de configuração.
 *
 * Fluxo:
 *   • Ao abrir, carrega getSpaceAccessAdmin() (modo + allowlist + staff ativo).
 *   • Toggle "Acesso personalizado" persiste o modo na hora (setSpaceAccessMode).
 *   • Com o modo ligado, a lista de staff vira editável; "Salvar" grava a
 *     allowlist (setSpaceAccessUsers). Sem lista personalizada, o acesso volta a
 *     seguir o papel de cada usuário (matriz RBAC).
 */
export function SpaceAccessModal({
  spaceKey,
  onClose,
  onSaved,
}: {
  spaceKey: string
  onClose: () => void
  /** Chamado após salvar/alternar com sucesso (o caller faz router.refresh()). */
  onSaved: () => void
}) {
  const space = NAV_SPACE_BY_KEY[spaceKey]
  const label = space?.label ?? spaceKey

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [staff, setStaff] = useState<SpaceAccessAdminUser[]>([])
  const [custom, setCustom] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingMode, setTogglingMode] = useState(false)

  // Carrega dados on-open. spaceKey é estável enquanto o modal está aberto.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    getSpaceAccessAdmin().then((res) => {
      if (!alive) return
      if (!res.ok) {
        setLoadError(res.error)
        setLoading(false)
        return
      }
      const sp = res.data.spaces.find((s) => s.key === spaceKey)
      setStaff(res.data.staff)
      setCustom(sp?.custom ?? false)
      setSelected(new Set(sp?.userIds ?? []))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [spaceKey])

  // Fecha com ESC.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return staff
    return staff.filter(
      (u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term),
    )
  }, [staff, search])

  async function handleToggleMode(next: boolean) {
    if (togglingMode) return
    setTogglingMode(true)
    const res = await setSpaceAccessMode(spaceKey, next)
    setTogglingMode(false)
    if (!res.ok) {
      toast(res.error, 'err')
      return
    }
    setCustom(next)
    if (!next) {
      // Desligou: a allowlist foi apagada no backend; o acesso volta ao papel.
      setSelected(new Set())
      toast('Acesso personalizado desligado. Voltou a valer o acesso por papel.', 'ok')
      onSaved()
    } else {
      toast('Acesso personalizado ligado. Selecione quem pode ver este espaço.', 'ok')
      onSaved()
    }
  }

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const res = await setSpaceAccessUsers(spaceKey, Array.from(selected))
    setSaving(false)
    if (!res.ok) {
      toast(res.error, 'err')
      return
    }
    const n = res.data?.count ?? selected.size
    toast(
      n === 0
        ? 'Lista salva. Por enquanto só administradores veem este espaço.'
        : `Lista salva. ${n} ${n === 1 ? 'pessoa vê' : 'pessoas veem'} este espaço.`,
      'ok',
    )
    onSaved()
    onClose()
  }

  const showSearch = staff.length > 8

  return (
    <>
      <div
        className="ak-scrim lg-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[81] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Gerenciar acesso — ${label}`}
          className="pointer-events-auto w-full sm:max-w-[460px] max-h-[92vh] sm:max-h-[80vh] flex flex-col bg-[#0A1E2C] border border-[#38435C] sm:rounded-2xl rounded-t-2xl shadow-[0_24px_70px_-16px_rgba(0,0,0,0.7)]"
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#38435C]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-[#95BBE2] flex-shrink-0" />
                <h2 className="text-[15px] font-semibold text-[#EBEBEB] truncate">
                  Gerenciar acesso — {label}
                </h2>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#87919E]">
                Sem lista personalizada, o acesso segue o papel de cada usuário. Com lista, só quem
                estiver aqui vê este espaço — além dos administradores.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex-shrink-0 text-[#647488] hover:text-[#f2f6fa] p-1 -mr-1 -mt-1"
            >
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[#647488] text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Carregando…
            </div>
          ) : loadError ? (
            <div className="px-5 py-10 text-center text-[13px] text-[#ff5e6a]">{loadError}</div>
          ) : (
            <>
              {/* Toggle modo custom */}
              <div className="px-5 py-4 border-b border-[#38435C]">
                <button
                  role="switch"
                  aria-checked={custom}
                  disabled={togglingMode}
                  onClick={() => handleToggleMode(!custom)}
                  className="w-full flex items-center gap-3 text-left disabled:opacity-60"
                >
                  <span
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                      custom ? 'bg-[#54e0ee]' : 'bg-white/[0.12]',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        custom && 'translate-x-4',
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[#f2f6fa]">
                      Acesso personalizado
                    </span>
                    <span className="block text-[11.5px] text-[#87919E]">
                      {custom
                        ? 'Só quem estiver na lista abaixo vê este espaço.'
                        : 'Ligado, você escolhe manualmente quem vê este espaço.'}
                    </span>
                  </span>
                  {togglingMode && <Loader2 size={14} className="animate-spin text-[#647488]" />}
                </button>

                {!custom && (
                  <p className="mt-3 text-[11.5px] text-[#87919E] bg-white/[0.03] rounded-lg px-3 py-2">
                    Hoje este espaço segue o acesso por papel de cada usuário.
                  </p>
                )}
                {custom && (
                  <p className="mt-3 text-[11.5px] text-[#e0b055] bg-[#e0b055]/[0.08] rounded-lg px-3 py-2">
                    Ao desligar, voltará a valer o acesso por papel (a lista será removida).
                  </p>
                )}
              </div>

              {/* Lista de staff — só editável em modo custom */}
              {custom && (
                <>
                  {showSearch && (
                    <div className="px-5 pt-4">
                      <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                        <Search size={14} className="text-[#647488]" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar por nome ou e-mail…"
                          className="flex-1 bg-transparent text-[12.5px] text-[#f2f6fa] placeholder-[#647488] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[120px]">
                    {filteredStaff.length === 0 ? (
                      <p className="text-center text-[12.5px] text-[#647488] py-8">
                        {staff.length === 0
                          ? 'Nenhum usuário ativo para listar.'
                          : 'Ninguém encontrado para esta busca.'}
                      </p>
                    ) : (
                      <ul className="space-y-0.5">
                        {filteredStaff.map((u) => {
                          const checked = selected.has(u.id)
                          return (
                            <li key={u.id}>
                              <button
                                onClick={() => toggleUser(u.id)}
                                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/[0.05] transition-colors"
                              >
                                <span
                                  className={cn(
                                    'flex-shrink-0 w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors',
                                    checked
                                      ? 'bg-[#54e0ee] border-[#54e0ee]'
                                      : 'border-[#4a5a6e] bg-transparent',
                                  )}
                                >
                                  {checked && <Check size={12} className="text-[#0A1E2C]" strokeWidth={3} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[13px] text-[#f2f6fa] truncate">
                                    {u.name}
                                  </span>
                                  <span className="block text-[11px] text-[#647488] truncate">
                                    {u.email}
                                  </span>
                                </span>
                                <span className="flex-shrink-0 text-[10.5px] font-medium text-[#95BBE2] bg-[#95BBE2]/10 rounded-full px-2 py-0.5">
                                  {roleLabel(u.role)}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#38435C]">
                <span className="text-[11.5px] text-[#647488]">
                  {custom
                    ? `${selected.size} selecionado${selected.size === 1 ? '' : 's'}`
                    : 'Acesso por papel'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="text-[12.5px] font-medium text-[#a3b2c2] hover:text-[#f2f6fa] px-3 py-2 rounded-lg hover:bg-white/[0.05]"
                  >
                    Fechar
                  </button>
                  {custom && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 text-[12.5px] font-semibold text-[#0A1E2C] bg-[#54e0ee] hover:bg-[#54e0ee]/90 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors"
                    >
                      {saving && <Loader2 size={13} className="animate-spin" />}
                      Salvar lista
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
