import { uid } from './defaults'
import type { Doc } from './types'

export type FigureMeta = {
  id: string
  title: string
  updatedAt: number
  /** A small SVG of the board, shown in the gallery. Empty until the next save draws one. */
  thumb: string
}

type Row = FigureMeta & { doc: Doc }

const DB_NAME = 'plate-figures'
const STORE = 'figures'
const LS_DOC = 'plate:doc:v1'
const LS_MIGRATED = 'plate:migrated:v1'

let dbp: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb()
  return db.transaction(STORE, mode).objectStore(STORE)
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

/** Saves a figure under a new id and returns that id. */
export async function putFigure(doc: Doc, thumb = ''): Promise<string> {
  const s = await store('readwrite')
  const id = uid()
  const row: Row = { id, title: doc.title || 'Untitled figure', updatedAt: Date.now(), thumb, doc }
  await req(s.put(row))
  return id
}

/** Saves a figure that already has an id. */
export async function updateFigure(id: string, doc: Doc, thumb?: string): Promise<void> {
  const s = await store('readwrite')
  const row: Row = { id, title: doc.title || 'Untitled figure', updatedAt: Date.now(), thumb: thumb ?? '', doc }
  await req(s.put(row))
}

export async function getFigure(id: string): Promise<Doc | null> {
  const s = await store('readonly')
  const row = await req(s.get(id)) as Row | undefined
  return row ? row.doc : null
}

export async function removeFigure(id: string): Promise<void> {
  const s = await store('readwrite')
  await req(s.delete(id))
}

/** Every saved figure, newest first. */
export async function listFigures(): Promise<FigureMeta[]> {
  const s = await store('readonly')
  const all = await req(s.getAll()) as Row[]
  return all
    .map(({ doc: _doc, ...meta }) => meta)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function latestFigure(): Promise<(FigureMeta & { doc: Doc }) | null> {
  const list = await listFigures()
  const newest = list[0]
  if (!newest) return null
  const doc = await getFigure(newest.id)
  return doc ? { ...newest, doc } : null
}

/** True when there is a localStorage figure that has not been moved into the store yet. */
export const hasLocalFigure = () => {
  try {
    return !!localStorage.getItem(LS_DOC) && !localStorage.getItem(LS_MIGRATED)
  } catch {
    return false
  }
}

export const markLocalFigureMigrated = () => {
  try {
    localStorage.setItem(LS_MIGRATED, '1')
  } catch {
    /* storage unavailable; nothing to mark */
  }
}

export const readLocalFigure = (): Doc | null => {
  try {
    const t = localStorage.getItem(LS_DOC)
    return t ? parseLocal(t) : null
  } catch {
    return null
  }
}

function parseLocal(text: string): Doc | null {
  try {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object') return null
    const inner = (data as Record<string, unknown>).doc
    if (inner && typeof inner === 'object' && 'items' in (inner as Record<string, unknown>)) return inner as Doc
    if ('items' in (data as Record<string, unknown>)) return data as Doc
  } catch {
    /* not JSON */
  }
  return null
}
