export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { BetaBase64PDFSource, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Text chunking ─────────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length >= 40)

  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= 900) {
      chunks.push(para)
    } else {
      const sentences = para.split(/(?<=[.!?])\s+/)
      let current = ''
      for (const sent of sentences) {
        if (current && (current + ' ' + sent).length > 850) {
          if (current.length >= 40) chunks.push(current.trim())
          current = sent
        } else {
          current = current ? current + ' ' + sent : sent
        }
      }
      if (current.trim().length >= 40) chunks.push(current.trim())
    }
  }

  return chunks
}

// ── PDF text extraction via Claude Haiku ──────────────────────────────────────

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  const base64 = Buffer.from(buffer).toString('base64')

  const pdfSource: BetaBase64PDFSource = {
    type: 'base64',
    media_type: 'application/pdf',
    data: base64,
  }

  const messages: BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'document', source: pdfSource },
        {
          type: 'text',
          text: 'Extraia todo o conteúdo textual deste documento. Separe os parágrafos com linhas em branco. Retorne apenas o texto extraído, sem introduções, comentários ou formatação extra.',
        },
      ],
    },
  ]

  const response = await anthropic.beta.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages,
    betas: ['pdfs-2024-09-25'],
  })

  return response.content[0]?.type === 'text' ? response.content[0].text : ''
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[knowledge-upload] Failed to parse formData:', msg)
      return NextResponse.json(
        { results: [{ filename: 'unknown', success: false, error: `Arquivo muito grande ou corrompido: ${msg}` }] },
        { status: 200 },
      )
    }

    const files = formData.getAll('files') as File[]
    const tagsRaw = (formData.get('tags') as string) ?? 'ALL'
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

    if (!files.length) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const results: {
      filename: string
      success: boolean
      chunkCount?: number
      documentId?: string
      error?: string
    }[] = []

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        results.push({ filename: file.name, success: false, error: 'Apenas arquivos PDF são suportados' })
        continue
      }

      try {
        const arrayBuffer = await file.arrayBuffer()
        const text = await extractTextFromPDF(arrayBuffer)

        if (!text.trim()) {
          results.push({ filename: file.name, success: false, error: 'Nenhum texto extraído do PDF' })
          continue
        }

        const title = file.name
          .replace(/\.pdf$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())

        const chunks = chunkText(text)

        if (chunks.length === 0) {
          results.push({ filename: file.name, success: false, error: 'Nenhum conteúdo extraído' })
          continue
        }

        const doc = await prisma.knowledgeDocument.create({
          data: {
            filename: file.name,
            title,
            uploadedById: session.userId,
            chunkCount: chunks.length,
            tags,
            chunks: {
              create: chunks.map((content, position) => ({ content, position })),
            },
          },
        })

        results.push({ filename: file.name, success: true, chunkCount: chunks.length, documentId: doc.id })
      } catch (err) {
        console.error(`[knowledge-upload] Error processing ${file.name}:`, err)
        const message = err instanceof Error ? err.message : 'Erro ao processar o arquivo'
        results.push({ filename: file.name, success: false, error: message })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[knowledge-upload] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Erro interno do servidor'
    return NextResponse.json(
      { results: [{ filename: 'unknown', success: false, error: message }] },
      { status: 200 },
    )
  }
}
