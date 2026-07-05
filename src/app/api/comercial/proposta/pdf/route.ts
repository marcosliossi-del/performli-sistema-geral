import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { getSession } from '@/lib/session'
import { normalizeRole, can } from '@/lib/rbac'
import { buildTokens, fillTemplate, normalizeVals } from '@/lib/comercial/proposta'

// Geração de PDF exige o runtime Node (Chromium headless), não Edge.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/comercial/proposta/pdf
 *
 * ADMIN/Comercial. Recebe { loja, vals } e devolve o PDF da proposta gerado
 * pelo Chrome headless a partir do template tokenizado — com fundo/gradientes
 * (printBackground) e margem 0. É o caminho fiel (a impressão do navegador
 * descarta o fundo e duplica páginas por margem). Não vaza err cru.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!can(normalizeRole(session.role), 'view', 'comercial')) {
    return NextResponse.json({ error: 'Acesso restrito ao comercial' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const loja = String(body?.loja ?? '').trim()
  if (!loja) return NextResponse.json({ error: 'Informe o nome da loja.' }, { status: 400 })
  const vals = normalizeVals(body?.vals)

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    // Template lido do bundle (outputFileTracingIncludes garante o arquivo na função).
    const tplPath = path.join(process.cwd(), 'public', 'comercial', 'proposta-template.html')
    const template = await readFile(tplPath, 'utf8')
    const html = fillTemplate(template, buildTokens(loja, vals))

    // PDF não usa WebGL/canvas — desliga o swiftshader (menos memória, mais rápido).
    chromium.setGraphicsMode = false

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    // Nome do arquivo: ASCII no filename + UTF-8 no filename* (acentos preservados).
    const ascii = `Proposta ARKZA - ${loja}`.normalize('NFD').replace(/[^\x20-\x7E]/g, '').trim() || 'Proposta ARKZA'
    const utf8 = encodeURIComponent(`Proposta ARKZA - ${loja}.pdf`)
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${utf8}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[proposta/pdf] falha:', err)
    // Diagnóstico temporário (rota ADMIN-only): expõe a causa real p/ ajustar o
    // runtime do Chromium na Vercel. Remover após validar a geração.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return NextResponse.json(
      { error: `Não foi possível gerar o PDF. [${detail.slice(0, 500)}]` },
      { status: 500 },
    )
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
