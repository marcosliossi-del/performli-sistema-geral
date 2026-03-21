import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'performli_session'

const PUBLIC_ROUTES = ['/login']
const PROTECTED_PREFIX = ['/dashboard', '/clients', '/tasks', '/operations', '/reports', '/anti-churn', '/ai-agents', '/alerts', '/team']

function getSecretKey() {
  const secret = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'performli-dev-secret-change-in-production'
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_ROUTES.includes(pathname)
  const isProtected = PROTECTED_PREFIX.some((p) => pathname.startsWith(p))

  const token = request.cookies.get(SESSION_COOKIE)?.value

  // Try to verify session
  let isAuthenticated = false
  if (token) {
    try {
      await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
      isAuthenticated = true
    } catch {
      isAuthenticated = false
    }
  }

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login page
  if (isPublic && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
}
