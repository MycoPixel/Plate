import { emptyDoc, uid } from './defaults'
import type { Doc, Item } from './types'

const KEY = 'plate:doc:v1'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d

function sanitizeItem(raw: unknown): Item | null {
  if (!isObj(raw)) return null
  const id = str(raw.id, '') || uid()
  const flags = { hidden: bool(raw.hidden, false) || undefined, locked: bool(raw.locked, false) || undefined }
  const box = {
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(1, num(raw.w, 100)),
    h: Math.max(1, num(raw.h, 100)),
    rotation: num(raw.rotation, 0),
  }
  switch (raw.type) {
    case 'icon': {
      const iconId = str(raw.iconId, '')
      if (!iconId) return null
      return {
        ...flags,
        ...box,
        type: 'icon',
        id,
        iconId,
        flipX: bool(raw.flipX, false),
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
      }
    }
    case 'shape':
      return {
        ...flags,
        ...box,
        type: 'shape',
        id,
        shape: oneOf(raw.shape, ['rect', 'ellipse'] as const, 'rect'),
        fill: str(raw.fill, '#DCE7EE'),
        stroke: str(raw.stroke, '#13262F'),
        strokeWidth: Math.max(0, num(raw.strokeWidth, 2)),
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        radius: Math.max(0, num(raw.radius, 0)),
      }
    case 'text':
      return {
        ...flags,
        type: 'text',
        id,
        x: box.x,
        y: box.y,
        rotation: box.rotation,
        text: str(raw.text, 'Text'),
        fontSize: Math.max(4, num(raw.fontSize, 24)),
        fill: str(raw.fill, '#13262F'),
        bold: bool(raw.bold, false),
        italic: bool(raw.italic, false),
        align: oneOf(raw.align, ['left', 'center', 'right'] as const, 'left'),
      }
    case 'arrow':
      return {
        ...flags,
        type: 'arrow',
        id,
        x1: num(raw.x1, 0),
        y1: num(raw.y1, 0),
        x2: num(raw.x2, 100),
        y2: num(raw.y2, 0),
        stroke: str(raw.stroke, '#13262F'),
        strokeWidth: Math.max(0.5, num(raw.strokeWidth, 3)),
        head: oneOf(raw.head, ['end', 'both', 'none'] as const, 'end'),
        dashed: bool(raw.dashed, false),
      }
    default:
      return null
  }
}

export function sanitizeDoc(raw: unknown): Doc | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null
  const base = emptyDoc()
  const items = raw.items.map(sanitizeItem).filter((i): i is Item => i !== null)
  return {
    title: str(raw.title, base.title).slice(0, 120),
    width: Math.min(8000, Math.max(100, num(raw.width, base.width))),
    height: Math.min(8000, Math.max(100, num(raw.height, base.height))),
    background: str(raw.background, base.background),
    transparent: bool(raw.transparent, false),
    items,
  }
}

export const serializeProject = (doc: Doc) =>
  JSON.stringify({ app: 'plate', version: 1, doc }, null, 1)

export function parseProject(text: string): Doc | null {
  try {
    const data: unknown = JSON.parse(text)
    return sanitizeDoc(isObj(data) && 'doc' in data ? data.doc : data)
  } catch {
    return null
  }
}

export function loadAutosave(): Doc | null {
  try {
    const t = localStorage.getItem(KEY)
    return t ? parseProject(t) : null
  } catch {
    return null
  }
}

export function saveAutosave(doc: Doc) {
  try {
    localStorage.setItem(KEY, serializeProject(doc))
  } catch {
    /* storage can be unavailable or full; the figure still works without it */
  }
}
