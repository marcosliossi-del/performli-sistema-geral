import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForToken, NuvemshopClient } from '@/services/nuvemshop/client'

/**
 * GET /api/nuvemshop/install?code=xxx
 *
 * Rota pública de instalação do app Nuvemshop.
 * Chamada diretamente pela Nuvemshop após o lojista autorizar o app.
 *
 * Fluxo:
 *   1. Nuvemshop redireciona para cá com ?code=xxx
 *   2. Troca o código pelo access_token
 *   3. Busca info da loja
 *   4. Cria automaticamente um Client + PlatformAccount + NuvemshopStore
 *   5. Registra webhooks
 *   6. Retorna JSON de sucesso
 *
 * Não requer sessão do Performli — é o ponto de entrada do app.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  // Se não tem code, é o primeiro acesso — redireciona para autorizar
  if (!code) {
    const appId = process.env.NUVEMSHOP_APP_ID
    if (!appId) {
      return NextResponse.json({ error: 'NUVEMSHOP_APP_ID não configurado' }, { status: 500 })
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/nuvemshop/install`
    const authUrl = `https://www.nuvemshop.com.br/apps/${appId}/authorize?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`

    return NextResponse.redirect(authUrl)
  }

  // Tem code — troca pelo token
  try {
    const tokenData = await exchangeCodeForToken(code)
    const storeId = String(tokenData.user_id)

    // Busca informações da loja
    const client = new NuvemshopClient(storeId, tokenData.access_token)
    const storeInfo = await client.getStoreInfo()

    const storeName = typeof storeInfo.name === 'object'
      ? storeInfo.name.pt || storeInfo.name.es || storeInfo.name.en || storeId
      : String(storeInfo.name || storeId)

    // Verifica se já existe uma PlatformAccount para esta loja
    const existingStore = await prisma.nuvemshopStore.findUnique({
      where: { storeId },
      include: { platformAccount: { include: { client: true } } },
    })

    if (existingStore) {
      // Atualiza token e reativa
      await prisma.nuvemshopStore.update({
        where: { id: existingStore.id },
        data: {
          accessToken: tokenData.access_token,
          storeName,
          storeUrl: storeInfo.url_with_protocol,
          scopes: tokenData.scope,
        },
      })

      await prisma.platformAccount.update({
        where: { id: existingStore.platformAccountId },
        data: { active: true, accessToken: tokenData.access_token, name: storeName },
      })

      return NextResponse.json({
        ok: true,
        message: 'Loja reconectada com sucesso',
        store: {
          id: storeId,
          name: storeName,
          url: storeInfo.url_with_protocol,
          clientId: existingStore.platformAccount.clientId,
        },
      })
    }

    // Cria um novo Client para esta loja
    const slug = storeName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || `loja-${storeId}`

    // Garante slug único
    const existingClient = await prisma.client.findUnique({ where: { slug } })
    const finalSlug = existingClient ? `${slug}-${storeId}` : slug

    const newClient = await prisma.client.create({
      data: {
        name: storeName,
        slug: finalSlug,
        website: storeInfo.url_with_protocol,
        email: storeInfo.email || null,
        status: 'ACTIVE',
        pipelineStage: 'ATIVO',
        platformAccounts: {
          create: {
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
        },
      },
      include: { platformAccounts: true },
    })

    // Registra webhooks
    const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (webhookBaseUrl) {
      const webhookUrl = `${webhookBaseUrl}/api/nuvemshop/webhooks`
      const events = ['order/created', 'order/updated', 'order/paid', 'order/cancelled']

      const existingWebhooks = await client.listWebhooks()
      const existingUrls = new Set(existingWebhooks.map(w => `${w.event}:${w.url}`))

      for (const event of events) {
        if (!existingUrls.has(`${event}:${webhookUrl}`)) {
          try {
            await client.createWebhook(event, webhookUrl)
          } catch {
            // Non-critical
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Loja conectada com sucesso!',
      store: {
        id: storeId,
        name: storeName,
        url: storeInfo.url_with_protocol,
        clientId: newClient.id,
        platformAccountId: newClient.platformAccounts[0]?.id,
      },
      webhooks: 'registrados',
      nextStep: 'Use POST /api/sync/nuvemshop para sincronizar os pedidos',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Nuvemshop install error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
