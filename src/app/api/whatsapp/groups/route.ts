import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listGroups } from '@/lib/whatsapp'

/**
 * GET /api/whatsapp/groups
 * Admin only — lista grupos da instância Z-API para descobrir o WHATSAPP_GROUP_ID.
 */
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groups = await listGroups()

  if (groups.length === 0) {
    return NextResponse.json({
      message: 'Nenhum grupo encontrado. Verifique se ZAPI_INSTANCE_ID e ZAPI_TOKEN estão configurados e se o WhatsApp está conectado.',
      groups: [],
    })
  }

  return NextResponse.json({ groups })
}
