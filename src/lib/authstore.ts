/**
 * Учётки панели в Postgres (замена getAuthUser из supabase.ts).
 * Только серверный код.
 */
import 'server-only'
import { queryOne } from './db'

export async function getAuthUser(
  username: string
): Promise<{ salt: string; password_hash: string; role: 'admin' | 'operator' } | null> {
  return queryOne(
    `select salt, password_hash, role from moi_sklad_auth where username = $1 limit 1`,
    [username]
  )
}
