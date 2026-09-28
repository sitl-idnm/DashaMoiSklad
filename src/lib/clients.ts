/**
 * Слой работы с клиентами (кабинетами ВБ) и их доступами — прямой SQL (pg).
 * Секреты шифруются перед записью; наружу отдаём только last4/статусы.
 * Только серверный код.
 */
import 'server-only'
import { query, queryOne } from './db'
import { encryptSecret, decryptSecret, last4 } from './wb/crypto'
import { wbPing, type WbScope } from './wb/client'

export const WB_SCOPES: WbScope[] = ['content', 'marketplace', 'prices', 'statistics']
export type SyncEntity = 'products' | 'orders' | 'stock' | 'prices'

export interface Client {
  id: string
  name: string
  inn: string | null
  moysklad_org_id: string | null
  writes_enabled: Partial<Record<SyncEntity, boolean>>
  archived: boolean
  created_at: string
}

export interface CredentialInfo {
  scope: WbScope
  token_last4: string
  valid: boolean | null
  checked_at: string | null
}

// ─────────────────── Клиенты ───────────────────

export async function listClients(): Promise<Client[]> {
  return query<Client>(
    `select id, name, inn, moysklad_org_id, writes_enabled, archived, created_at
       from clients where archived = false order by created_at desc`
  )
}

export async function getClient(id: string): Promise<Client | null> {
  return queryOne<Client>(
    `select id, name, inn, moysklad_org_id, writes_enabled, archived, created_at
       from clients where id = $1`,
    [id]
  )
}

export async function createClient(input: {
  name: string
  inn?: string | null
  moysklad_org_id?: string | null
}): Promise<Client> {
  const rows = await query<Client>(
    `insert into clients (name, inn, moysklad_org_id)
     values ($1,$2,$3)
     returning id, name, inn, moysklad_org_id, writes_enabled, archived, created_at`,
    [input.name, input.inn ?? null, input.moysklad_org_id ?? null]
  )
  return rows[0]
}

export async function updateClient(
  id: string,
  patch: Partial<Pick<Client, 'name' | 'inn' | 'moysklad_org_id' | 'archived'>>
): Promise<void> {
  const sets: string[] = []
  const params: any[] = []
  for (const [k, v] of Object.entries(patch)) {
    params.push(v)
    sets.push(`${k} = $${params.length}`)
  }
  if (sets.length === 0) return
  params.push(id)
  await query(`update clients set ${sets.join(', ')} where id = $${params.length}`, params)
}

/** Мягкое удаление (архивация). */
export async function archiveClient(id: string): Promise<void> {
  await query(`update clients set archived = true where id = $1`, [id])
}

/** Включить/выключить запись в МойСклад по конкретной сущности. */
export async function setWritesEnabled(
  id: string,
  entity: SyncEntity,
  enabled: boolean
): Promise<void> {
  // Мержим один ключ в jsonb writes_enabled на стороне БД.
  await query(
    `update clients
        set writes_enabled = coalesce(writes_enabled, '{}'::jsonb) || jsonb_build_object($2::text, $3::boolean)
      where id = $1`,
    [id, entity, enabled]
  )
}

// ─────────────────── WB-доступы ───────────────────

export async function listCredentials(clientId: string): Promise<CredentialInfo[]> {
  return query<CredentialInfo>(
    `select scope, token_last4, valid, checked_at
       from wb_credentials where client_id = $1 order by scope`,
    [clientId]
  )
}

/** Сохранить/заменить токен по scope (шифруется). */
export async function setWbCredential(
  clientId: string,
  scope: WbScope,
  token: string
): Promise<void> {
  const trimmed = token.trim()
  const token_encrypted = await encryptSecret(trimmed)
  await query(
    `insert into wb_credentials (client_id, scope, token_encrypted, token_last4, valid, checked_at)
     values ($1,$2,$3,$4,null,null)
     on conflict (client_id, scope) do update set
       token_encrypted = excluded.token_encrypted,
       token_last4     = excluded.token_last4,
       valid           = null,
       checked_at      = null`,
    [clientId, scope, token_encrypted, last4(trimmed)]
  )
}

export async function deleteWbCredential(clientId: string, scope: WbScope): Promise<void> {
  await query(`delete from wb_credentials where client_id = $1 and scope = $2`, [clientId, scope])
}

/**
 * Один ключ ВБ на все категории. Современный токен ВБ (JWT) уже содержит набор
 * разрешённых категорий в claim `s`, поэтому обычно достаточно одного ключа —
 * пишем его во все scope. Какие категории реально покрыты, покажет «Проверить».
 */
export async function setWbCredentialAll(clientId: string, token: string): Promise<void> {
  for (const scope of WB_SCOPES) {
    await setWbCredential(clientId, scope, token)
  }
}

/** Расшифрованный токен для синка. null — если не задан. */
export async function getDecryptedToken(
  clientId: string,
  scope: WbScope
): Promise<string | null> {
  const row = await queryOne<{ token_encrypted: string }>(
    `select token_encrypted from wb_credentials where client_id = $1 and scope = $2`,
    [clientId, scope]
  )
  if (!row) return null
  return decryptSecret(row.token_encrypted)
}

/**
 * Проверить все ключи клиента: по каждому scope дешёвый запрос к ВБ,
 * пишем valid/checked_at. Возвращает актуальный список статусов.
 */
export async function verifyKeys(clientId: string): Promise<CredentialInfo[]> {
  const creds = await query<{ scope: WbScope; token_encrypted: string }>(
    `select scope, token_encrypted from wb_credentials where client_id = $1`,
    [clientId]
  )
  const nowIso = new Date().toISOString()
  for (const c of creds) {
    let valid: boolean | null = null
    try {
      const token = await decryptSecret(c.token_encrypted)
      valid = await wbPing(c.scope, token)
    } catch {
      valid = null
    }
    await query(
      `update wb_credentials set valid = $3, checked_at = $4 where client_id = $1 and scope = $2`,
      [clientId, c.scope, valid, nowIso]
    )
  }
  return listCredentials(clientId)
}
