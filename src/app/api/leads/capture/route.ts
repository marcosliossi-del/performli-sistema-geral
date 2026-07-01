import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { phoneMatchVariants } from '@/lib/phone'
import { z } from 'zod'

const schema = z.object({
  name:        z.string().min(1),
  email:       z.string().email().optional().or(z.literal('')),
  phone:       z.string().optional(),
  company:     z.string().optional(),
  // UTMs — accept both camelCase and snake_case
  utmSource:   z.string().optional(),
  utm_source:  z.string().optional(),
  utmMedium:   z.string().optional(),
  utm_medium:  z.string().optional(),
  utmCampaign: z.string().optional(),
  utm_campaign:z.string().optional(),
  utmContent:  z.string().optional(),
  utm_content: z.string().optional(),
  utmTerm:     z.string().optional(),
  utm_term:    z.string().optional(),
  // optional extras
  notes:       z.string().optional(),
})

/**
 * POST /api/leads/capture
 * Public endpoint — no auth required.
 * Called from landing page forms to create CRM leads with UTM tracking.
 */
export async function POST(req: NextRequest) {
  // Allow cross-origin from any landing page
  const origin = req.headers.get('origin') ?? '*'

  try {
    const body   = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: cors(origin) },
      )
    }

    const d = parsed.data

    // Normalise — accept both snake_case and camelCase
    const utmSource   = d.utmSource   || d.utm_source   || null
    const utmMedium   = d.utmMedium   || d.utm_medium   || null
    const utmCampaign = d.utmCampaign || d.utm_campaign || null
    const utmContent  = d.utmContent  || d.utm_content  || null
    const utmTerm     = d.utmTerm     || d.utm_term     || null

    const source = utmSource ?? utmMedium ?? 'Formulário'

    // Deduplicate by phone — update UTMs if lead already exists.
    // Comparação por igualdade NORMALIZADA (não `contains` de 9 dígitos, que
    // mistura pessoas diferentes com final de número igual). Ver phoneMatchVariants.
    const phone = d.phone?.replace(/\D/g, '') || null
    if (phone && phone.length >= 10) {
      const existing = await prisma.agencyLead.findFirst({
        where: { phone: { in: phoneMatchVariants(phone) }, deletedAt: null },
        select: { id: true },
      })
      if (existing) {
        await prisma.agencyLead.update({
          where: { id: existing.id },
          data: {
            utmSource:   utmSource   ?? undefined,
            utmMedium:   utmMedium   ?? undefined,
            utmCampaign: utmCampaign ?? undefined,
            utmContent:  utmContent  ?? undefined,
            utmTerm:     utmTerm     ?? undefined,
          },
        })
        return NextResponse.json(
          { ok: true, leadId: existing.id, duplicate: true },
          { status: 200, headers: cors(origin) },
        )
      }
    }

    const lead = await prisma.agencyLead.create({
      data: {
        name:        d.name,
        email:       d.email || null,
        phone:       phone ? `+${phone}` : null,
        company:     d.company || null,
        source,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        notes:       d.notes || null,
        status:      'NOVO',
      },
    })

    return NextResponse.json(
      { ok: true, leadId: lead.id },
      { status: 201, headers: cors(origin) },
    )
  } catch (err) {
    console.error('[leads/capture]', err)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: cors(origin) },
    )
  }
}

// Preflight for cross-origin requests from landing pages
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*'
  return new Response(null, { status: 204, headers: cors(origin) })
}

function cors(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
