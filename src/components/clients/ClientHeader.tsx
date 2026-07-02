'use client'

import { useState } from 'react'
import { EditClientModal } from './EditClientModal'
import { Pencil } from 'lucide-react'
import { BusinessType } from '@prisma/client'

interface Props {
  client: {
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
  }
}

export function EditClientButton({ client }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#87919E] hover:text-[#EBEBEB] bg-[#38435C]/40 hover:bg-[#38435C]/70 border border-[#38435C] px-3 py-1.5 rounded-lg transition-all"
      >
        <Pencil size={12} />
        Editar
      </button>

      {open && (
        <EditClientModal
          client={client}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
