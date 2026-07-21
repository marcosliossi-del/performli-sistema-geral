'use client'

import { useState } from 'react'
import { updateClient, updateClientProdutos, deleteClient } from '@/app/actions/updateClient'
import { X, Trash2, AlertTriangle, ShoppingCart, MapPin, Building2, Plus } from 'lucide-react'
import { BusinessType } from '@prisma/client'
import { useModalA11y } from '@/lib/useModalA11y'
import { investimentoTotal } from '@/lib/metas/projection'

interface ClientData {
  id: string
  name: string
  razaoSocial: string | null
  industry: string | null
  website: string | null
  notes: string | null
  email: string | null
  phone: string | null
  document: string | null
  contractValue: number | null
  contractStart: Date | null
  source: string | null
  businessType: BusinessType
  investimentoMeta: number | null
  investimentoGoogle: number | null
  investimentoTiktok: number | null
  roasMinimo: number | null
  produtos: string[]
}

interface Props {
  client: ClientData
  onClose: () => void
}

// Tipos de serviço canônicos da Arkza (regra Marcos 2026-07-21). O campo segue
// livre (não quebra valores existentes) — estas são sugestões de 1 clique.
const PRODUTOS_SUGERIDOS = ['Tráfego Pago', 'CRM', 'Traqueamento']

const industries = [
  'E-commerce', 'Moda', 'Cosméticos', 'Alimentação',
  'Saúde e Bem-estar', 'Educação', 'SaaS / Tecnologia',
  'Imóveis', 'Serviços', 'Outros',
]

