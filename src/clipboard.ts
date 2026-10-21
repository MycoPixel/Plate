import { uid } from './defaults'
import { remapAnchors } from './connectors'
import { translateItem } from './geometry'
import { sanitizeDoc } from './project'
import type { Item } from './types'

/**
 * Copy and paste of board items. The items live in memory and in localStorage (so another tab can paste
 * them). The system clipboard gets a short text marker: a paste only brings the items back while the
 * clipboard still holds that marker, so copying text somewhere else is never overridden by old items.
 */
const KEY = 'plate:clipboard'
type Stored = { marker: string; items: Item[] }

let mem: Stored | null = null
let pastes = 0
/** False when the marker could not be written to the system clipboard, so a paste cannot be checked against it. */
let verified = true
export const setClipboardVerified = (v: boolean) => {
  verified = v
}

export function copyItems(items: Item[]): string {
  const marker = `EnlacePlot: ${items.length} ${items.length === 1 ? 'item' : 'items'} #${uid()}`
  mem = { marker, items: structuredClone(items) }
  pastes = 0
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'enlaceplot', marker, items }))
  } catch {
    // Too big for localStorage (large images): this tab can still paste, others cannot.
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* nothing to clean up */
    }
  }
  return marker
}

function stored(): Stored | null {
  try {
    const text = localStorage.getItem(KEY)
    if (text) {
      const data: unknown = JSON.parse(text)
      if (typeof data === 'object' && data !== null) {
        const d = data as { marker?: unknown; items?: unknown }
        const items = sanitizeDoc({ items: d.items })?.items
        if (typeof d.marker === 'string' && items?.length) return { marker: d.marker, items }
      }
    }
  } catch {
    /* fall back to memory */
  }
  return mem
}

/** True when the clipboard text is what copyItems put there, or when it holds no text at all. */
export function canPaste(clipText: string): boolean {
  const s = stored()
  return !!s && (!verified || clipText === '' || clipText === s.marker)
}

/** Fresh copies of the copied items, nudged a little more with every paste so they do not hide each other. */
export function pasteCopies(): Item[] {
  const s = stored()
  if (!s) return []
  pastes += 1
  const off = 16 * pastes
  const groups = new Map<string, string>()
  const ids = new Map<string, string>()
  const copies = s.items.map((it) => {
    const c = { ...translateItem(it, off, off), id: uid() } as Item
    ids.set(it.id, c.id)
    if (it.group) {
      if (!groups.has(it.group)) groups.set(it.group, uid())
      c.group = groups.get(it.group)
    }
    return c
  })
  return remapAnchors(copies, ids)
}
