import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'performli_session'
const PORTAL_COOKIE = 'performli_portal'
// Audiences dos dois namespaces (ver src/lib/session.ts e src/lib/portal/session.ts).
// O middleware verifica o aud correto para cada cookie: um token do portal
// nunca vale como sessão interna e vice-versa, mesmo com SESSION_SECRET igual.
const STAFF_AUDIENCE = 'performli-staff'
const PORTAL_AUDIENCE = 'performli-portal'

const PUBLIC_ROUTES = ['/login']
const PROTECTED_PREFIX = ['/cockpit', '/operacional', '/meu-dia', '/minha-semana', '/validacoes', '/aceite', '/check-ins', '/processos', '/dashboard', '/clients', '/canais', '/tasks', '/t/', '/operations', '/reports', '/anti-churn', '/ai-agents', '/alerts', '/team', '/agency', '/managers', '/pipeline', '/comercial', '/financeiro', '/knowledge', '/settings', '/portal-acessos', '/suporte', '/recorrencias', '/juridico']

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Portal do cliente (namespace de auth SEPARADO do staff) ────────────────
  // Só o portal EXTERNO (`/portal` e `/portal/*`) cai aqui. Rotas internas de
  // staff que só COMEÇAM com "portal" (ex.: `/portal-acessos`) NÃO entram —
  // senão o admin sem cookie de portal é jogado para /portal/login.
  // /portal nunca cai na lógica interna de /login abaixo. Público: /portal/login.
  if (pathname === '/portal' || pathname.startsWith('/portal/')) {
    if (pathname === '/portal/login') return NextResponse.next()

    const portalToken = request.cookies.get(PORTAL_COOKIE)?.value
    if (portalToken) {
      try {
        await jwtVerify(portalToken, getSecretKey(), {
          algorithms: ['HS256'],
          audience: PORTAL_AUDIENCE,
        })
        return NextResponse.next()
      } catch {
        // token inválido → cai no redirect abaixo
      }
    }
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }

  const isPublic = PUBLIC_ROUTES.includes(pathname)
  const isProtected = PROTECTED_PREFIX.some((p) => pathname.startsWith(p))

  const token = request.cookies.get(SESSION_COOKIE)?.value

  let isAuthenticated = false
  if (token) {
    try {
      await jwtVerify(token, getSecretKey(), {
        algorithms: ['HS256'],
        audience: STAFF_AUDIENCE,
      })
      isAuthenticated = true
    } catch {
      isAuthenticated = false
    }
  }

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isPublic && isAuthenticated) {
    // Manda p/ a raiz — a page.tsx decide o pouso por perfil (não buscar
    // banco aqui: middleware roda no edge).
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)', '/'],
}
