import { sanitizeDoc } from './project'
import type { Doc } from './types'

export type VersionMeta = {
  id: number
  figId: string
  at: number
  title: string
  items: number
}

type Row = VersionMeta & { doc: Doc }

const DB_NAME = 'plate-versions'
const STORE = 'versions'
const INDEX = 'figId'
const LIMIT = 30

let dbp: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1)
      r.onupgradeneeded = () => {
        const db = r.result
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
          s.createIndex(INDEX, INDEX, { unique: false })
        }
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

/** Stores a snapshot of a figure and drops the oldest ones beyond the limit. */
export async function saveVersion(figId: string, doc: Doc): Promise<void> {
  if (!figId) return
  const s = await store('readwrite')
  const row = {
    figId,
    at: Date.now(),
    title: doc.title || 'Untitled figure',
    items: doc.items.length,
    doc,
  }
  await req(s.add(row))
  const keys = await req(s.index(INDEX).getAllKeys(figId)) as number[]
  for (const id of keys.slice(0, Math.max(0, keys.length - LIMIT))) await req(s.delete(id))
}

/** Snapshots of one figure, newest first. */
export async function listVersions(figId: string): Promise<VersionMeta[]> {
  if (!figId) return []
  const s = await store('readonly')
  const rows = await req(s.index(INDEX).getAll(figId)) as Row[]
  return rows
    .map(({ doc: _doc, ...meta }) => meta)
    .sort((a, b) => b.at - a.at)
}

export async function getVersion(id: number): Promise<Doc | null> {
  const s = await store('readonly')
  const row = await req(s.get(id)) as Row | undefined
  return row ? sanitizeDoc(row.doc) : null
}

export async function removeVersion(id: number): Promise<void> {
  const s = await store('readwrite')
  await req(s.delete(id))
}

/** Removes every snapshot of a figure that was just deleted from the gallery. */
export async function dropVersions(figId: string): Promise<void> {
  if (!figId) return
  const s = await store('readwrite')
  const keys = await req(s.index(INDEX).getAllKeys(figId)) as number[]
  for (const id of keys) await req(s.delete(id))
}
