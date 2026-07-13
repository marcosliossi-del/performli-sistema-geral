import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().min(1),
  type:   z.enum(['NOTA','LIGACAO','EMAIL','REUNIAO','WHATSAPP','STATUS_CHANGE']),
  title:  z.string().min(1),
  body:   z.string().optional(),
})

/** POST /api/comercial/activities */
export async function POST(request: NextRequest) {
  const session = await getSession()
  // RBAC v2: pipeline comercial é SÓ ADMIN (matriz comercial).
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body   = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const activity = await prisma.agencyActivity.create({
    data: {
      type:   parsed.data.type,
      title:  parsed.data.title,
      body:   parsed.data.body ?? null,
      userId: session.userId,
      leadId: parsed.data.leadId,
    },
    include: { user: { select: { name: true, avatarUrl: true } } },
  })

  return NextResponse.json(activity, { status: 201 })
}
