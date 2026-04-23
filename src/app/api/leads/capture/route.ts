import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  name:        z.string().min(1),
  email:       z.string().email().optional().or(z.literal('')),
  phone:       z.string().optional(),
  company:     z.string().optional(),
  // UTMs
  utmSource:   z.string().optional(),
  utmMedium:   z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent:  z.string().optional(),
  utmTerm:     z.string().optional(),
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

    // Derive source from UTM if not sent explicitly
    const source = d.utmSource ?? d.utmMedium ?? 'Landing Page'

    const lead = await prisma.agencyLead.create({
      data: {
        name:        d.name,
        email:       d.email || null,
        phone:       d.phone || null,
        company:     d.company || null,
        source,
        utmSource:   d.utmSource   || null,
        utmMedium:   d.utmMedium   || null,
        utmCampaign: d.utmCampaign || null,
        utmContent:  d.utmContent  || null,
        utmTerm:     d.utmTerm     || null,
        notes:       d.notes       || null,
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
