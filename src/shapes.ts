import type { ShapeItem } from './types'

export type ShapeEl =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'path'; d: string; fill: string; stroke: string; strokeWidth: number }

/** Corners of a fresh polygon or curve, as fractions of the box. */
export function defaultPoints(shape: 'poly' | 'path'): [number, number][] {
  return shape === 'poly'
    ? [
        [0, 0],
        [1, 0],
        [1, 1],
        [0.5, 1],
      ]
    : [
        [0, 1],
        [0.5, 0],
        [1, 1],
      ]
}

const n = (v: number) => Math.round(v * 1000) / 1000

/**
 * A smooth curve through the points, as cubic segments. Each control point sits a sixth of the way
 * along the neighbouring segment, which is the Catmull-Rom curve; the ends are clamped so the curve
 * starts and ends exactly on the first and last point.
 */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${n(pts[0].x)} ${n(pts[0].y)}` : ''
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    d +=
      `C${n(p1.x + (p2.x - p0.x) / 6)} ${n(p1.y + (p2.y - p0.y) / 6)} ` +
      `${n(p2.x - (p3.x - p1.x) / 6)} ${n(p2.y - (p3.y - p1.y) / 6)} ` +
      `${n(p2.x)} ${n(p2.y)}`
  }
  return d
}

/** A square bracket facing left: serifs top and bottom, a point in the middle. */
function bracketPath(x: number, y: number, w: number, h: number): string {
  const k = Math.min(w * 0.9, 14)
  const p = Math.min(h * 0.24, 30)
  const mid = y + h / 2
  return (
    `M${n(x + w)} ${n(y)}L${n(x + k)} ${n(y)}` +
    `L${n(x + k)} ${n(mid - p)}L${n(x)} ${n(mid)}` +
    `L${n(x + k)} ${n(mid + p)}L${n(x + k)} ${n(y + h)}L${n(x + w)} ${n(y + h)}`
  )
}

/** The curly version: the same skeleton as the bracket, with the spine drawn as two curves. */
function bracePath(x: number, y: number, w: number, h: number): string {
  const k = Math.min(w * 0.9, 14)
  const p = h * 0.18
  const mid = y + h / 2
  return (
    `M${n(x + w)} ${n(y)}L${n(x + k)} ${n(y)}` +
    `C${n(x)} ${n(y)} ${n(x)} ${n(mid - p)} ${n(x)} ${n(mid)}` +
    `C${n(x)} ${n(mid + p)} ${n(x)} ${n(y + h)} ${n(x + k)} ${n(y + h)}` +
    `L${n(x + w)} ${n(y + h)}`
  )
}

/** Turns the stored fractions into board coordinates, mirroring horizontally when flipX is set. */
function placePoints(item: ShapeItem): { x: number; y: number }[] {
  const pts = item.points?.length ? item.points : defaultPoints(item.shape === 'path' ? 'path' : 'poly')
  return pts.map(([fx, fy]) => ({
    x: item.x + (item.flipX ? 1 - fx : fx) * item.w,
    y: item.y + fy * item.h,
  }))
}

/**
 * Every shape as plain SVG geometry. The board and the SVG export both build from this, so what you
 * see on screen is what lands in the file.
 */
export function shapeEls(item: ShapeItem): ShapeEl[] {
  const stroke = item.strokeWidth > 0 ? item.stroke : 'none'
  const sw = item.strokeWidth
  const { x, y, w, h } = item

  switch (item.shape) {
    case 'rect':
      return [{ kind: 'rect', x, y, w, h, rx: item.radius || 0, fill: item.fill, stroke, strokeWidth: sw }]
    case 'ellipse':
      return [{ kind: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, fill: item.fill, stroke, strokeWidth: sw }]
    case 'bracket': {
      // Mirrored by drawing on the right-hand side, so the shape's own box never has to change.
      const bx = item.flipX ? x + w : x
      return [{ kind: 'path', d: bracketPath(bx, y, w, h), fill: 'none', stroke, strokeWidth: sw }]
    }
    case 'brace': {
      const bx = item.flipX ? x + w : x
      return [{ kind: 'path', d: bracePath(bx, y, w, h), fill: 'none', stroke, strokeWidth: sw }]
    }
    case 'callout': {
      // A rounded box with a tail under one end. The tail is a separate polygon so the box can keep
      // using its own corner radius.
      const tailX = item.flipX ? x + w * 0.55 : x + w * 0.2
      const tipX = item.flipX ? x + w * 0.95 : x + w * 0.02
      const drop = Math.max(10, h * 0.3)
      const f = (a: number, b: number) => `${n(a)},${n(b)}`
      return [
        { kind: 'rect', x, y, w, h, rx: item.radius || 8, fill: item.fill, stroke, strokeWidth: sw },
        {
          kind: 'path',
          d:
            `M${f(tailX - w * 0.18, y + h)}L${f(tipX, y + h + drop)}L${f(tailX + w * 0.18, y + h)}Z`,
          fill: item.fill,
          stroke,
          strokeWidth: sw,
        },
      ]
    }
    case 'poly': {
      const pts = placePoints(item)
      if (pts.length < 3) return []
      return [
        {
          kind: 'path',
          d: `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z`,
          fill: item.fill,
          stroke,
          strokeWidth: sw,
        },
      ]
    }
    case 'path': {
      const pts = placePoints(item)
      if (pts.length < 2) return []
      return [{ kind: 'path', d: item.smooth ? smoothPath(pts) : `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}`, fill: 'none', stroke, strokeWidth: sw }]
    }
  }
}