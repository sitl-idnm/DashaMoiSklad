/**
 * Файловое хранилище на локальной ФС VDS (замена Supabase Storage).
 * Файлы лежат под FILES_DIR; скачивание — через session-gated роут
 * /api/files/download. Только серверный код.
 */
import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'

function root(): string {
  return process.env.FILES_DIR || path.join(process.cwd(), 'data', 'files')
}

/** Защита от выхода за пределы FILES_DIR (path traversal). */
function resolveSafe(relPath: string): string {
  const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = path.resolve(root(), clean)
  const base = path.resolve(root())
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error('Недопустимый путь файла')
  }
  return abs
}

export function storageConfigured(): boolean {
  return true // локальная ФС всегда доступна
}

/** Записать файл (создаёт директории). relPath, напр. "sheets/x.xlsx". */
export async function saveFile(relPath: string, data: Buffer): Promise<void> {
  const abs = resolveSafe(relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, data)
}

/** Прочитать файл. null — если нет. */
export async function readFile(relPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveSafe(relPath))
  } catch {
    return null
  }
}

export async function fileExists(relPath: string): Promise<boolean> {
  try {
    await fs.access(resolveSafe(relPath))
    return true
  } catch {
    return false
  }
}

/** Относительный URL скачивания (за session-аутентификацией middleware). */
export function fileDownloadUrl(relPath: string): string {
  return `/api/files/download?path=${encodeURIComponent(relPath)}`
}
