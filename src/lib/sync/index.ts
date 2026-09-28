/**
 * Диспетчер синхронизации: entity → нужный scope токена → pull-функция,
 * с журналированием в sync_runs. Только серверный код.
 */
import 'server-only'
import type { SyncEntity } from '../clients'
import { getDecryptedToken } from '../clients'
import type { WbScope } from '../wb/client'
import { startRun, finishRun, type SyncStats } from './run'
import { pullProducts, pullOrders, pullPrices, pullStock } from './entities'

const SCOPE_BY_ENTITY: Record<SyncEntity, WbScope> = {
  products: 'content',
  orders: 'marketplace',
  prices: 'prices',
  stock: 'statistics'
}

type PullFn = (clientId: string, token: string) => Promise<SyncStats>
const PULL_BY_ENTITY: Record<SyncEntity, PullFn> = {
  products: pullProducts,
  orders: pullOrders,
  prices: pullPrices,
  stock: pullStock
}

export interface RunResult {
  runId: string
  entity: SyncEntity
  status: 'done' | 'error'
  stats: SyncStats
  error?: string
}

/** Запустить pull одной сущности с журналом. Бросает только на отсутствии токена. */
export async function runPull(clientId: string, entity: SyncEntity): Promise<RunResult> {
  const scope = SCOPE_BY_ENTITY[entity]
  const token = await getDecryptedToken(clientId, scope)
  if (!token) {
    throw new Error(`Нет WB-токена scope «${scope}» для сущности «${entity}»`)
  }

  const runId = await startRun(clientId, entity, 'pull')
  try {
    const stats = await PULL_BY_ENTITY[entity](clientId, token)
    await finishRun(runId, 'done', stats)
    return { runId, entity, status: 'done', stats }
  } catch (e: any) {
    const msg = String(e?.message || e)
    await finishRun(runId, 'error', {}, msg)
    return { runId, entity, status: 'error', stats: {}, error: msg }
  }
}

/** Запустить pull всех сущностей по очереди (продолжает при ошибке одной). */
export async function runPullAll(clientId: string): Promise<RunResult[]> {
  const entities: SyncEntity[] = ['products', 'prices', 'stock', 'orders']
  const results: RunResult[] = []
  for (const entity of entities) {
    try {
      results.push(await runPull(clientId, entity))
    } catch (e: any) {
      results.push({
        runId: '',
        entity,
        status: 'error',
        stats: {},
        error: String(e?.message || e)
      })
    }
  }
  return results
}