export function EditClientModal({ client, onClose }: Props) {
  const [form, setForm] = useState({
    name: client.name,
    razaoSocial: client.razaoSocial ?? '',
    industry: client.industry ?? '',
    website: client.website ?? '',
    notes: client.notes ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    document: client.document ?? '',
    source: client.source ?? '',
    contractValue: client.contractValue?.toString() ?? '',
    contractStart: client.contractStart
      ? new Date(client.contractStart).toISOString().split('T')[0]
      : '',
    businessType: client.businessType as BusinessType,
    investimentoMeta: client.investimentoMeta?.toString() ?? '',
    investimentoGoogle: client.investimentoGoogle?.toString() ?? '',
    investimentoTiktok: client.investimentoTiktok?.toString() ?? '',
    roasMinimo: client.roasMinimo?.toString() ?? '',
  })
  const [produtos, setProdutos] = useState<string[]>(client.produtos)
  const [novoProduto, setNovoProduto] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function addProduto(raw: string) {
    const p = raw.trim().slice(0, 60)
    if (!p) return
    if (produtos.some((x) => x.toLowerCase() === p.toLowerCase())) return
    if (produtos.length >= 20) return
    setProdutos((list) => [...list, p])
    setNovoProduto('')
  }

  function removeProduto(p: string) {
    setProdutos((list) => list.filter((x) => x !== p))
  }

  // Produtos que existiam e foram tirados nesta edição — dispara o aviso inline.
  const produtosRemovidos = client.produtos.filter((p) => !produtos.includes(p))

  // Investimento total é DERIVADO (soma dos 3 canais) — recalculado ao vivo com
  // o mesmo helper puro usado no backend, para não haver duas contas divergentes.
  const parse = (v: string): number | null => (v ? parseFloat(v) : null)
  const totalInvestimento = investimentoTotal(
    parse(form.investimentoMeta),
    parse(form.investimentoGoogle),
    parse(form.investimentoTiktok),
  )
  const brl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Faturamento-alvo DERIVADO ao vivo: total × ROAS mínimo (regra Marcos). Espelha
  // computeMetasFromBudget do backend só para preview; a fonte é o servidor.
  const roasMin = parse(form.roasMinimo)
  const faturamentoAlvo =
    roasMin != null && roasMin > 0 && totalInvestimento > 0 ? totalInvestimento * roasMin : null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await updateClient(client.id, {
        name: form.name,
        razaoSocial: form.razaoSocial || null,
        industry: form.industry || null,
        website: form.website || null,
        source: form.source || null,
        notes: form.notes || null,
        email: form.email || null,
        phone: form.phone || null,
        document: form.document || null,
        contractValue: form.contractValue ? parseFloat(form.contractValue) : null,
        contractStart: form.contractStart ? new Date(form.contractStart) : null,
        businessType: form.businessType,
        investimentoMeta: form.investimentoMeta ? parseFloat(form.investimentoMeta) : null,
        investimentoGoogle: form.investimentoGoogle ? parseFloat(form.investimentoGoogle) : null,
        investimentoTiktok: form.investimentoTiktok ? parseFloat(form.investimentoTiktok) : null,
        roasMinimo: form.roasMinimo ? parseFloat(form.roasMinimo) : null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      // Produtos vivem numa action própria (versiona histórico + gatilho de
      // downgrade). Só chama se a lista mudou.
      const produtosMudaram =
        produtos.length !== client.produtos.length ||
        produtos.some((p) => !client.produtos.includes(p))
      if (produtosMudaram) {
        const rp = await updateClientProdutos(client.id, produtos)
        if (rp.error) {
          setError(rp.error)
          return
        }
      }
      onClose()
      window.location.href = `/clients/${result.slug}`
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await deleteClient(client.id)
    // redirect happens server-side
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar Cliente"
        className="lg-glass-strong bg-[#0A1E2C] border border-[#38435C] rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#38435C] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#EBEBEB]">Editar Cliente</h2>
          <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Nome (fantasia / loja) *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Razão social (exatamente como está no Asaas)</label>
              <input
                value={form.razaoSocial}
                onChange={(e) => set('razaoSocial', e.target.value)}
                placeholder="Ex.: Thais — LALLUZI: preencha a razão social do Asaas"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
              <p className="text-[10px] text-[#647488]">Usada para conciliar faturas do Asaas automaticamente com este cliente.</p>
            </div>

            {/* Tipo de negócio */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Tipo de Negócio</label>
              <div className="flex gap-2">
                {([
                  { value: 'ECOMMERCE', label: 'E-commerce', icon: ShoppingCart, desc: 'ROAS, Faturamento, Conversões' },
                  { value: 'LOCAL',     label: 'Negócio Local', icon: MapPin,     desc: 'Leads, Mensagens, Seguidores' },
                  { value: 'B2B',       label: 'B2B / Atacado', icon: Building2,  desc: 'Leads, Mensagens — mede como negócio local' },
                ] as const).map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, businessType: value }))}
                    className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      form.businessType === value
                        ? 'border-[#95BBE2] bg-[#95BBE2]/10'
                        : 'border-[#38435C] hover:border-[#38435C]/80'
                    }`}
                  >
                    <Icon size={15} className={form.businessType === value ? 'text-[#95BBE2]' : 'text-[#87919E]'} />
                    <div>
                      <p className={`text-xs font-semibold ${form.businessType === value ? 'text-[#95BBE2]' : 'text-[#EBEBEB]'}`}>{label}</p>
                      <p className="text-[10px] text-[#87919E]">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Segmento</label>
              <select
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              >
                <option value="">Selecionar</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Website</label>
              <input
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                type="url"
                placeholder="https://"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Origem</label>
              <input
                value={form.source}
                onChange={(e) => set('source', e.target.value)}
                placeholder="Indicação, Instagram..."
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">E-mail</label>
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                type="email"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">CNPJ / CPF</label>
              <input
                value={form.document}
                onChange={(e) => set('document', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Valor do Contrato (R$)</label>
              <input
                value={form.contractValue}
                onChange={(e) => set('contractValue', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Início do Contrato</label>
              <input
                value={form.contractStart}
                onChange={(e) => set('contractStart', e.target.value)}
                type="date"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            {/* Budget mensal por plataforma (decisão do Marcos no início do mês).
                Total é derivado (soma) e, com o ROAS mínimo, deriva as metas do
                mês: faturamento-alvo = total × ROAS mínimo. */}
            <div className="col-span-2 pt-1">
              <p className="text-xs font-semibold text-[#EBEBEB]">Budget mensal por plataforma</p>
              <p className="text-[10px] text-[#647488]">Quanto o cliente disponibiliza este mês por canal. Editável todo início de mês — ao salvar, recalcula as metas do mês.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Budget Meta Ads (mês)</label>
              <input
                value={form.investimentoMeta}
                onChange={(e) => set('investimentoMeta', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Budget Google Ads (mês)</label>
              <input
                value={form.investimentoGoogle}
                onChange={(e) => set('investimentoGoogle', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Budget TikTok Ads (mês)</label>
              <input
                value={form.investimentoTiktok}
                onChange={(e) => set('investimentoTiktok', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">ROAS mínimo</label>
              <input
                value={form.roasMinimo}
                onChange={(e) => set('roasMinimo', e.target.value)}
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex.: 3.00"
                className="w-full h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
              />
              <p className="text-[10px] text-[#647488]">Retorno mínimo esperado sobre o investimento. Define a meta de faturamento.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#87919E]">Investimento Total (R$)</label>
              <input
                value={brl(totalInvestimento)}
                readOnly
                disabled
                aria-label="Investimento total (soma automática dos canais)"
                className="w-full h-9 px-3 rounded-lg bg-[#0F1F2C] border border-[#38435C] text-sm text-[#95BBE2] font-semibold cursor-not-allowed"
              />
              <p className="text-[10px] text-[#647488]">Soma automática dos três canais. Não é editável.</p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Faturamento-alvo do mês (derivado)</label>
              <input
                value={faturamentoAlvo != null ? brl(faturamentoAlvo) : '—'}
                readOnly
                disabled
                aria-label="Faturamento-alvo derivado (investimento total × ROAS mínimo)"
                className="w-full h-9 px-3 rounded-lg bg-[#0F1F2C] border border-[#38435C] text-sm text-[#22C55E] font-semibold cursor-not-allowed"
              />
              <p className="text-[10px] text-[#647488]">Investimento total × ROAS mínimo. Vira a meta de faturamento do mês (health score).</p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#87919E]">Observações internas</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50 resize-none"
              />
            </div>

            {/* Produtos contratados. Remover um produto é sinal de downgrade →
                dispara alerta de risco de churn e task para a CS. */}
            <div className="col-span-2 space-y-2 pt-1">
              <label className="text-xs text-[#87919E]">Produtos contratados</label>

              <div className="flex flex-wrap gap-2">
                {produtos.length === 0 && (
                  <span className="text-[11px] text-[#647488]">Nenhum produto contratado.</span>
                )}
                {produtos.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#95BBE2]/10 border border-[#95BBE2]/30 text-xs text-[#EBEBEB]"
                  >
                    {p}
                    <button
                      type="button"
                      onClick={() => removeProduto(p)}
                      aria-label={`Remover ${p}`}
                      className="text-[#87919E] hover:text-[#EF4444] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              {/* Sugestões de 1 clique (as ainda não adicionadas) */}
              <div className="flex flex-wrap gap-2">
                {PRODUTOS_SUGERIDOS.filter(
                  (s) => !produtos.some((p) => p.toLowerCase() === s.toLowerCase()),
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addProduto(s)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[#38435C] text-xs text-[#87919E] hover:border-[#95BBE2]/50 hover:text-[#EBEBEB] transition-colors"
                  >
                    <Plus size={11} />
                    {s}
                  </button>
                ))}
              </div>

              {/* Campo livre */}
              <div className="flex gap-2">
                <input
                  value={novoProduto}
                  onChange={(e) => setNovoProduto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addProduto(novoProduto) }
                  }}
                  maxLength={60}
                  placeholder="Adicionar outro produto"
                  className="flex-1 h-9 px-3 rounded-lg bg-[#1B2B3A] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2]/50"
                />
                <button
                  type="button"
                  onClick={() => addProduto(novoProduto)}
                  disabled={!novoProduto.trim() || produtos.length >= 20}
                  className="px-3 h-9 rounded-lg border border-[#38435C] text-xs text-[#87919E] hover:text-[#EBEBEB] hover:border-[#95BBE2]/50 disabled:opacity-40 transition-colors"
                >
                  Adicionar
                </button>
              </div>

              {produtosRemovidos.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2">
                  <AlertTriangle size={13} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-[#EBEBEB]">
                    Remover um produto ({produtosRemovidos.join(', ')}) dispara alerta de risco de churn e task para a CS entender o motivo hoje.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#38435C]">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors"
              >
                <Trash2 size={13} />
                Excluir cliente
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-[#EF4444]" />
                <span className="text-xs text-[#EF4444]">Confirmar exclusão?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs bg-[#EF4444] text-white px-2 py-1 rounded font-semibold disabled:opacity-50"
                >
                  {deleting ? '...' : 'Sim, excluir'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-[#87919E] hover:text-[#EBEBEB]"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-[#87919E] hover:text-[#EBEBEB] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm bg-[#95BBE2] text-[#0A1E2C] font-semibold rounded-lg hover:bg-[#95BBE2]/90 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
