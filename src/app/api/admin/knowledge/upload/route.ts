export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

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

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]
  const tagsRaw = formData.get('tags') as string ?? 'ALL'
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
      const data = new Uint8Array(arrayBuffer)

      // pdf-parse v2 API: new PDFParse({ data }) then .getText()
      const parser = new PDFParse({ data })
      const parsed = await parser.getText()
      const text: string = parsed.text ?? ''

      if (!text.trim()) {
        results.push({ filename: file.name, success: false, error: 'PDF sem texto extraível (pode ser um scan)' })
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
      results.push({ filename: file.name, success: false, error: 'Erro ao processar o arquivo' })
    }
  }

  return NextResponse.json({ results })
}
