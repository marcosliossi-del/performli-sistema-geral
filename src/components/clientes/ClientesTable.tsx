'use client'

import { useState, useTransition, useEffect, useRef, type ReactNode } from 'react'
import { Search, Plus, MessageCircle, Pencil, ShoppingCart, MapPin, Building2, ArrowRight, ChevronDown, Check, X } from 'lucide-react'
import type { ClientStatus, BusinessType, ClientCurva, MetricType } from '@prisma/client'
import { formatCurrency } from '@/lib/utils'
import { bulkSetBusinessType, updateClientsStatus, updateClientProdutos } from '@/app/actions/updateClient'
import { updateClientField, updateClientContractInline } from '@/app/actions/clientInline'
import { updateClientPrimaryManager } from '@/app/actions/assignments'
import { upsertMonthlyGoals, type GoalUpsert } from '@/app/actions/goals'
import { LOCAL_RESULT_METRICS, costMetricFor, costLabelFor } from '@/lib/metas/metricOptions'
import { ClientIdentity } from '@/components/clients/ClientIdentity'
import { toast } from '@/lib/toast'

// Sugestões de 1 clique para Tipo de Serviço (mesma lista canônica do modal).
const SERVICO_SUGERIDO = ['Tráfego Pago', 'CRM', 'Traqueamento']

export interface ClientRow {
  id:            string
  name:          string
  razaoSocial:   string | null
  slug:          string
  phone:         string | null
  email:         string | null
  status:        string
  pausedAt:      string | null
  pauseReason:   string | null
  createdAt:     string
  businessType:  string
  tipoServico:   string
  produtos:      string[]
  classificacao: 'OURO' | 'PRATA' | 'BRONZE' | null
  curva:         'A' | 'B' | 'C' | null
  periodoInicio: string | null
  periodoFim:    string | null
  fonteContrato: 'juridico' | 'cadastro'
  emRenovacao:   boolean
  vencido:       boolean
  venceEmDias:   number | null
  plataformas:   string[]
  responsavel:   string | null
  responsavelId: string | null
  investimento:  number | null
  investimentoMeta:   number | null
  investimentoGoogle: number | null
  investimentoTiktok: number | null
  roasMinimo:         number | null
  // Espelho de metas para LOCAL/B2B (null em e-commerce). Fonte: Goal MONTHLY do
  // mês corrente — editar aqui grava via upsertMonthlyGoals (bidirecional c/ a grade).
  localMetric:  MetricType | null
  localValue:   number | null
  localCost:    number | null   // custo-alvo (CPL p/ LEADS, senão CPA)
  localBudget:  number | null   // Goal SPEND (financeiro → só ADMIN)
  contractValue: number | null
}

/** LOCAL e B2B usam o espelho de metas; e-commerce usa budget por plataforma. */
function isLocalType(bt: string): boolean {
  return bt === 'LOCAL' || bt === 'B2B'
}

/** Rótulo curto da métrica-resultado (Leads/Mensagens/Compras…) p/ a pill. */
function metricShortLabel(metric: MetricType | null): string {
  if (!metric) return 'Definir métrica'
  return LOCAL_RESULT_METRICS.find((m) => m.value === metric)?.label ?? metric
}

/** Bounds 'YYYY-MM-DD' do MÊS CORRENTE (mesma convenção da grade MetasBulkTable). */
function currentMonthBounds(): { startDate: string; endDate: string } {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0)
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { startDate: fmt(start), endDate: fmt(end) }
}

interface Totals {
  count:            number
  somaContrato:     number | null
  somaInvestimento: number | null
  somaInvestMeta:   number | null
  somaInvestGoogle: number | null
  somaInvestTiktok: number | null
}

interface StaffOption {
  id:   string
  name: string
}

interface Props {
  clients: ClientRow[]
  totals:  Totals
  isAdmin: boolean
  /** ADMIN/SUPERVISOR: pode editar status (inline + massa). Demais: pill estática. */
  canEditStatus?: boolean
  /** Staff de tráfego: pode editar campos do Client inline (nome/serviço/etc). */
  canEditFields?: boolean
  /** Staff atribuível como gestor primário (só ADMIN recebe a lista). */
  staff?: StaffOption[]
}

// Ordem e rótulos das opções do seletor de status (print do Marcos).
const STATUS_OPTIONS: { value: ClientStatus; label: string; color: string }[] = [
  { value: 'ACTIVE',  label: 'Ativo',     color: '#22C55E' },
  { value: 'PAUSED',  label: 'Pausado',   color: '#F59E0B' },
  { value: 'CHURNED', label: 'Cancelado', color: '#EF4444' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: 'Ativo',     color: '#22C55E' },
  PAUSED:  { label: 'Pausado',   color: '#F59E0B' },
  CHURNED: { label: 'Cancelado', color: '#EF4444' },
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof ShoppingCart; color: string }> = {
  ECOMMERCE: { label: 'E-commerce',    icon: ShoppingCart, color: '#95BBE2' },
  LOCAL:     { label: 'Negócio Local', icon: MapPin,       color: '#A78BFA' },
  B2B:       { label: 'B2B / Atacado', icon: Building2,    color: '#34D399' },
}

// Opções do seletor de Modelo de Negócio (BusinessType do schema).
const BUSINESS_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: 'ECOMMERCE', label: 'E-commerce' },
  { value: 'LOCAL',     label: 'Negócio Local' },
  { value: 'B2B',       label: 'B2B / Atacado' },
]

// Opções do seletor de Classificação → gravam a CURVA canônica (A/B/C).
const CLASSIF_OPTIONS: { value: ClientCurva; label: string; color: string }[] = [
  { value: 'A', label: 'Ouro',   color: '#D4AF37' },
  { value: 'B', label: 'Prata',  color: '#9CA3AF' },
  { value: 'C', label: 'Bronze', color: '#CD7F32' },
]

const CLASSIF_CONFIG: Record<string, { label: string; color: string }> = {
  OURO:   { label: 'Ouro',   color: '#D4AF37' },
  PRATA:  { label: 'Prata',  color: '#9CA3AF' },
  BRONZE: { label: 'Bronze', color: '#CD7F32' },
}

