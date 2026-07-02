'use client'

import { Fragment, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { avatarColor, initials } from './tokens'

export type CommentVM = {
  id: string
  author: { id: string; name: string }
  body: string
  createdAt: Date | string
}

/**
 * Thread de comentários. O corpo é SEMPRE texto puro (nunca HTML) renderizado
 * com whitespace-pre-wrap — proteção contra XSS. Menções @nome são realçadas
 * em text-info por um parser de texto, sem interpretar markup.
 */
function renderBody(body: string) {
  const parts = body.split(/(@[\p{L}\p{N}._-]+)/u)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-medium text-info">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function CommentThread({
  comments,
  onSubmit,
  currentUser,
  onError,
  className,
}: {
  comments: CommentVM[]
  onSubmit?: (body: string) => Promise<void>
  currentUser?: { id: string; name: string }
  onError?: (message: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    const body = draft.trim()
    if (!body || !onSubmit) return
    setPending(true)
    try {
      await onSubmit(body)
      setDraft('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar o comentário.'
      if (onError) onError(msg)
      else toast(msg, 'err')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="space-y-3">
        {comments.length === 0 && (
          <li className="text-[12px] text-text-low">Nenhum comentário ainda.</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[var(--ak-s0)]"
              style={{ backgroundColor: avatarColor(c.author.id) }}
              aria-hidden
            >
              {initials(c.author.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-medium text-text-hi">{c.author.name}</span>
                <span className="text-[11px] text-text-low">
                  {timeAgo(typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[13px] text-text-mid">
                {renderBody(c.body)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {onSubmit && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex items-end gap-2"
        >
          {currentUser && (
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[var(--ak-s0)]"
              style={{ backgroundColor: avatarColor(currentUser.id) }}
              aria-hidden
            >
              {initials(currentUser.name)}
            </span>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder="Escreva um comentário… (@ para mencionar)"
            disabled={pending}
            className="min-h-[38px] flex-1 resize-y rounded-lg border border-[var(--ak-hair)] bg-surface px-2.5 py-1.5 text-[13px] text-text-hi outline-none placeholder:text-text-low focus:border-[var(--ak-brand)]"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Enviar comentário"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[var(--ak-s0)] disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
          </button>
        </form>
      )}
    </div>
  )
}
