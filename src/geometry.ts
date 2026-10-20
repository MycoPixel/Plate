import { membraneBounds } from './membrane'
import type { ArrowItem, ChartItem, FontId, Handle, IconItem, ImageItem, Item, Pt, Rect, ShapeItem, TextItem } from './types'

/** Font used inside figures. Deliberately a system stack: exports must look the same everywhere. */
export const FIGURE_FONT = 'Arial, Helvetica, sans-serif'

export const r3 = (n: number) => Math.round(n * 1000) / 1000
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

export const FONTS: Record<FontId, { label: string; family: string }> = {
  sans: { label: 'Sans-serif (Arial)', family: FIGURE_FONT },
  serif: { label: 'Serif (Times)', family: '"Times New Roman", Times, serif' },
  mono: { label: 'Monospace (Courier)', family: '"Courier New", Courier, monospace' },
}
export const fontFamily = (f?: FontId) => (f && FONTS[f] ? FONTS[f].family : FIGURE_FONT)

/** Sub- and superscripts are typed as _{2} and ^{2+}. Size of the small text, relative to the line. */
export const SCRIPT_SCALE = 0.7
/** Run of text: shift 1 is a subscript, -1 a superscript. */
export type Run = { text: string; shift: -1 | 0 | 1 }

export function parseRich(line: string): Run[] {
  const runs: Run[] = []
  const re = /([_^])\{([^{}]*)\}/g
  let last = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index), shift: 0 })
    if (m[2]) runs.push({ text: m[2], shift: m[1] === '_' ? 1 : -1 })
    last = m.index + m[0].length
  }
  if (last < line.length) runs.push({ text: line.slice(last), shift: 0 })
  return runs
}

export type Span = { text: string; x?: number; y?: number; dy?: number; size?: number }

/**
 * One line of text as <tspan>s. Only the first span has an absolute position; the others move with dy
 * (not baseline-shift), which every SVG editor and browser understands.
 */
export function lineSpans(line: string, ax: number, y: number, fs: number): Span[] {
  const runs = parseRich(line)
  if (runs.length === 0) return [{ text: ' ', x: ax, y }]
  let cur = 0
  return runs.map((r, i) => {
    const target = r.shift === 1 ? fs * 0.2 : r.shift === -1 ? -fs * 0.4 : 0
    const span: Span = { text: r.text, size: r.shift ? fs * SCRIPT_SCALE : undefined }
    if (i === 0) {
      span.x = ax
      span.y = y + target
    } else if (target !== cur) {
      span.dy = target - cur
    }
    cur = target
    return span
  })
}

let ctx: CanvasRenderingContext2D | null | undefined

