'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ListTodo, Users, Activity, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { globalSearch, type SearchResult } from '@/app/actions/search'
import { NAV_LINKS } from './Sidebar'
import { can, normalizeRole } from '@/lib/rbac'
import type { SessionPayload } from '@/lib/session'

type SessionRole = SessionPayload['role']

type Flat = { key: string; group: string; label: string; sub?: string; href: string; icon: React.ElementType }

export function CommandPalette({ open, onClose, role }: { open: boolean; onClose: () => void; role: SessionRole }) {
  const router = useRouter()

  // Quick-links = TODAS as páginas do menu (derivadas do registry da Sidebar,
  // sem lista duplicada), filtradas pela MESMA matriz de permissões do backend.
  const QUICK: Flat[] = useMemo(() => {
    const r = normalizeRole(role)
    return NAV_LINKS
      .filter((l) => !l.module || can(r, 'view', l.module))
      .map((l) => ({ key: `q-${l.href}`, group: 'Ir para', label: l.name, href: l.href, icon: l.icon }))
  }, [role])

  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)

  // Monta a lista achatada (para navegação por teclado)
  const flat: Flat[] = (() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) {
      return QUICK.filter((i) => !term || i.label.toLowerCase().includes(term))
    }
    const items: Flat[] = []
    res?.tasks.forEach((t) =>
      items.push({ key: `t-${t.id}`, group: 'Tarefas', label: t.title, sub: t.clientSlug ?? undefined, href: `/operacional?task=${t.id}`, icon: ListTodo }),
    )
    res?.clients.forEach((c) =>
      items.push({ key: `c-${c.id}`, group: 'Clientes', label: c.name, href: `/clients/${c.slug}`, icon: Users }),
    )
    res?.pops.forEach((p) =>
      items.push({ key: `p-${p.id}`, group: 'POPs', label: `${p.code} — ${p.name}`, href: `/processos#pop-${p.code}`, icon: Activity }),
    )
    return items
  })()

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setQ(''); setRes(null); setActive(0)
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Busca com debounce
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) { setRes(null); setLoading(false); return }
    setLoading(true)
    const h = setTimeout(async () => {
      const r = await globalSearch(term)
      setRes(r); setLoading(false); setActive(0)
    }, 180)
    return () => clearTimeout(h)
  }, [q, open])

  const go = useCallback((f: Flat) => { onClose(); router.push(f.href) }, [onClose, router])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) go(flat[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open) return null

  // Agrupa para render
  const groups: { name: string; items: { f: Flat; idx: number }[] }[] = []
  flat.forEach((f, idx) => {
    let g = groups.find((x) => x.name === f.group)
    if (!g) { g = { name: f.group, items: [] }; groups.push(g) }
    g.items.push({ f, idx })
  })

  return (
    <>
      <div className="ak-scrim lg-overlay fixed inset-0 bg-black/55 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-[14vh] -translate-x-1/2 w-full max-w-[600px] z-[61] px-4">
        <div className="lg-glass-strong border border-white/[0.09] rounded-2xl shadow-[0_24px_70px_-16px_rgba(0,0,0,0.62)] overflow-hidden">
          <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.07]">
            <Search size={17} className="text-[#647488]" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar tarefas, clientes, POPs…"
              className="flex-1 bg-transparent text-[15px] text-[#f2f6fa] placeholder-[#647488] focus:outline-none"
            />
            {loading && <span className="text-[10px] text-[#647488]">buscando…</span>}
            <kbd className="font-mono text-[10.5px] text-[#a3b2c2] bg-white/[0.08] rounded-md px-1.5 py-0.5">esc</kbd>
          </div>

          <div className="max-h-[52vh] overflow-y-auto py-2">
            {flat.length === 0 ? (
              <p className="text-center text-[12.5px] text-[#647488] py-8">
                {q.trim().length < 2 ? 'Digite ao menos 2 caracteres.' : 'Nada encontrado.'}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.name} className="mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-[#647488] px-4 py-1.5 font-semibold">{g.name}</p>
                  {g.items.map(({ f, idx }) => {
                    const Icon = f.icon
                    return (
                      <button
                        key={f.key}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go(f)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === active ? 'bg-[#95BBE2]/12' : 'hover:bg-white/[0.04]'}`}
                      >
                        <Icon size={15} className={idx === active ? 'text-[#54e0ee]' : 'text-[#647488]'} />
                        <span className="flex-1 min-w-0 truncate text-[13px] text-[#f2f6fa]">{f.label}</span>
                        {f.sub && <span className="text-[11px] text-[#647488] truncate">{f.sub}</span>}
                        {idx === active && <CornerDownLeft size={13} className="text-[#647488] flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 px-4 h-9 border-t border-white/[0.07] text-[10px] text-[#647488]">
            <span className="flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> navegar</span>
            <span className="flex items-center gap-1"><CornerDownLeft size={10} /> abrir</span>
            <span className="ml-auto">Command palette</span>
          </div>
        </div>
      </div>
    </>
  )
}
