'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ExpenseModal, ExpenseRow } from './ExpenseModal'

export function ExpenseLaunchButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function handleSaved(_e: ExpenseRow) {
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors"
      >
        <Plus size={14} />
        Lançar despesa
      </button>

      {open && (
        <ExpenseModal
          onClose={() => setOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
