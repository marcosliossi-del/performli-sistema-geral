'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createClient, type ClientFormState } from '@/app/actions/clients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, UserPlus } from 'lucide-react'

const PIPELINE_STAGES = [
  { value: 'LEAD',       label: 'Lead'       },
  { value: 'PROPOSTA',   label: 'Proposta'   },
  { value: 'NEGOCIACAO', label: 'Negociação' },
  { value: 'ATIVO',      label: 'Ativo'      },
  { value: 'CHURNED',    label: 'Churned'    },
]

const initialState: ClientFormState = {}

const industries = [
  'E-commerce',
  'Moda',
  'Cosméticos',
  'Alimentação',
  'Saúde e Bem-estar',
  'Educação',
  'SaaS / Tecnologia',
  'Imóveis',
  'Serviços',
  'Outros',
]

export default function NewClientPage() {
  const [state, formAction, pending] = useActionState(createClient, initialState)

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/clients"
          className="flex items-center gap-1 text-[#87919E] hover:text-[#EBEBEB] text-sm transition-colors"
        >
          <ArrowLeft size={15} />
          Clientes
        </Link>
        <div className="w-px h-4 bg-[#38435C]" />
        <h1 className="text-xl font-bold text-[#EBEBEB]">Novo Cliente</h1>
      </div>

      {/* Form card */}
      <div className="bg-[#38435C]/20 border border-[#38435C] rounded-2xl overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#38435C] bg-[#0A1E2C]">
          <div className="w-8 h-8 rounded-lg bg-[#95BBE2]/15 flex items-center justify-center">
            <UserPlus size={15} className="text-[#95BBE2]" />
          </div>
          <p className="text-sm font-semibold text-[#EBEBEB]">Dados do cliente</p>
        </div>

        <form action={formAction} className="px-6 py-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">
              Nome *
            </label>
            <Input name="name" placeholder="Ex: Loja Alpha" required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
              Segmento
            </label>
            <select
              name="industry"
              className="w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
            >
              <option value="">Selecionar segmento</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
              Website
            </label>
            <Input name="website" type="url" placeholder="https://seusite.com.br" />
          </div>

          {/* CRM divider */}
          <div className="border-t border-[#38435C] pt-4">
            <p className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider mb-4">CRM & Pipeline</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
              Etapa no Pipeline
            </label>
            <select
              name="pipelineStage"
              defaultValue="ATIVO"
              className="w-full h-10 px-3 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                E-mail
              </label>
              <Input name="email" type="email" placeholder="contato@cliente.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                Telefone
              </label>
              <Input name="phone" placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                CNPJ / CPF
              </label>
              <Input name="document" placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
                Valor do Contrato (R$)
              </label>
              <Input name="contractValue" type="number" step="0.01" min="0" placeholder="5000.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
              Início do Contrato
            </label>
            <Input name="contractStart" type="date" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">
              Observações internas
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Informações importantes sobre o cliente, histórico, etc."
              className="w-full px-3 py-2 rounded-lg bg-[#0A1E2C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
            />
          </div>

          {state?.error && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
              <p className="text-[#EF4444] text-xs">{state.error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link href="/clients" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? 'Criando...' : 'Criar Cliente'}
            </Button>
          </div>
        </form>
      </div>

      <p className="text-xs text-[#87919E]">
        Após criar o cliente, você poderá vincular contas de plataforma (Meta Ads, Google Ads, GA4)
        e cadastrar as metas semanais.
      </p>
    </div>
  )
}
