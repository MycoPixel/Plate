import { emptyDoc, uid } from './defaults'
import { syncConnectors } from './connectors'
import { syncMarkers } from './markers'
import type { Anchor, ChartKind, Doc, Item } from './types'

const KEY = 'plate:doc:v1'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d

const HEX = /^#[0-9a-f]{6}$/i
const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i

function colorMap(v: unknown): Record<string, string> | undefined {
  if (!isObj(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, c] of Object.entries(v)) if (HEX.test(k) && typeof c === 'string' && HEX.test(c)) out[k.toLowerCase()] = c
  return Object.keys(out).length ? out : undefined
}

function sanitizeItem(raw: unknown): Item | null {
  if (!isObj(raw)) return null
  const id = str(raw.id, '') || uid()
  const flags = {
    hidden: bool(raw.hidden, false) || undefined,
    locked: bool(raw.locked, false) || undefined,
    group: str(raw.group, '').slice(0, 40) || undefined,
  }
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
        colors: colorMap(raw.colors),
      }
    }
    case 'image': {
      const src = str(raw.src, '')
      if (!IMAGE_SRC.test(src) || src.length > 14_000_000) return null
      return {
        ...flags,
        ...box,
        type: 'image',
        id,
        src,
        flipX: bool(raw.flipX, false),
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : undefined,
        smiles: typeof raw.smiles === 'string' ? raw.smiles.slice(0, 2000) : undefined,
        smilesColor: typeof raw.smilesColor === 'boolean' ? raw.smilesColor : undefined,
        author: typeof raw.author === 'string' && raw.author ? raw.author.slice(0, 200) : undefined,
        license: typeof raw.license === 'string' && raw.license ? raw.license.slice(0, 120) : undefined,
        source: typeof raw.source === 'string' && raw.source ? raw.source.slice(0, 500) : undefined,
      }
    }
    case 'shape': {
      const shape = oneOf(raw.shape, ['rect', 'ellipse', 'bracket', 'brace', 'callout', 'poly', 'path'] as const, 'rect')
      // Corners are fractions of the box, so they may sit outside 0..1 without being wrong.
      const points = Array.isArray(raw.points)
        ? raw.points
            .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))
            .slice(0, 512)
            .map(([fx, fy]) => [Math.max(-4, Math.min(4, fx)), Math.max(-4, Math.min(4, fy))] as [number, number])
        : undefined
      return {
        ...flags,
        ...box,
        type: 'shape',
        id,
        shape,
        fill: str(raw.fill, '#DCE7EE'),
        stroke: str(raw.stroke, '#13262F'),
        strokeWidth: Math.max(0, num(raw.strokeWidth, 2)),
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        radius: Math.max(0, num(raw.radius, 0)),
        flipX: raw.flipX === true ? true : undefined,
        points: shape === 'poly' || shape === 'path' ? points : undefined,
        smooth: raw.smooth === true ? true : undefined,
      }
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
        font: oneOf(raw.font, ['sans', 'serif', 'mono'] as const, 'sans'),
        legend: raw.legend === true ? true : undefined,
      }
    case 'chart': {
      const oneOfKind = (v: unknown): ChartKind =>
        v === 'bar' || v === 'line' || v === 'scatter' ? v : 'bar'
      const series = Array.isArray(raw.series)
        ? raw.series
            .filter((s): s is Record<string, unknown> => isObj(s))
            .slice(0, 8)
            .map((s) => ({
              name: str(s.name, '').slice(0, 40) || 'Series',
              color: str(s.color, '#2F6F8F'),
              values: (Array.isArray(s.values) ? s.values.slice(0, 60).map((v) => num(v, 0)).filter(Number.isFinite) : []).slice(0, 60),
              errors: Array.isArray(s.errors) ? s.errors.slice(0, 60).map((v) => Math.max(0, num(v, 0))).filter(Number.isFinite) : undefined,
            }))
            .filter((s) => s.values.length > 0)
        : []
      return {
        ...flags,
        ...box,
        type: 'chart',
        id,
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        title: str(raw.title, '').slice(0, 80),
        yLabel: str(raw.yLabel, '').slice(0, 60),
        xLabel: str(raw.xLabel, '').slice(0, 60),
        xNames: (Array.isArray(raw.xNames) ? raw.xNames.map((w) => str(w, '').slice(0, 24)).filter((w) => w) : []).slice(0, 60),
        series: series.length ? series : [{ name: 'Series', color: '#2F6F8F', values: [1] }],
        kind: oneOfKind(raw.kind),
        yMax: Math.max(0, num(raw.yMax, 0)),
        showGrid: bool(raw.showGrid, true),
      }
    }
    case 'marker':
      return {
        ...flags,
        type: 'marker',
        id,
        x: box.x,
        y: box.y,
        size: Math.min(400, Math.max(8, num(raw.size, 34))),
        label: str(raw.label, '').slice(0, 160),
        fill: str(raw.fill, '#463C9B'),
        stroke: str(raw.stroke, '#FFFFFF'),
        strokeWidth: Math.max(0, num(raw.strokeWidth, 2)),
        textFill: str(raw.textFill, '#FFFFFF'),
        fontSize: Math.max(4, num(raw.fontSize, 18)),
      }
    case 'membrane': {
      const iconId = str(raw.iconId, '')
      if (!iconId) return null
      return {
        ...flags,
        type: 'membrane',
        id,
        x1: num(raw.x1, 0),
        y1: num(raw.y1, 0),
        x2: num(raw.x2, 0),
        y2: num(raw.y2, 0),
        bend: Math.min(1.5, Math.max(-1.5, num(raw.bend, 0))),
        iconId,
        size: Math.min(400, Math.max(2, num(raw.size, 22))),
        layers: raw.layers === 1 ? 1 : 2,
        gap: Math.min(300, Math.max(0, num(raw.gap, 3))),
        spacing: Math.min(3, Math.max(0.3, num(raw.spacing, 1.05))),
        jitter: Math.min(1, Math.max(0, num(raw.jitter, 0.2))),
        seed: Math.floor(Math.abs(num(raw.seed, 1))) % 1_000_000_000,
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        flip: bool(raw.flip, false),
        colors: colorMap(raw.colors),
      }
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
        kind: oneOf(raw.kind, ['straight', 'elbow', 'curve'] as const, 'straight'),
        bend: Math.min(1.5, Math.max(-1.5, num(raw.bend, 0.5))),
        axis: oneOf(raw.axis, ['h', 'v'] as const, 'h'),
        from: anchorOf(raw.from),
        to: anchorOf(raw.to),
      }
    default:
      return null
  }
}

function anchorOf(v: unknown): Anchor | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return undefined
  const side = v.side === 'n' || v.side === 'e' || v.side === 's' || v.side === 'w' ? v.side : undefined
  return side ? { id: v.id, side } : { id: v.id }
}

export function sanitizeDoc(raw: unknown): Doc | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null
  const base = emptyDoc()
  const items = raw.items.map(sanitizeItem).filter((i): i is Item => i !== null)
  return syncMarkers(syncConnectors({
    title: str(raw.title, base.title).slice(0, 120),
    width: Math.min(8000, Math.max(100, num(raw.width, base.width))),
    height: Math.min(8000, Math.max(100, num(raw.height, base.height))),
    background: str(raw.background, base.background),
    transparent: bool(raw.transparent, false),
    items,
  }))
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

/** Returns false when the browser would not keep it (storage full or unavailable). */
export function saveAutosave(doc: Doc): boolean {
  try {
    localStorage.setItem(KEY, serializeProject(doc))
    return true
  } catch {
    return false
  }
}
