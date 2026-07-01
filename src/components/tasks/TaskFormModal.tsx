'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTask } from '@/app/actions/tasks'
import { useModalA11y } from '@/lib/useModalA11y'

interface Props {
  clients: { id: string; name: string }[]
}

export function TaskFormModal({ clients }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} />
        Nova Tarefa
      </Button>

      {open && <TaskFormDialog clients={clients} onClose={() => setOpen(false)} />}
    </>
  )
}

function TaskFormDialog({ clients, onClose }: { clients: Props['clients']; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await createTask(data)
        formRef.current?.reset()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar')
      }
    })
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
        aria-label="Nova Tarefa"
        className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl w-full max-w-md shadow-2xl"
      >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#38435C]">
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Nova Tarefa</h2>
              <button onClick={onClose} className="text-[#87919E] hover:text-[#EBEBEB] transition-colors">
                <X size={16} />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#95BBE2] uppercase tracking-wider">Título *</label>
                <Input name="title" placeholder="Descreva a tarefa..." required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Descrição</label>
                <textarea
                  name="description"
                  placeholder="Detalhes opcionais..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] placeholder-[#87919E] focus:outline-none focus:border-[#95BBE2] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Prioridade</label>
                  <select
                    name="priority"
                    defaultValue="MEDIA"
                    className="w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Prazo</label>
                  <input
                    type="date"
                    name="dueDate"
                    className="w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#87919E] uppercase tracking-wider">Cliente (opcional)</label>
                <select
                  name="clientId"
                  className="w-full h-10 px-3 rounded-lg bg-[#05141C] border border-[#38435C] text-sm text-[#EBEBEB] focus:outline-none focus:border-[#95BBE2] transition-colors"
                >
                  <option value="">Nenhum</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {isPending ? 'Salvando...' : 'Criar Tarefa'}
                </Button>
              </div>
            </form>
      </div>
    </div>
  )
}
