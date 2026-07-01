import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForToken, NuvemshopClient } from '@/services/nuvemshop/client'

/**
 * GET /api/nuvemshop/callback?code=xxx&state=xxx
 *
 * Callback do OAuth da Nuvemshop.
 * Troca o código pelo access_token, cria PlatformAccount e NuvemshopStore,
 * e registra webhooks para receber atualizações em tempo real.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')

  if (!code || !stateParam) {
    return NextResponse.json(
      { error: 'Parâmetros code e state são obrigatórios' },
      { status: 400 }
    )
  }

  let state: { clientId: string; userId: string }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.json({ error: 'State inválido' }, { status: 400 })
  }

  try {
    // 1. Troca código por token
    const tokenData = await exchangeCodeForToken(code)
    const storeId = String(tokenData.user_id)

    // 2. Busca informações da loja
    const client = new NuvemshopClient(storeId, tokenData.access_token)
    const storeInfo = await client.getStoreInfo()

    const storeName = typeof storeInfo.name === 'object'
      ? storeInfo.name.pt || storeInfo.name.es || storeInfo.name.en || storeId
      : String(storeInfo.name || storeId)

    // 3. Cria ou reativa PlatformAccount
    const existing = await prisma.platformAccount.findUnique({
      where: {
        clientId_platform_externalId: {
          clientId: state.clientId,
          platform: 'NUVEMSHOP',
          externalId: storeId,
        },
      },
      include: { nuvemshopStore: true },
    })

    let platformAccountId: string

    if (existing) {
      // Reativa se estava desativada
      await prisma.platformAccount.update({
        where: { id: existing.id },
        data: {
          active: true,
          accessToken: tokenData.access_token,
          name: storeName,
        },
      })

      // Atualiza ou cria NuvemshopStore
      if (existing.nuvemshopStore) {
        await prisma.nuvemshopStore.update({
          where: { id: existing.nuvemshopStore.id },
          data: {
            accessToken: tokenData.access_token,
            storeName,
            storeUrl: storeInfo.url_with_protocol,
            scopes: tokenData.scope,
          },
        })
      } else {
        await prisma.nuvemshopStore.create({
          data: {
            platformAccountId: existing.id,
            storeId,
            accessToken: tokenData.access_token,
            storeName,
            storeUrl: storeInfo.url_with_protocol,
            scopes: tokenData.scope,
          },
        })
      }

      platformAccountId = existing.id
    } else {
      // Cria PlatformAccount + NuvemshopStore
      const account = await prisma.platformAccount.create({
        data: {
          clientId: state.clientId,
          platform: 'NUVEMSHOP',
          externalId: storeId,
          name: storeName,
          accessToken: tokenData.access_token,
          nuvemshopStore: {
            create: {
              storeId,
              accessToken: tokenData.access_token,
              storeName,
              storeUrl: storeInfo.url_with_protocol,
              scopes: tokenData.scope,
            },
          },
        },
      })
      platformAccountId = account.id
    }

    // 4. Registra webhooks para receber atualizações em tempo real
    const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (webhookBaseUrl) {
      const webhookUrl = `${webhookBaseUrl}/api/nuvemshop/webhooks`
      const events = ['order/created', 'order/updated', 'order/paid', 'order/cancelled']

      // Lista webhooks existentes para evitar duplicatas
      const existingWebhooks = await client.listWebhooks()
      const existingUrls = new Set(existingWebhooks.map(w => `${w.event}:${w.url}`))

      for (const event of events) {
        if (!existingUrls.has(`${event}:${webhookUrl}`)) {
          try {
            await client.createWebhook(event, webhookUrl)
          } catch {
            // Webhook registration failure is non-critical
            console.warn(`Falha ao registrar webhook ${event} para loja ${storeId}`)
          }
        }
      }
    }

    // 5. Redireciona de volta para a página do cliente
    const clientData = await prisma.client.findUnique({
      where: { id: state.clientId },
      select: { slug: true },
    })

    const redirectUrl = clientData
      ? `${process.env.NEXT_PUBLIC_APP_URL}/clients/${clientData.slug}?nuvemshop=connected&accountId=${platformAccountId}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?nuvemshop=connected`

    return NextResponse.redirect(redirectUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Nuvemshop OAuth callback error:', msg)

    // Não expõe o erro interno na URL de redirect; mensagem genérica ao usuário.
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?nuvemshop=error`
    return NextResponse.redirect(redirectUrl)
  }
}
