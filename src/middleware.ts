import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, parseSessionToken } from '@/lib/auth'

// Пути, доступные без сессии.
// /hw-test — автономная проверка сканера/принтера, без БД и секретов.
// /api/print/sheet — печатный лист для агента на локации (защищён секретом внутри).
const PUBLIC = new Set(['/login', '/api/login', '/api/logout', '/hw-test', '/api/print/sheet'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.has(pathname)) return NextResponse.next()

  // Cron бьёт GET /api/generate и /api/orders/ship с Authorization: Bearer $CRON_SECRET —
  // пропускаем, авторизация проверяется уже внутри самих роутов.
  if ((pathname === '/api/generate' || pathname === '/api/orders/ship') && req.method === 'GET') {
    const secret = process.env.CRON_SECRET
    const header = req.headers.get('authorization')
    if (secret && header === `Bearer ${secret}`) return NextResponse.next()
  }

  const session = await parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (session) {
    // Гейт админ-зоны: /admin/* и /api/admin/* — только для роли admin.
    const isAdminArea =
      pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
    if (isAdminArea && session.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      const url = req.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

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
