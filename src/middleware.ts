import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Пути, доступные без сессии.
const PUBLIC = new Set(['/login', '/api/login', '/api/logout'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.has(pathname)) return NextResponse.next()

  // Cron бьёт GET /api/generate с Authorization: Bearer $CRON_SECRET — пропускаем его,
  // авторизация запроса проверяется уже внутри самого роута.
  if (pathname === '/api/generate' && req.method === 'GET') {
    const secret = process.env.CRON_SECRET
    const header = req.headers.get('authorization')
    if (secret && header === `Bearer ${secret}`) return NextResponse.next()
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  // Всё, кроме статики Next и файлов с расширением.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']
}
