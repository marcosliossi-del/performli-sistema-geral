// Toasts globais — pub/sub simples (sem lib, sem provider). Importado só por
// client components; o ToastViewport (renderizado no shell) escuta e mostra.

export type ToastTone = 'ok' | 'err' | 'info'
export type ToastItem = { id: number; msg: string; tone: ToastTone }

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<(t: ToastItem[]) => void>()

function emit() {
  for (const l of listeners) l(items)
}

export function toast(msg: string, tone: ToastTone = 'ok') {
  const t: ToastItem = { id: ++seq, msg, tone }
  items = [...items, t]
  emit()
  setTimeout(() => dismissToast(t.id), 3200)
}

export function dismissToast(id: number) {
  items = items.filter((x) => x.id !== id)
  emit()
}

export function subscribeToasts(cb: (t: ToastItem[]) => void): () => void {
  listeners.add(cb)
  cb(items)
  return () => { listeners.delete(cb) }
}
