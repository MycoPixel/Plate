import { useSyncExternalStore } from 'react'

/** Favourite and recently used icons, kept in this browser. */
const FAV_KEY = 'plate:favs'
const RECENT_KEY = 'plate:recent'
const MAX_RECENT = 24

function read(key: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    /* the list just will not be remembered */
  }
}

let favs = read(FAV_KEY)
let recent = read(RECENT_KEY)
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function toggleFavorite(id: string) {
  favs = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]
  write(FAV_KEY, favs)
  emit()
}

export function pushRecent(id: string) {
  recent = [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT)
  write(RECENT_KEY, recent)
  emit()
}

/** Re-renders on any change and returns the current lists (new arrays only when something changed). */
export function useLibrary() {
  useSyncExternalStore(subscribe, () => version)
  return { favs, recent }
}
