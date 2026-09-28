/**
 * Журналирование запусков синхронизации в sync_runs.
 * Только серверный код.
 */
import 'server-only'
import { query, queryOne } from '../db'
import type { SyncEntity } from '../clients'

export interface SyncStats {
  created?: number
  updated?: number
  skipped?: number
  conflicts?: number
  errors?: number
  total?: number
}

export interface SyncRun {
  id: string
  client_id: string
  entity: SyncEntity
  direction: 'pull' | 'push' | 'dry_run'
  stats: SyncStats
  status: 'running' | 'done' | 'error'
  error: string | null
  started_at: string
  finished_at: string | null
}

export async function startRun(
  clientId: string,
  entity: SyncEntity,
  direction: 'pull' | 'push' | 'dry_run' = 'pull'
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into sync_runs (client_id, entity, direction) values ($1,$2,$3) returning id`,
    [clientId, entity, direction]
  )
  return row!.id
}

export async function finishRun(
  runId: string,
  status: 'done' | 'error',
  stats: SyncStats,
  error?: string
): Promise<void> {
  await query(
    `update sync_runs set status=$2, stats=$3::jsonb, error=$4, finished_at=now() where id=$1`,
    [runId, status, JSON.stringify(stats), error ?? null]
  )
}

export async function listRuns(clientId: string, limit = 30): Promise<SyncRun[]> {
  return query<SyncRun>(
    `select id, client_id, entity, direction, stats, status, error, started_at, finished_at
       from sync_runs where client_id=$1 order by started_at desc limit $2`,
    [clientId, limit]
  )
}
