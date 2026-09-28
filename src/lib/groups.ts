/**
 * Группы клиентов — объединение нескольких кабинетов в один лист/отгрузку
 * (отгрузка идёт с одного склада). Только серверный код.
 */
import 'server-only'
import { query, tx } from './db'

export interface GroupMember {
  id: string
  name: string
}
export interface ClientGroup {
  id: string
  name: string
  members: GroupMember[]
  created_at: string
}

export async function listGroups(): Promise<ClientGroup[]> {
  return query<ClientGroup>(
    `select g.id, g.name, g.created_at,
            coalesce(
              json_agg(json_build_object('id', c.id, 'name', c.name)
                       order by c.name) filter (where c.id is not null),
              '[]'
            ) as members
       from client_groups g
       left join client_group_members m on m.group_id = g.id
       left join clients c on c.id = m.client_id and c.archived = false
      group by g.id
      order by g.created_at desc`
  )
}

export async function createGroup(name: string): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `insert into client_groups (name) values ($1) returning id`,
    [name]
  )
  return rows[0]
}

export async function deleteGroup(id: string): Promise<void> {
  await query(`delete from client_groups where id = $1`, [id])
}

/** Полностью заменить состав группы. */
export async function setGroupMembers(groupId: string, clientIds: string[]): Promise<void> {
  await tx(async (c) => {
    await c.query(`delete from client_group_members where group_id = $1`, [groupId])
    for (const clientId of clientIds) {
      await c.query(
        `insert into client_group_members (group_id, client_id) values ($1,$2)
         on conflict do nothing`,
        [groupId, clientId]
      )
    }
  })
}

/** client_id участников группы. */
export async function groupClientIds(groupId: string): Promise<string[]> {
  const rows = await query<{ client_id: string }>(
    `select client_id from client_group_members where group_id = $1`,
    [groupId]
  )
  return rows.map((r) => r.client_id)
}
