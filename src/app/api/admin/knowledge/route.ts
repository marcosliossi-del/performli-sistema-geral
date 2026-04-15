import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      filename: true,
      title: true,
      chunkCount: true,
      tags: true,
      createdAt: true,
      uploader: { select: { name: true } },
    },
  })

  return NextResponse.json(documents)
}