/** `plain` skips the _{ } and ^{ } markup, for text that is not figure text (the credit line). */
export function measureText(t: Pick<TextItem, 'text' | 'fontSize' | 'bold' | 'italic'> & { font?: FontId }, plain = false) {
  const lines = t.text.split('\n')
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d')
  let w = 0
  const width = (text: string, size: number) => {
    if (!ctx) return text.length * size * 0.55
    ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${size}px ${fontFamily(t.font)}`
    return ctx.measureText(text).width
  }
  for (const l of lines) {
    const runs: Run[] = plain ? [{ text: l || ' ', shift: 0 }] : parseRich(l)
    if (runs.length === 0) runs.push({ text: ' ', shift: 0 })
    w = Math.max(w, runs.reduce((sum, r) => sum + width(r.text, r.shift ? t.fontSize * SCRIPT_SCALE : t.fontSize), 0))
  }
  return { w: Math.max(w, 4), h: lines.length * t.fontSize * 1.2, lines }
}

export type BoxGeom = { x: number; y: number; w: number; h: number; rotation: number }

export function boxOf(item: Item): BoxGeom {
  switch (item.type) {
    case 'text': {
      const m = measureText(item)
      return { x: item.x, y: item.y, w: m.w, h: m.h, rotation: item.rotation }
    }
    case 'arrow': {
      const xs = arrowCore(item).key.map((p) => p.x)
      const ys = arrowCore(item).key.map((p) => p.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, rotation: 0 }
    }
    case 'membrane':
      return { ...membraneBounds(item), rotation: 0 }
    case 'marker':
      return { x: item.x - item.size / 2, y: item.y - item.size / 2, w: item.size, h: item.size, rotation: 0 }
    default:
      return { x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation }
  }
}

export const centerOf = (b: BoxGeom): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

export function rotatePt(p: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export function aabbOf(item: Item): Rect {
  const b = boxOf(item)
  if (!b.rotation) return { x: b.x, y: b.y, w: b.w, h: b.h }
  const c = centerOf(b)
  const pts = [
    [-b.w / 2, -b.h / 2],
    [b.w / 2, -b.h / 2],
    [b.w / 2, b.h / 2],
    [-b.w / 2, b.h / 2],
  ].map(([x, y]) => {
    const q = rotatePt({ x, y }, b.rotation)
    return { x: c.x + q.x, y: c.y + q.y }
  })
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function unionAabb(items: Item[]): Rect {
  const boxes = items.map(aabbOf)
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y

/** A guide line to draw while something is snapping: its position on one axis and the span it covers. */
export type Guide = { at: number; from: number; to: number }

const features = (b: Rect, axis: 'x' | 'y'): number[] =>
  axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h]

/**
 * Smart guides: which way to nudge a moving box so one of its edges or centres lines up with
 * one of the same three lines on something else. Each axis is decided on its own, and only the
 * smallest nudge within `tol` wins, so the guides never fight each other.
 */
export function snapToItems(
  moving: Rect,
  targets: Rect[],
  tol: number,
): { dx: number; dy: number; v: Guide[]; h: Guide[] } {
  const best = (axis: 'x' | 'y') => {
    const mine = features(moving, axis)
    let delta = 0
    let at = 0
    let found = false
    for (const t of targets) {
      for (const tv of features(t, axis)) {
        for (const mv of mine) {
          const d = tv - mv
          if (Math.abs(d) > tol) continue
          if (!found || Math.abs(d) < Math.abs(delta)) {
            delta = d
            at = tv
            found = true
          }
        }
      }
    }
    return found ? { delta, at } : null
  }

  // A guide runs across everything it lined up, not just the first thing that matched.
  const span = (axis: 'x' | 'y', at: number): Guide => {
    const cross = axis === 'x' ? 'y' : 'x'
    const size = axis === 'x' ? 'h' : 'w'
    let from = moving[cross]
    let to = moving[cross] + moving[size]
    for (const t of targets) {
      if (!features(t, axis).some((f) => Math.abs(f - at) < 0.5)) continue
      from = Math.min(from, t[cross])
      to = Math.max(to, t[cross] + t[size])
    }
    return { at, from, to }
  }

  const v = best('x')
  const h = best('y')
  return {
    dx: v ? v.delta : 0,
    dy: h ? h.delta : 0,
    v: v ? [span('x', v.at)] : [],
    h: h ? [span('y', h.at)] : [],
  }
}

/** Spreads boxes so the gaps between them are equal, leaving the two outermost where they are. */
export function distributeBoxes(boxes: Map<string, Rect>, axis: 'h' | 'v'): Map<string, Pt> {
  const pos = axis === 'h' ? 'x' : 'y'
  const size = axis === 'h' ? 'w' : 'h'
  const sorted = [...boxes.entries()].sort((a, b) => a[1][pos] - b[1][pos])
  const first = sorted[0]?.[1]
  const last = sorted[sorted.length - 1]?.[1]
  if (!first || !last) return new Map()
  const span = last[pos] + last[size] - first[pos]
  const used = sorted.reduce((sum, [, b]) => sum + b[size], 0)
  const gap = (span - used) / (sorted.length - 1)
  const out = new Map<string, Pt>()
  let at = first[pos]
  for (const [id, b] of sorted) {
    out.set(id, { x: axis === 'h' ? at - b.x : 0, y: axis === 'v' ? at - b.y : 0 })
    at += b[size] + gap
  }
  return out
}

export function translateItem(item: Item, dx: number, dy: number): Item {
  if (item.type === 'arrow' || item.type === 'membrane') {
    return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy }
  }
  return { ...item, x: item.x + dx, y: item.y + dy }
}

type Resizable = IconItem | ImageItem | ShapeItem | TextItem | ChartItem

/** Resize by dragging a handle. Works in the item's rotated frame so rotated items resize correctly. */
export function resizeItem(origin: Resizable, handle: Handle, p: Pt, lock: boolean): Resizable {
  const b = boxOf(origin)
  const c = centerOf(b)
  const lp = rotatePt({ x: p.x - c.x, y: p.y - c.y }, -b.rotation)
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  const MIN = 8
  let left = -b.w / 2
  let right = b.w / 2
  let top = -b.h / 2
  let bottom = b.h / 2
  if (hx === 1) right = Math.max(lp.x, left + MIN)
  if (hx === -1) left = Math.min(lp.x, right - MIN)
  if (hy === 1) bottom = Math.max(lp.y, top + MIN)
  if (hy === -1) top = Math.min(lp.y, bottom - MIN)
  let nw = right - left
  let nh = bottom - top
  if ((lock || origin.type === 'text') && hx !== 0 && hy !== 0) {
    const s = Math.max(nw / b.w, nh / b.h)
    nw = b.w * s
    nh = b.h * s
    if (hx === 1) right = left + nw
    else left = right - nw
    if (hy === 1) bottom = top + nh
    else top = bottom - nh
  }
  const lc = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const rc = rotatePt(lc, b.rotation)
  const wc = { x: c.x + rc.x, y: c.y + rc.y }
  if (origin.type === 'text') {
    const fontSize = Math.max(4, origin.fontSize * (nw / b.w))
    const m = measureText({ ...origin, fontSize })
    return { ...origin, fontSize, x: wc.x - m.w / 2, y: wc.y - m.h / 2 }
  }
  return { ...origin, x: wc.x - nw / 2, y: wc.y - nh / 2, w: nw, h: nh }
}

export function snapAngle(from: Pt, to: Pt, step = 15): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  const a = Math.round(Math.atan2(dy, dx) / ((step * Math.PI) / 180)) * ((step * Math.PI) / 180)
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len }
}

const unit = (dx: number, dy: number, fallback: Pt = { x: 1, y: 0 }): Pt => {
  const l = Math.hypot(dx, dy)
  return l < 1e-9 ? fallback : { x: dx / l, y: dy / l }
}

/** The path an arrow follows: its corner points (or curve control point), end directions and key points. */
export function arrowCore(a: ArrowItem) {
  const p1: Pt = { x: a.x1, y: a.y1 }
  const p2: Pt = { x: a.x2, y: a.y2 }
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const len = Math.hypot(dx, dy)
  const chord = unit(dx, dy)
  if (a.kind === 'curve' && len > 0) {
    const nx = -dy / len
    const ny = dx / len
    const c: Pt = { x: (a.x1 + a.x2) / 2 + nx * a.bend * len, y: (a.y1 + a.y2) / 2 + ny * a.bend * len }
    const peak: Pt = { x: (p1.x + 2 * c.x + p2.x) / 4, y: (p1.y + 2 * c.y + p2.y) / 4 }
    return {
      curve: c as Pt | null,
      pts: [p1, p2],
      key: [p1, p2, peak],
      peak,
      len,
      start: unit(c.x - p1.x, c.y - p1.y, chord),
      end: unit(p2.x - c.x, p2.y - c.y, chord),
    }
  }
  let pts = [p1, p2]
  if (a.kind === 'elbow') {
    pts =
      a.axis === 'v'
        ? [p1, { x: a.x1, y: a.y1 + dy * a.bend }, { x: a.x2, y: a.y1 + dy * a.bend }, p2]
        : [p1, { x: a.x1 + dx * a.bend, y: a.y1 }, { x: a.x1 + dx * a.bend, y: a.y2 }, p2]
    pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6)
    if (pts.length < 2) pts = [p1, p2]
  }
  const n = pts.length
  const peak = n === 4 ? { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 } : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  return {
    curve: null as Pt | null,
    pts,
    key: pts,
    peak,
    len,
    start: unit(pts[1].x - pts[0].x, pts[1].y - pts[0].y, chord),
    end: unit(pts[n - 1].x - pts[n - 2].x, pts[n - 1].y - pts[n - 2].y, chord),
  }
}

const fmt = (p: Pt) => `${r3(p.x)} ${r3(p.y)}`
const pathOf = (pts: Pt[], curve: Pt | null) =>
  curve ? `M${fmt(pts[0])}Q${fmt(curve)} ${fmt(pts[1])}` : `M${fmt(pts[0])}${pts.slice(1).map((p) => `L${fmt(p)}`).join('')}`

/** Path (shortened so the head's tip stays sharp), full hit-test path and head polygons for an arrow. */
export function arrowParts(a: ArrowItem) {
  const core = arrowCore(a)
  const L = Math.min(core.len / 2, a.strokeWidth * 3.5 + 6)
  const hw = L * 0.5
  const pts = core.pts.map((p) => ({ ...p }))
  const last = pts.length - 1
  const heads: string[] = []
  const head = (t: Pt, v: Pt) => {
    const bx = t.x - v.x * L
    const by = t.y - v.y * L
    const px = -v.y
    const py = v.x
    return `${r3(t.x)},${r3(t.y)} ${r3(bx + px * hw)},${r3(by + py * hw)} ${r3(bx - px * hw)},${r3(by - py * hw)}`
  }
  const room = (i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)
  if (a.head === 'end' || a.head === 'both') {
    heads.push(head(core.pts[last], core.end))
    const s = Math.min(L * 0.8, room(last, Math.max(0, last - 1)))
    pts[last] = { x: pts[last].x - core.end.x * s, y: pts[last].y - core.end.y * s }
  }
  if (a.head === 'both') {
    heads.push(head(core.pts[0], { x: -core.start.x, y: -core.start.y }))
    const s = Math.min(L * 0.8, room(0, 1))
    pts[0] = { x: pts[0].x + core.start.x * s, y: pts[0].y + core.start.y * s }
  }
  return { d: pathOf(pts, core.curve), hit: pathOf(core.pts, core.curve), heads, handle: core.peak }
}

/** Where a dragged bend handle should put the bend value. */
export function bendFromPoint(a: Pick<ArrowItem, 'x1' | 'y1' | 'x2' | 'y2' | 'kind' | 'bend' | 'axis'>, p: Pt): number {
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const len = Math.hypot(dx, dy)
  if (len < 1) return a.bend
  if (a.kind === 'curve') {
    const off = ((p.x - (a.x1 + a.x2) / 2) * -dy + (p.y - (a.y1 + a.y2) / 2) * dx) / len
    return Math.max(-1.5, Math.min(1.5, (2 * off) / len))
  }
  if (a.axis === 'v') return Math.abs(dy) < 1 ? a.bend : Math.max(-0.5, Math.min(1.5, (p.y - a.y1) / dy))
  return Math.abs(dx) < 1 ? a.bend : Math.max(-0.5, Math.min(1.5, (p.x - a.x1) / dx))
}

/** Scales an item about a point, for resizing a whole selection or group at once. */
export function scaleItem(item: Item, f: number, o: Pt): Item {
  const sx = (v: number) => o.x + (v - o.x) * f
  const sy = (v: number) => o.y + (v - o.y) * f
  switch (item.type) {
    case 'arrow':
      return { ...item, x1: sx(item.x1), y1: sy(item.y1), x2: sx(item.x2), y2: sy(item.y2) }
    case 'membrane':
      return { ...item, x1: sx(item.x1), y1: sy(item.y1), x2: sx(item.x2), y2: sy(item.y2), size: Math.max(2, item.size * f), gap: item.gap * f }
    case 'text':
      return { ...item, x: sx(item.x), y: sy(item.y), fontSize: Math.max(4, item.fontSize * f) }
    case 'marker':
      return { ...item, x: sx(item.x), y: sy(item.y), size: Math.max(6, item.size * f), fontSize: Math.max(4, item.fontSize * f) }
    default:
      return { ...item, x: sx(item.x), y: sy(item.y), w: Math.max(1, item.w * f), h: Math.max(1, item.h * f) }
  }
}

/** Rotation (and optional horizontal flip) about the box centre. */
export function transformAttr(b: BoxGeom, flipX = false): string | undefined {
  if (!b.rotation && !flipX) return undefined
  const cx = r3(b.x + b.w / 2)
  const cy = r3(b.y + b.h / 2)
  return `translate(${cx} ${cy})${b.rotation ? ` rotate(${r3(b.rotation)})` : ''}${flipX ? ' scale(-1 1)' : ''} translate(${-cx} ${-cy})`
}

/** Maps an icon's own viewBox onto its box on the board. Clip keeps content inside the viewBox. */
export function iconLayout(item: IconItem, vb: number[]) {
  const [vx, vy, vw, vh] = vb
  const sx = r6(item.w / vw)
  const sy = r6(item.h / vh)
  return {
    outer: transformAttr(item, item.flipX),
    inner: `translate(${r3(item.x)} ${r3(item.y)}) scale(${sx} ${sy}) translate(${r3(-vx)} ${r3(-vy)})`,
    clip: { x: vx, y: vy, w: vw, h: vh },
  }
}