// Cores das plataformas — alinhadas às badges já usadas no sistema.
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  META_ADS:   { label: 'Meta Ads',   color: '#1877F2' },
  GOOGLE_ADS: { label: 'Google Ads', color: '#EA4335' },
  TIKTOK_ADS: { label: 'TikTok Ads', color: '#EE1D52' },
  GA4:        { label: 'GA4',         color: '#E37400' },
  NUVEMSHOP:  { label: 'Nuvemshop',   color: '#2D9CDB' },
  GA4SYNC:    { label: 'GA4',         color: '#E37400' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** ISO → 'yyyy-mm-dd' (UTC) para <input type="date">. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

// ─── EDITORES INLINE REUTILIZÁVEIS (estilo ClickUp) ───────────────────────────
// Clicar na célula abre o editor in-place; Enter/blur salva, Esc cancela. Sem
// lápis, sem modal. O salvamento é OTIMISTA (o pai aplica override + rollback).

/** Célula de TEXTO editável. onSave só dispara se o valor mudou. */
function InlineText({
  value, onSave, canEdit, placeholder, className,
}: {
  value: string
  onSave: (v: string) => void
  canEdit: boolean
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!canEdit) {
    return <span className={className}>{value || <span className="text-[#38435C]">—</span>}</span>
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true) }}
        className={`text-left hover:bg-[#38435C]/30 rounded px-1 -mx-1 py-0.5 transition-colors ${className ?? ''}`}
        title="Clique para editar"
      >
        {value || <span className="text-[#38435C]">{placeholder ?? '—'}</span>}
      </button>
    )
  }
  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape') { setEditing(false) }
      }}
      className="w-full min-w-[120px] h-7 px-2 rounded bg-[#0A1E2C] border border-[#95BBE2] text-sm text-[#EBEBEB] focus:outline-none"
    />
  )
}

/** Célula NUMÉRICA editável (moeda ou taxa). Valor null = "não informado". */
function InlineNumber({
  value, onSave, canEdit, render, align = 'right', step = '0.01',
}: {
  value: number | null
  onSave: (v: number | null) => void
  canEdit: boolean
  render: (v: number | null) => ReactNode
  align?: 'right' | 'left'
  step?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!canEdit) return <>{render(value)}</>
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true) }}
        className={`w-full hover:bg-[#38435C]/30 rounded px-1 py-0.5 transition-colors text-${align}`}
        title="Clique para editar"
      >
        {render(value)}
      </button>
    )
  }
  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && !Number.isFinite(next as number)) return
    if (next !== value) onSave(next)
  }
  return (
    <input
      autoFocus
      type="number"
      step={step}
      min="0"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape') { setEditing(false) }
      }}
      className={`w-full min-w-[90px] h-7 px-2 rounded bg-[#0A1E2C] border border-[#95BBE2] text-sm text-[#EBEBEB] focus:outline-none text-${align}`}
    />
  )
}

