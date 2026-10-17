import type { ArrowItem, Handle, IconItem, Item, Pt, Rect, ShapeItem, TextItem } from './types'

/** Font used inside figures. Deliberately a system stack: exports must look the same everywhere. */
export const FIGURE_FONT = 'Arial, Helvetica, sans-serif'

export const r3 = (n: number) => Math.round(n * 1000) / 1000
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

let ctx: CanvasRenderingContext2D | null | undefined

export function measureText(t: Pick<TextItem, 'text' | 'fontSize' | 'bold' | 'italic'>) {
  const lines = t.text.split('\n')
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d')
  let w = 0
  if (ctx) {
    ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.fontSize}px ${FIGURE_FONT}`
    for (const l of lines) w = Math.max(w, ctx.measureText(l || ' ').width)
  } else {
    for (const l of lines) w = Math.max(w, l.length * t.fontSize * 0.55)
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
    case 'arrow':
      return {
        x: Math.min(item.x1, item.x2),
        y: Math.min(item.y1, item.y2),
        w: Math.abs(item.x2 - item.x1),
        h: Math.abs(item.y2 - item.y1),
        rotation: 0,
      }
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

export function translateItem(item: Item, dx: number, dy: number): Item {
  if (item.type === 'arrow') {
    return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy }
  }
  return { ...item, x: item.x + dx, y: item.y + dy }
}

type Resizable = IconItem | ShapeItem | TextItem

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

/** Line (shortened so the head's tip stays sharp) plus head polygons for an arrow. */
export function arrowParts(a: ArrowItem) {
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const L = Math.min(len / 2, a.strokeWidth * 3.5 + 6)
  const hw = L * 0.5
  let x1 = a.x1
  let y1 = a.y1
  let x2 = a.x2
  let y2 = a.y2
  const heads: string[] = []
  const head = (tx: number, ty: number, vx: number, vy: number) => {
    const bx = tx - vx * L
    const by = ty - vy * L
    const px = -vy
    const py = vx
    return `${r3(tx)},${r3(ty)} ${r3(bx + px * hw)},${r3(by + py * hw)} ${r3(bx - px * hw)},${r3(by - py * hw)}`
  }
  if (a.head === 'end' || a.head === 'both') {
    heads.push(head(a.x2, a.y2, ux, uy))
    x2 = a.x2 - ux * L * 0.8
    y2 = a.y2 - uy * L * 0.8
  }
  if (a.head === 'both') {
    heads.push(head(a.x1, a.y1, -ux, -uy))
    x1 = a.x1 + ux * L * 0.8
    y1 = a.y1 + uy * L * 0.8
  }
  return { line: [x1, y1, x2, y2].map(r3), heads }
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
