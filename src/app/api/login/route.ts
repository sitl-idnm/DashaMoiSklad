import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase'
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_TTL_SEC } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!process.env.AUTH_SESSION_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'AUTH_SESSION_SECRET не задан в окружении' },
      { status: 500 }
    )
  }

  let body: { username?: string; password?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'Введите логин и пароль' }, { status: 400 })
  }

  try {
    const user = await getAuthUser(username)
    const hash = user ? await hashPassword(user.salt, password) : ''
    // Сравниваем всегда (не выходим раньше), чтобы не палить существование логина.
    const ok = Boolean(user) && hash === user!.password_hash
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Неверный логин или пароль' }, { status: 401 })
    }

    const token = await createSessionToken()
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, token!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SEC
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
