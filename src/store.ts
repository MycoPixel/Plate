import { uid } from './defaults'
import { sanitizeDoc } from './project'
import type { SavedSymbol } from './symbols'
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
const SYMBOL_DB = 'plate-symbols'
const SYMBOL_STORE = 'symbols'
const LS_DOC = 'plate:doc:v1'
const LS_MIGRATED = 'plate:migrated:v1'

let dbp: Promise<IDBDatabase> | null = null
let symDbp: Promise<IDBDatabase> | null = null

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

function openSymbolDb(): Promise<IDBDatabase> {
  if (!symDbp) {
    symDbp = new Promise((res, rej) => {
      const r = indexedDB.open(SYMBOL_DB, 1)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(SYMBOL_STORE)) {
          r.result.createObjectStore(SYMBOL_STORE, { keyPath: 'id' })
        }
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return symDbp
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb()
  return db.transaction(STORE, mode).objectStore(STORE)
}

async function symbolStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openSymbolDb()
  return db.transaction(SYMBOL_STORE, mode).objectStore(SYMBOL_STORE)
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
  // Stored rows are our own, but a hand-edited DB or a schema change should not crash the app.
  return row ? sanitizeDoc(row.doc) : null
}

export async function removeFigure(id: string): Promise<void> {
  const s = await store('readwrite')
  await req(s.delete(id))
}

/** Every saved figure, newest first. */
export async function listFigures(): Promise<FigureMeta[]> {
  const s = await store('readonly')
  const out: FigureMeta[] = []
  // A cursor walks one row at a time, so a gallery of photo-heavy figures never has
  // every document in memory at once the way getAll() would.
  await new Promise<void>((res, rej) => {
    const r = s.openCursor()
    r.onsuccess = () => {
      const c = r.result
      if (!c) {
        res()
        return
      }
      const { doc: _doc, ...meta } = c.value as Row
      out.push(meta)
      c.continue()
    }
    r.onerror = () => rej(r.error)
  })
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
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
    const doc = inner && typeof inner === 'object' && 'items' in (inner as Record<string, unknown>) ? inner : data
    return sanitizeDoc(doc)
  } catch {
    /* not JSON */
  }
  return null
}

export async function putSymbol(sym: SavedSymbol): Promise<void> {
  const s = await symbolStore('readwrite')
  await req(s.put(sym))
}

export async function removeSymbol(id: string): Promise<void> {
  const s = await symbolStore('readwrite')
  await req(s.delete(id))
}

export async function listSymbols(): Promise<SavedSymbol[]> {
  const s = await symbolStore('readonly')
  const rows = (await req(s.getAll())) as SavedSymbol[]
  const out: SavedSymbol[] = []
  for (const row of rows) {
    const doc = sanitizeDoc({ items: row.items })
    if (!doc) continue
    out.push({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
      w: row.w,
      h: row.h,
      items: doc.items,
      thumb: row.thumb || '',
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}