/** Dropdown-pill genérico (mesmo padrão do seletor de STATUS). */
function InlineDropdown({
  canEdit, trigger, children, width = 'w-44',
}: {
  canEdit: boolean
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!canEdit) return <>{trigger}</>
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 hover:brightness-110 transition"
        title="Clique para editar"
      >
        {trigger}
        <ChevronDown size={11} className="text-[#87919E]" />
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 left-0 ${width} rounded-lg border border-[#38435C] bg-[#0D2137] shadow-xl py-1`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Editor de TIPO DE SERVIÇO (Client.produtos): chips de sugestão + livres. */
function ServicoEditor({
  produtos, canEdit, onSave,
}: {
  produtos: string[]
  canEdit: boolean
  onSave: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(produtos)
  const [novo, setNovo] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = produtos.length > 0 ? produtos.join(' · ') : 'Gestão de Tráfego'
  if (!canEdit) return <span className="whitespace-nowrap">{label}</span>

  function toggle(p: string) {
    setDraft(list =>
      list.some(x => x.toLowerCase() === p.toLowerCase())
        ? list.filter(x => x.toLowerCase() !== p.toLowerCase())
        : list.length < 20 ? [...list, p] : list,
    )
  }
  function add(raw: string) {
    const p = raw.trim().slice(0, 60)
    if (!p || draft.some(x => x.toLowerCase() === p.toLowerCase()) || draft.length >= 20) return
    setDraft(list => [...list, p]); setNovo('')
  }
  function commit(close: () => void) {
    close()
    const changed = draft.length !== produtos.length || draft.some(p => !produtos.includes(p))
    if (changed) onSave(draft)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => { setDraft(produtos); setOpen(o => !o) }}
        className="text-left hover:bg-[#38435C]/30 rounded px-1 -mx-1 py-0.5 transition-colors whitespace-nowrap"
        title="Clique para editar o tipo de serviço"
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-64 rounded-lg border border-[#38435C] bg-[#0D2137] shadow-xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {draft.length === 0 && <span className="text-[11px] text-[#647488]">Nenhum serviço.</span>}
            {draft.map(p => (
              <span key={p} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#95BBE2]/10 border border-[#95BBE2]/30 text-[11px] text-[#EBEBEB]">
                {p}
                <button type="button" onClick={() => toggle(p)} aria-label={`Remover ${p}`} className="text-[#87919E] hover:text-[#EF4444]">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SERVICO_SUGERIDO.filter(s => !draft.some(p => p.toLowerCase() === s.toLowerCase())).map(s => (
              <button key={s} type="button" onClick={() => toggle(s)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-[#38435C] text-[11px] text-[#87919E] hover:border-[#95BBE2]/50 hover:text-[#EBEBEB] transition-colors">
                <Plus size={10} />{s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={novo}
              onChange={e => setNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(novo) } }}
              maxLength={60}
              placeholder="Outro serviço"
              className="flex-1 h-7 px-2 rounded bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
            />
            <button type="button" onClick={() => add(novo)} disabled={!novo.trim()} className="px-2 h-7 rounded border border-[#38435C] text-xs text-[#87919E] hover:text-[#EBEBEB] disabled:opacity-40">+</button>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-[#87919E] hover:text-[#EBEBEB]">Cancelar</button>
            <button type="button" onClick={() => commit(() => setOpen(false))} className="text-[11px] font-semibold text-[#0A1E2C] bg-[#95BBE2] px-2.5 py-1 rounded">Salvar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Editor de PERÍODO do contrato: dois date inputs (início/fim). */
function PeriodoEditor({
  periodoInicio, periodoFim, fonteContrato, canEdit, onSave, children,
}: {
  periodoInicio: string | null
  periodoFim: string | null
  fonteContrato: 'juridico' | 'cadastro'
  canEdit: boolean
  onSave: (start: string, end: string) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!canEdit) return <>{children}</>
  function commit() {
    setOpen(false)
    if (start && end && new Date(end) <= new Date(start)) return
    const s0 = toDateInput(periodoInicio), e0 = toDateInput(periodoFim)
    if (start !== s0 || end !== e0) onSave(start, end)
  }
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => { setStart(toDateInput(periodoInicio)); setEnd(toDateInput(periodoFim)); setOpen(o => !o) }}
        className="text-left hover:bg-[#38435C]/30 rounded px-1 -mx-1 py-0.5 transition-colors"
        title={fonteContrato === 'juridico' ? 'Editar período do contrato vigente (Jurídico)' : 'Sem contrato no Jurídico — edita o período do cadastro'}
      >
        {children}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-60 rounded-lg border border-[#38435C] bg-[#0D2137] shadow-xl p-3 space-y-2">
          <p className="text-[10px] text-[#87919E]">
            {fonteContrato === 'juridico'
              ? 'Atualiza o contrato vigente no Jurídico.'
              : 'Sem contrato vigente — atualiza o período no cadastro do cliente.'}
          </p>
          <label className="block text-[10px] text-[#87919E]">Início
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-0.5 w-full h-7 px-2 rounded bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50" />
          </label>
          <label className="block text-[10px] text-[#87919E]">Vencimento
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="mt-0.5 w-full h-7 px-2 rounded bg-[#0A1E2C] border border-[#38435C] text-xs text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-[#87919E] hover:text-[#EBEBEB]">Cancelar</button>
            <button type="button" onClick={commit} className="text-[11px] font-semibold text-[#0A1E2C] bg-[#95BBE2] px-2.5 py-1 rounded">Salvar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Patch parcial do espelho de metas de um cliente local (o que o usuário mexeu). */
type LocalMetaPatch = {
  localMetric?: MetricType
  localValue?: number | null
  localCost?: number | null
  localBudget?: number | null
}

/**
 * As 4 células de metas para clientes LOCAL/B2B (substituem Meta/Google/TikTok/ROAS
 * do e-commerce): Métrica principal · Meta · Custo-alvo (CPL/CPA) · Budget.
 *
 * Fonte de leitura = Goal MONTHLY do mês corrente (regra 0 — sem campo novo no
 * Client). A edição é ADMIN-only por construção: grava pela MESMA action da grade
 * (upsertMonthlyGoals, que é ADMIN) → bidirecional com /agency/metas. Budget é
 * financeiro (só ADMIN vê valor); métrica/meta/custo são operacionais (todos veem,
 * mas só ADMIN edita).
 */
function LocalMetasCells({
  client, isAdmin, onSave,
}: {
  client: ClientRow
  isAdmin: boolean
  onSave: (client: ClientRow, patch: LocalMetaPatch) => void
}) {
  const metric = client.localMetric
  const costLabel = costLabelFor(metric ?? 'LEADS')

  const metricPill = (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: '#A78BFA', background: '#A78BFA18' }}
    >
      {metricShortLabel(metric)}
    </span>
  )

  return (
    <>
      {/* Métrica principal (dropdown ADMIN; pill estática p/ os demais) */}
      <td className="px-3 py-3 text-left whitespace-nowrap">
        {isAdmin ? (
          <InlineDropdown canEdit width="w-48" trigger={metricPill}>
            {(close) => (
              <div className="max-h-56 overflow-y-auto">
                {LOCAL_RESULT_METRICS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      close()
                      if (m.value !== (metric ?? 'LEADS')) onSave(client, { localMetric: m.value })
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#EBEBEB] hover:bg-[#38435C]/40 transition"
                  >
                    <span className="flex-1 text-left">{m.label}</span>
                    {metric === m.value && <Check size={12} className="text-[#95BBE2]" />}
                  </button>
                ))}
              </div>
            )}
          </InlineDropdown>
        ) : (
          metricPill
        )}
      </td>

      {/* Meta (valor da métrica principal) */}
      <td className="px-3 py-3 text-right text-xs text-[#C7CDD6] whitespace-nowrap">
        <InlineNumber
          value={client.localValue}
          canEdit={isAdmin}
          step="1"
          onSave={(v) => onSave(client, { localValue: v })}
          render={(v) => (v != null ? v.toLocaleString('pt-BR') : <span className="text-[#38435C]">—</span>)}
        />
      </td>

      {/* Custo-alvo (CPL/CPA) — operacional, visível a todos, editável só ADMIN */}
      <td className="px-3 py-3 text-right text-xs text-[#C7CDD6] whitespace-nowrap">
        <InlineNumber
          value={client.localCost}
          canEdit={isAdmin}
          onSave={(v) => onSave(client, { localCost: v })}
          render={(v) =>
            v != null ? (
              <span>
                <span className="text-[9px] text-[#87919E] mr-1">{costLabel}</span>
                {formatCurrency(v)}
              </span>
            ) : (
              <span className="text-[#38435C]">—</span>
            )
          }
        />
      </td>

      {/* Budget (Goal SPEND) — financeiro, só ADMIN */}
      <td className="px-3 py-3 text-right text-xs text-[#EBEBEB] whitespace-nowrap">
        {isAdmin ? (
          <InlineNumber
            value={client.localBudget}
            canEdit
            step="100"
            onSave={(v) => onSave(client, { localBudget: v })}
            render={(v) => (v ? formatCurrency(v) : <span className="text-[#38435C]">—</span>)}
          />
        ) : (
          <span className="text-[#38435C]" title="Restrito ao administrador">—</span>
        )}
      </td>
    </>
  )
}

export function ClientesTable({ clients, totals, isAdmin, canEditStatus = false, canEditFields = false, staff = [] }: Props) {
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'CHURNED'>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ECOMMERCE' | 'LOCAL'>('ALL')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Overrides otimistas de status (id → status). Aplicados por cima do prop até o
  // revalidate do servidor trazer o valor persistido. Rollback em caso de erro.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ClientStatus>>({})
  const statusOf = (c: ClientRow): string => statusOverrides[c.id] ?? c.status

  // Overrides otimistas de CAMPOS (id → patch parcial da linha). Aplicados por cima
  // do prop até o revalidate trazer o valor persistido; rollback em erro.
  const [rowOverrides, setRowOverrides] = useState<Record<string, Partial<ClientRow>>>({})
  const viewOf = (c: ClientRow): ClientRow => ({ ...c, ...rowOverrides[c.id] })

  // Menu de status aberto (id da linha) — dropdown-pill inline.
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  /**
   * Salvamento OTIMISTA genérico de campo: aplica o override, chama a action e,
   * em erro, faz rollback dos MESMOS campos ao valor anterior + toast('...', 'err').
   * `okMsg` só aparece no sucesso. Não fecha nada — os editores já se fecham.
   */
  function saveField(
    id: string,
    optimistic: Partial<ClientRow>,
    fn: () => Promise<{ error?: string }>,
    okMsg: string,
  ) {
    const keys = Object.keys(optimistic) as (keyof ClientRow)[]
    // Snapshot dos valores anteriores (override atual OU valor do prop).
    const base = clients.find(c => c.id === id)
    const prev: Partial<ClientRow> = {}
    for (const k of keys) {
      const cur = rowOverrides[id]
      prev[k] = (cur && k in cur ? cur[k] : base?.[k]) as never
    }

    setRowOverrides(o => ({ ...o, [id]: { ...o[id], ...optimistic } }))

    startTransition(async () => {
      const res = await fn()
      if (res?.error) {
        setRowOverrides(o => ({ ...o, [id]: { ...o[id], ...prev } }))
        toast(res.error, 'err')
        return
      }
      toast(okMsg, 'ok')
    })
  }

  /**
   * Salva o espelho de metas de um cliente LOCAL/B2B. Reconstrói o CONJUNTO
   * completo (métrica principal · meta · custo-alvo · budget) — igual ao buildGoals
   * da grade — e grava pela MESMA action (upsertMonthlyGoals). Assim editar na aba
   * Clientes reflete na grade e vice-versa (DADO AMARRADO §0). Reaproveita o
   * salvamento otimista de `saveField`. Convenção herdada da grade: valor null/0 é
   * "sem meta" e NÃO é enviado (não dá para limpar por aqui — igual à grade).
   */
  function saveLocalMetas(client: ClientRow, patch: LocalMetaPatch) {
    const cur = viewOf(client)
    const metric = patch.localMetric ?? cur.localMetric ?? ('LEADS' as MetricType)
    const value  = patch.localValue  !== undefined ? patch.localValue  : cur.localValue
    const cost   = patch.localCost   !== undefined ? patch.localCost   : cur.localCost
    const budget = patch.localBudget !== undefined ? patch.localBudget : cur.localBudget

    const { startDate, endDate } = currentMonthBounds()
    const goals: GoalUpsert[] = []
    if (budget != null && budget >= 0) goals.push({ clientId: client.id, metric: 'SPEND', value: budget, startDate, endDate })
    if (value  != null && value  >= 0) goals.push({ clientId: client.id, metric, value, startDate, endDate })
    if (cost   != null && cost   >= 0) goals.push({ clientId: client.id, metric: costMetricFor(metric), value: cost, startDate, endDate })
    if (goals.length === 0) return

    saveField(
      client.id,
      { localMetric: metric, localValue: value, localCost: cost, localBudget: budget },
      () => upsertMonthlyGoals(goals).then((r) => (r.ok ? {} : { error: r.error ?? 'Falha ao salvar as metas.' })),
      'Metas do cliente atualizadas · grade sincronizada',
    )
  }

  const filtered = clients.map(viewOf).filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search)
    const matchFilter = filter === 'ALL' || statusOf(c) === filter
    const matchType   = typeFilter === 'ALL' || c.businessType === typeFilter
    return matchSearch && matchFilter && matchType
  })

  /**
   * Aplica um status a um conjunto de clientes de forma OTIMISTA e chama a action.
   * Rollback + toast de erro se a action falhar. `confirmChurn` mostra confirm
   * antes de cancelar (ação estrutural).
   */
  function applyStatus(ids: string[], status: ClientStatus) {
    if (ids.length === 0) return
    if (status === 'CHURNED') {
      const ok = window.confirm(
        `Cancelar ${ids.length} cliente${ids.length !== 1 ? 's' : ''}? Eles saem das rotinas e metas ativas.`,
      )
      if (!ok) return
    }

    // Snapshot para rollback.
    const prev: Record<string, ClientStatus | undefined> = {}
    for (const id of ids) prev[id] = statusOverrides[id]

    setStatusOverrides(o => {
      const next = { ...o }
      for (const id of ids) next[id] = status
      return next
    })
    setOpenMenu(null)

    startTransition(async () => {
      const res = await updateClientsStatus(ids, status)
      if (res.error) {
        // Rollback.
        setStatusOverrides(o => {
          const next = { ...o }
          for (const id of ids) {
            if (prev[id] === undefined) delete next[id]
            else next[id] = prev[id]!
          }
          return next
        })
        toast(res.error, 'err')
        return
      }
      const label = STATUS_OPTIONS.find(s => s.value === status)?.label ?? status
      toast(`${res.updated} cliente${res.updated !== 1 ? 's' : ''} → ${label}`, 'ok')
      if (res.renewedCount && res.renewedCount > 0) {
        toast(
          res.renewedUntil
            ? `Contrato renovado automaticamente até ${res.renewedUntil}`
            : `${res.renewedCount} contrato${res.renewedCount !== 1 ? 's' : ''} renovado${res.renewedCount !== 1 ? 's' : ''} automaticamente`,
          'info',
        )
      }
      setSelected(new Set())
    })
  }

  // Somas do rodapé recalculadas sobre o subconjunto FILTRADO (o que está à vista),
  // só para ADMIN (valores financeiros). Não filtrado → usa o total do servidor.
  const isFilteredView = search !== '' || filter !== 'ALL' || typeFilter !== 'ALL'
  const footContrato = isAdmin
    ? (isFilteredView ? filtered.reduce((s, c) => s + (c.contractValue ?? 0), 0) : totals.somaContrato ?? 0)
    : null
  // Somas por plataforma (colunas mistas): só somam o que é somável POR TIPO.
  // As 3 colunas de budget-por-plataforma agora somam APENAS e-commerce (locais
  // exibem a métrica-principal/meta/custo nessas colunas, que não somam entre si);
  // o budget dos locais soma à parte, na coluna de Budget (última das 4).
  const ecomFiltered  = filtered.filter((c) => !isLocalType(c.businessType))
  const localFiltered = filtered.filter((c) => isLocalType(c.businessType))
  const footInvestMeta   = isAdmin ? ecomFiltered.reduce((s, c) => s + (c.investimentoMeta ?? 0), 0) : null
  const footInvestGoogle = isAdmin ? ecomFiltered.reduce((s, c) => s + (c.investimentoGoogle ?? 0), 0) : null
  const footInvestTiktok = isAdmin ? ecomFiltered.reduce((s, c) => s + (c.investimentoTiktok ?? 0), 0) : null
  // Budget dos locais (Goal SPEND) somado à parte — vai na coluna de Budget/ROAS.
  const footLocalBudget  = isAdmin ? localFiltered.reduce((s, c) => s + (c.localBudget ?? 0), 0) : null

  // Fecha o menu de status ao clicar fora.
  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenu])

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleBulkSet(type: 'ECOMMERCE' | 'LOCAL') {
    startTransition(async () => {
      await bulkSetBusinessType(Array.from(selected), type)
      setSelected(new Set())
    })
  }

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#38435C]">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87919E]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
          {(['ALL', 'ACTIVE', 'PAUSED', 'CHURNED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-[#38435C] text-[#EBEBEB]' : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {f === 'ALL' ? 'Todos' : STATUS_LABELS[f].label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1 bg-[#0A1E2C] border border-[#38435C] rounded-lg p-1">
          {(['ALL', 'ECOMMERCE', 'LOCAL'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-[#38435C] text-[#EBEBEB]' : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
            >
              {t === 'ALL' ? 'Todos tipos' : TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>

        <a
          href="/clients/new"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors ml-auto"
        >
          <Plus size={13} />
          Novo cliente
        </a>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#95BBE2]/10 border-b border-[#95BBE2]/30">
          <span className="text-xs text-[#95BBE2] font-medium">
            {selected.size} cliente{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span className="text-[#38435C]">·</span>
          <span className="text-xs text-[#87919E]">Definir modelo de negócio como:</span>
          <button
            onClick={() => handleBulkSet('ECOMMERCE')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#95BBE2]/20 text-[#95BBE2] text-xs font-semibold hover:bg-[#95BBE2]/30 disabled:opacity-50 transition-colors"
          >
            <ShoppingCart size={12} />
            E-commerce
          </button>
          <button
            onClick={() => handleBulkSet('LOCAL')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A78BFA]/20 text-[#A78BFA] text-xs font-semibold hover:bg-[#A78BFA]/30 disabled:opacity-50 transition-colors"
          >
            <MapPin size={12} />
            Negócio Local
          </button>
          {canEditStatus && (
            <>
              <span className="text-[#38435C]">·</span>
              <span className="text-xs text-[#87919E]">Marcar como:</span>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => applyStatus(Array.from(selected), opt.value)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                  style={{ color: opt.color, background: `${opt.color}22` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </>
          )}
          {isPending && <span className="text-xs text-[#87919E]">Salvando...</span>}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-[#87919E] hover:text-[#EBEBEB] transition-colors"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#38435C] text-[#87919E] text-xs">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="rounded border-[#38435C] bg-[#0A1E2C] accent-[#22C55E]"
                />
              </th>
              <th className="text-left px-3 py-3 font-medium">STATUS</th>
              <th className="text-left px-3 py-3 font-medium">NOME</th>
              <th className="text-left px-3 py-3 font-medium">TIPO DE SERVIÇO</th>
              <th className="text-left px-3 py-3 font-medium">CLASSIFICAÇÃO</th>
              <th className="text-left px-3 py-3 font-medium">PERÍODO DO CONTRATO</th>
              <th className="text-left px-3 py-3 font-medium">MODELO DE NEGÓCIO</th>
              <th className="text-left px-3 py-3 font-medium">PLATAFORMA</th>
              <th className="text-left px-3 py-3 font-medium">RESPONSÁVEL</th>
              {/* 4 colunas MISTAS: e-commerce = budget por plataforma + ROAS mín.;
                  local/B2B = espelho da grade de metas (métrica · meta · custo · budget).
                  Rótulo duplo p/ manter legível na mesma tabela (linha 2 = uso local). */}
              <th className="text-right px-3 py-3 font-medium">
                <div className="flex flex-col items-end leading-tight">
                  <span>INVEST. META</span>
                  <span className="text-[9px] text-[#A78BFA]/80 normal-case font-normal">local: métrica</span>
                </div>
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <div className="flex flex-col items-end leading-tight">
                  <span>INVEST. GOOGLE</span>
                  <span className="text-[9px] text-[#A78BFA]/80 normal-case font-normal">local: meta</span>
                </div>
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <div className="flex flex-col items-end leading-tight">
                  <span>INVEST. TIKTOK</span>
                  <span className="text-[9px] text-[#A78BFA]/80 normal-case font-normal">local: custo-alvo</span>
                </div>
              </th>
              <th className="text-right px-3 py-3 font-medium">
                <div className="flex flex-col items-end leading-tight">
                  <span>ROAS MÍN.</span>
                  <span className="text-[9px] text-[#A78BFA]/80 normal-case font-normal">local: budget</span>
                </div>
              </th>
              <th className="text-right px-3 py-3 font-medium">VALOR CONTRATO</th>
              {/* Saúde vive num LUGAR SÓ: link para o quadro único (Client 360). */}
              <th className="text-left px-3 py-3 font-medium">SAÚDE</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={16} className="text-center py-12 text-sm text-[#87919E]">
                  Nenhum cliente encontrado
                </td>
              </tr>
            ) : (
              filtered.map(client => {
                const curStatus = statusOf(client)
                const st  = STATUS_LABELS[curStatus] ?? STATUS_LABELS.ACTIVE
                // "Em renovação" DERIVADO do Contract (regra 0): cliente ACTIVE cujo
                // contrato vigente está vencido/RENOVACAO. Não grava nada no Client —
                // é só o rótulo da pill (âmbar). Escolher "Ativo" no menu dispara a
                // auto-renovação no servidor (updateClientsStatus → computeRenewalDates).
                const emRenov = curStatus === 'ACTIVE' && client.emRenovacao
                const pill = emRenov ? { label: 'Em renovação', color: '#F59E0B' } : st
                const typ = TYPE_CONFIG[client.businessType] ?? TYPE_CONFIG.ECOMMERCE
                const TypeIcon = typ.icon
                const classif = client.classificacao ? CLASSIF_CONFIG[client.classificacao] : null

                // Cor do período: vencido = vermelho; vence em <30d = âmbar (diz o porquê).
                let periodoColor = '#87919E'
                let periodoNota: string | null = null
                if (client.periodoFim) {
                  if (client.vencido) {
                    periodoColor = '#EF4444'
                    const d = client.venceEmDias != null ? Math.abs(client.venceEmDias) : null
                    periodoNota = d != null ? `Vencido há ${d}d` : 'Vencido'
                  } else if (client.venceEmDias != null && client.venceEmDias < 30) {
                    periodoColor = '#F59E0B'
                    periodoNota = `Vence em ${client.venceEmDias}d`
                  }
                }

                return (
                  <tr
                    key={client.id}
                    className={`border-b border-[#38435C]/50 hover:bg-[#38435C]/10 transition-colors ${
                      selected.has(client.id) ? 'bg-[#95BBE2]/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(client.id)}
                        onChange={() => toggleOne(client.id)}
                        className="rounded border-[#38435C] bg-[#0A1E2C] accent-[#22C55E]"
                      />
                    </td>

                    {/* STATUS — dropdown-pill editável (ADMIN/SUPERVISOR) ou pill estática */}
                    <td className="px-3 py-3">
                      {canEditStatus ? (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setOpenMenu(m => (m === client.id ? null : client.id))}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap hover:brightness-110 disabled:opacity-50 transition"
                            style={{ color: pill.color, background: `${pill.color}18` }}
                            title={emRenov ? 'Contrato vigente vencido/em renovação — escolha "Ativo" para renovar automaticamente pelo mesmo período' : 'Alterar status do cliente'}
                          >
                            {pill.label}
                            <ChevronDown size={11} />
                          </button>
                          {openMenu === client.id && (
                            <div className="absolute z-20 mt-1 left-0 w-36 rounded-lg border border-[#38435C] bg-[#0D2137] shadow-xl py-1">
                              {STATUS_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => applyStatus([client.id], opt.value)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#EBEBEB] hover:bg-[#38435C]/40 transition"
                                >
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: opt.color }}
                                  />
                                  <span className="flex-1 text-left">{opt.label}</span>
                                  {curStatus === opt.value && <Check size={12} className="text-[#95BBE2]" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: pill.color, background: `${pill.color}18` }}
                          title={
                            emRenov
                              ? 'Contrato vigente vencido/em renovação (derivado do Jurídico)'
                              : curStatus === 'PAUSED'
                                ? `Pausado${client.pausedAt ? ` desde ${new Date(client.pausedAt).toLocaleDateString('pt-BR')}` : ''}${client.pauseReason ? ` — ${client.pauseReason}` : ''}`
                                : undefined
                          }
                        >
                          {pill.label}
                        </span>
                      )}
                    </td>

                    {/* NOME — editável inline; sem edição, mantém o link p/ o cliente */}
                    <td className="px-3 py-3">
                      <div className="max-w-[180px]">
                        {canEditFields ? (
                          <>
                            <InlineText
                              value={client.name}
                              canEdit
                              onSave={(v) =>
                                saveField(client.id, { name: v }, () => updateClientField(client.id, { name: v }), 'Nome atualizado')
                              }
                              className="text-sm font-medium text-[#EBEBEB]"
                            />
                            {client.razaoSocial &&
                              client.razaoSocial.trim().toLowerCase() !== client.name.trim().toLowerCase() && (
                                <p className="text-[11px] text-[#647488] truncate" title={client.razaoSocial}>
                                  {client.razaoSocial}
                                </p>
                              )}
                          </>
                        ) : (
                          <ClientIdentity
                            name={client.name}
                            razaoSocial={client.razaoSocial}
                            href={`/clients/${client.slug}`}
                          />
                        )}
                      </div>
                    </td>

                    {/* TIPO DE SERVIÇO — multi-select de produtos (fonte: Client.produtos) */}
                    <td className="px-3 py-3 text-xs text-[#C7CDD6]">
                      <ServicoEditor
                        produtos={client.produtos}
                        canEdit={canEditFields}
                        onSave={(next) =>
                          saveField(
                            client.id,
                            { produtos: next, tipoServico: next.length > 0 ? next.join(' · ') : 'Gestão de Tráfego' },
                            () => updateClientProdutos(client.id, next),
                            'Tipo de serviço atualizado',
                          )
                        }
                      />
                    </td>

                    {/* CLASSIFICAÇÃO — select Ouro/Prata/Bronze → grava a CURVA (A/B/C) */}
                    <td className="px-3 py-3">
                      {(() => {
                        const trigger = classif ? (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ color: classif.color, background: `${classif.color}22` }}
                          >
                            {classif.label}
                          </span>
                        ) : (
                          <span className="text-[#38435C] text-xs">definir</span>
                        )
                        const CURVA_LABEL: Record<string, 'OURO' | 'PRATA' | 'BRONZE'> = { A: 'OURO', B: 'PRATA', C: 'BRONZE' }
                        return (
                          <InlineDropdown canEdit={canEditFields} trigger={trigger} width="w-36">
                            {(close) => (
                              <>
                                {CLASSIF_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      close()
                                      if (client.curva !== opt.value) {
                                        saveField(client.id, { curva: opt.value, classificacao: CURVA_LABEL[opt.value] }, () => updateClientField(client.id, { curva: opt.value }), `Classificação → ${opt.label}`)
                                      }
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#EBEBEB] hover:bg-[#38435C]/40 transition"
                                  >
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                                    <span className="flex-1 text-left">{opt.label}</span>
                                    {client.curva === opt.value && <Check size={12} className="text-[#95BBE2]" />}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    close()
                                    if (client.curva !== null) {
                                      saveField(client.id, { curva: null, classificacao: null }, () => updateClientField(client.id, { curva: null }), 'Classificação removida')
                                    }
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#87919E] hover:bg-[#38435C]/40 transition"
                                >
                                  Limpar
                                </button>
                              </>
                            )}
                          </InlineDropdown>
                        )
                      })()}
                    </td>

                    {/* PERÍODO DO CONTRATO — edita o Contract vigente (ou cadastro) */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <PeriodoEditor
                        periodoInicio={client.periodoInicio}
                        periodoFim={client.periodoFim}
                        fonteContrato={client.fonteContrato}
                        canEdit={isAdmin}
                        onSave={(start, end) =>
                          saveField(
                            client.id,
                            {
                              periodoInicio: start ? new Date(start + 'T00:00:00Z').toISOString() : null,
                              periodoFim: end ? new Date(end + 'T00:00:00Z').toISOString() : null,
                            },
                            () => updateClientContractInline(client.id, { startDate: start || null, endDate: end || null }),
                            'Período do contrato atualizado',
                          )
                        }
                      >
                      {client.periodoFim ? (
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs flex items-center gap-1.5" style={{ color: periodoColor }}>
                            {fmtDate(client.periodoInicio)} → {fmtDate(client.periodoFim)}
                            {client.emRenovacao && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                style={{ color: '#F59E0B', background: '#F59E0B18' }}
                                title="Contrato vigente em renovação no Jurídico"
                              >
                                Em renovação
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] flex items-center gap-1">
                            {periodoNota && (
                              <span style={{ color: periodoColor }} className="font-semibold">{periodoNota}</span>
                            )}
                            {client.fonteContrato === 'cadastro' && (
                              <span
                                className="text-[#87919E]"
                                title="Sem contrato no Jurídico — dado do cadastro. Registre o contrato em /juridico para amarrar a fonte única."
                              >
                                {periodoNota ? '· ' : ''}do cadastro
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="text-[11px] text-[#F59E0B]"
                          title="Nenhum contrato vigente no Jurídico e sem período no cadastro."
                        >
                          Sem contrato registrado
                        </span>
                      )}
                      </PeriodoEditor>
                    </td>

                    {/* MODELO DE NEGÓCIO — select ECOMMERCE/LOCAL/B2B */}
                    <td className="px-3 py-3">
                      <InlineDropdown
                        canEdit={canEditFields}
                        width="w-40"
                        trigger={
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ color: typ.color, background: `${typ.color}18` }}
                          >
                            <TypeIcon size={9} />
                            {typ.label}
                          </span>
                        }
                      >
                        {(close) => (
                          <>
                            {BUSINESS_OPTIONS.map(opt => {
                              const cfg = TYPE_CONFIG[opt.value]
                              const Icon = cfg.icon
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    close()
                                    if (client.businessType !== opt.value) {
                                      saveField(client.id, { businessType: opt.value }, () => updateClientField(client.id, { businessType: opt.value }), `Modelo → ${opt.label}`)
                                    }
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#EBEBEB] hover:bg-[#38435C]/40 transition"
                                >
                                  <Icon size={11} style={{ color: cfg.color }} />
                                  <span className="flex-1 text-left">{opt.label}</span>
                                  {client.businessType === opt.value && <Check size={12} className="text-[#95BBE2]" />}
                                </button>
                              )
                            })}
                          </>
                        )}
                      </InlineDropdown>
                    </td>

                    {/* PLATAFORMA */}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {client.plataformas.length === 0 ? (
                          <span className="text-[#38435C] text-xs">—</span>
                        ) : (
                          client.plataformas.map(p => {
                            const cfg = PLATFORM_CONFIG[p] ?? { label: p, color: '#87919E' }
                            return (
                              <span
                                key={p}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                                style={{ color: cfg.color, background: `${cfg.color}1F` }}
                              >
                                {cfg.label}
                              </span>
                            )
                          })
                        )}
                      </div>
                    </td>

                    {/* RESPONSÁVEL — troca o gestor primário (ClientAssignment.isPrimary) */}
                    <td className="px-3 py-3 text-xs text-[#C7CDD6] whitespace-nowrap">
                      {isAdmin && staff.length > 0 ? (
                        <InlineDropdown
                          canEdit
                          width="w-52"
                          trigger={
                            <span className={client.responsavel ? 'text-[#C7CDD6]' : 'text-[#F59E0B]'}>
                              {client.responsavel ?? 'Sem gestor'}
                            </span>
                          }
                        >
                          {(close) => (
                            <div className="max-h-56 overflow-y-auto">
                              {staff.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    close()
                                    if (client.responsavelId !== s.id) {
                                      saveField(client.id, { responsavel: s.name, responsavelId: s.id }, () => updateClientPrimaryManager(client.id, s.id), `Responsável → ${s.name}`)
                                    }
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#EBEBEB] hover:bg-[#38435C]/40 transition"
                                >
                                  <span className="flex-1 text-left">{s.name}</span>
                                  {client.responsavelId === s.id && <Check size={12} className="text-[#95BBE2]" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </InlineDropdown>
                      ) : (
                        client.responsavel ?? <span className="text-[#F59E0B]">Sem gestor</span>
                      )}
                    </td>

                    {/* 4 COLUNAS MISTAS — e-commerce: budget por plataforma + ROAS mín.
                        (campos do Client); LOCAL/B2B: espelho da grade de metas
                        (Goal MONTHLY do mês), via <LocalMetasCells>. */}
                    {isLocalType(client.businessType) ? (
                      <LocalMetasCells client={client} isAdmin={isAdmin} onSave={saveLocalMetas} />
                    ) : (
                      <>
                        <td className="px-3 py-3 text-right text-xs text-[#EBEBEB] whitespace-nowrap">
                          {isAdmin ? (
                            <InlineNumber
                              value={client.investimentoMeta}
                              canEdit
                              onSave={(v) => saveField(client.id, { investimentoMeta: v }, () => updateClientField(client.id, { investimentoMeta: v }), 'Budget Meta atualizado · metas recalculadas')}
                              render={(v) => v ? formatCurrency(v) : <span className="text-[#38435C]">—</span>}
                            />
                          ) : <span className="text-[#38435C]" title="Restrito ao administrador">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-[#EBEBEB] whitespace-nowrap">
                          {isAdmin ? (
                            <InlineNumber
                              value={client.investimentoGoogle}
                              canEdit
                              onSave={(v) => saveField(client.id, { investimentoGoogle: v }, () => updateClientField(client.id, { investimentoGoogle: v }), 'Budget Google atualizado · metas recalculadas')}
                              render={(v) => v ? formatCurrency(v) : <span className="text-[#38435C]">—</span>}
                            />
                          ) : <span className="text-[#38435C]" title="Restrito ao administrador">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-[#EBEBEB] whitespace-nowrap">
                          {isAdmin ? (
                            <InlineNumber
                              value={client.investimentoTiktok}
                              canEdit
                              onSave={(v) => saveField(client.id, { investimentoTiktok: v }, () => updateClientField(client.id, { investimentoTiktok: v }), 'Budget TikTok atualizado · metas recalculadas')}
                              render={(v) => v ? formatCurrency(v) : <span className="text-[#38435C]">—</span>}
                            />
                          ) : <span className="text-[#38435C]" title="Restrito ao administrador">—</span>}
                        </td>
                        {/* ROAS mínimo NÃO é financeiro sensível (é meta operacional) → visível/editável a staff. */}
                        <td className="px-3 py-3 text-right text-xs text-[#C7CDD6] whitespace-nowrap">
                          <InlineNumber
                            value={client.roasMinimo}
                            canEdit={canEditFields}
                            onSave={(v) => saveField(client.id, { roasMinimo: v }, () => updateClientField(client.id, { roasMinimo: v }), 'ROAS mínimo atualizado · metas recalculadas')}
                            render={(v) => v != null
                              ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
                              : <span className="text-[#38435C]">—</span>}
                          />
                        </td>
                      </>
                    )}

                    {/* VALOR DO CONTRATO — edita o Contract vigente (ou cadastro) */}
                    <td className="px-3 py-3 text-right text-xs font-semibold text-[#22C55E] whitespace-nowrap">
                      {isAdmin ? (
                        <InlineNumber
                          value={client.contractValue}
                          canEdit
                          onSave={(v) => saveField(client.id, { contractValue: v }, () => updateClientContractInline(client.id, { feeValue: v }), 'Valor do contrato atualizado')}
                          render={(v) => v ? formatCurrency(v) : <span className="text-[#38435C] font-normal">—</span>}
                        />
                      ) : <span className="text-[#38435C] font-normal" title="Restrito ao administrador">—</span>}
                    </td>

                    {/* SAÚDE */}
                    <td className="px-3 py-3">
                      <a
                        href={`/clients/${client.slug}`}
                        className="inline-flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline"
                        title="Abrir a saúde do cliente no quadro único"
                      >
                        saúde <ArrowRight size={11} />
                      </a>
                    </td>

                    {/* AÇÕES */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {client.phone && (
                          <a
                            href={`https://wa.me/55${client.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </a>
                        )}
                        <a
                          href={`/clients/${client.slug}`}
                          className="p-1.5 rounded-lg text-[#87919E] hover:text-[#EBEBEB] hover:bg-[#38435C]/40 transition-colors"
                          title="Abrir cliente"
                        >
                          <Pencil size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Rodapé: CONTAGEM + SOMAS (valores só para ADMIN) */}
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#38435C] bg-[#0A1E2C]/40 text-xs font-semibold text-[#EBEBEB]">
                <td className="px-4 py-3" />
                <td className="px-3 py-3 text-[#87919E]" colSpan={8}>
                  {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
                  {selected.size > 0 && ` · ${selected.size} selecionado${selected.size !== 1 ? 's' : ''}`}
                  {isFilteredView && ' (filtrado)'}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {isAdmin ? formatCurrency(footInvestMeta ?? 0) : '—'}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {isAdmin ? formatCurrency(footInvestGoogle ?? 0) : '—'}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {isAdmin ? formatCurrency(footInvestTiktok ?? 0) : '—'}
                </td>
                {/* Coluna mista: ROAS mín. (e-com) não soma; budget dos locais soma. */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {isAdmin && footLocalBudget != null && footLocalBudget > 0 ? (
                    <span className="flex flex-col items-end leading-tight">
                      <span>{formatCurrency(footLocalBudget)}</span>
                      <span className="text-[9px] text-[#A78BFA]/80 font-normal">budget locais</span>
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right text-[#22C55E] whitespace-nowrap">
                  {isAdmin ? formatCurrency(footContrato ?? 0) : '—'}
                </td>
                <td className="px-3 py-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
