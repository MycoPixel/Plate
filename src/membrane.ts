import { ICON_BY_ID } from './icons'
import type { MembraneItem, Pt, Rect } from './types'

/** The lipid a new membrane is made of (CC0, so it needs no credit). */
export const DEFAULT_LIPID = 'cell-membrane-phospholipid'

const FALLBACK_ASPECT = 1.8
const SAMPLES = 240
/** More lipids than this per layer would only make the page slow; the spacing is widened instead. */
const MAX_PER_LAYER = 800

/** Height of an icon as a multiple of its width, from its viewBox. */
export function aspectOf(iconId: string): number {
  const vb = ICON_BY_ID.get(iconId)?.viewBox
  return vb && vb[2] > 0 && vb[3] > 0 ? vb[3] / vb[2] : FALLBACK_ASPECT
}

/** Small seeded generator, so the same membrane always gets the same irregularities. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The line the membrane runs along: a quadratic curve, straight when bend is 0. */
function centreLine(m: Pick<MembraneItem, 'x1' | 'y1' | 'x2' | 'y2' | 'bend'>) {
  const dx = m.x2 - m.x1
  const dy = m.y2 - m.y1
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const c: Pt = { x: (m.x1 + m.x2) / 2 + (-dy / len) * m.bend * len, y: (m.y1 + m.y2) / 2 + (dx / len) * m.bend * len }
  const at = (t: number): Pt => {
    const u = 1 - t
    return { x: u * u * m.x1 + 2 * u * t * c.x + t * t * m.x2, y: u * u * m.y1 + 2 * u * t * c.y + t * t * m.y2 }
  }
  /** Unit direction of travel at t. */
  const dir = (t: number): Pt => {
    const tx = 2 * (1 - t) * (c.x - m.x1) + 2 * t * (m.x2 - c.x)
    const ty = 2 * (1 - t) * (c.y - m.y1) + 2 * t * (m.y2 - c.y)
    const l = Math.hypot(tx, ty)
    return l < 1e-9 ? { x: dx / len, y: dy / len } : { x: tx / l, y: ty / l }
  }
  return { c, at, dir, len }
}

export type Lipid = { x: number; y: number; rot: number; w: number; h: number }

export type MembraneLayout = {
  lipids: Lipid[]
  /** Size of one lipid, before any irregularity. */
  w: number
  h: number
  /** Across the whole membrane: both layers and the gap. */
  thickness: number
  /** The line itself, as an SVG path (for hit-testing and the selection outline). */
  d: string
  /** Middle of the line, where the bend handle sits. */
  peak: Pt
}

/**
 * Where every lipid goes. Each layer is spaced evenly along its own offset line, so on a curve the
 * outer layer holds more lipids than the inner one instead of the inner one crowding. In a bilayer the
 * first layer has its heads on the left of the direction of travel (up, for a line drawn left to right)
 * and the second layer is turned around.
 */
export function membraneLayout(m: MembraneItem, aspect = aspectOf(m.iconId)): MembraneLayout {
  const w = Math.max(2, m.size)
  const h = w * aspect
  const bilayer = m.layers === 2
  const gap = Math.max(0, m.gap)
  const thickness = bilayer ? 2 * h + gap : h
  const line = centreLine(m)
  const fmt = (n: number) => Math.round(n * 1000) / 1000
  if (!line) {
    return { lipids: [], w, h, thickness, d: `M${fmt(m.x1)} ${fmt(m.y1)}L${fmt(m.x2)} ${fmt(m.y2)}`, peak: { x: m.x1, y: m.y1 } }
  }
  const d =
    Math.abs(m.bend) < 1e-9
      ? `M${fmt(m.x1)} ${fmt(m.y1)}L${fmt(m.x2)} ${fmt(m.y2)}`
      : `M${fmt(m.x1)} ${fmt(m.y1)}Q${fmt(line.c.x)} ${fmt(line.c.y)} ${fmt(m.x2)} ${fmt(m.y2)}`

  const layers = bilayer
    ? [
        { side: -1, off: gap / 2 + h / 2 },
        { side: 1, off: gap / 2 + h / 2 },
      ]
    : [{ side: m.flip ? 1 : -1, off: 0 }]

  const lipids: Lipid[] = []
  layers.forEach((layer, li) => {
    const rand = rng(Math.floor(m.seed) * 31 + li * 7919 + 1)
    const offsetAt = (t: number): Pt => {
      const p = line.at(t)
      const dir = line.dir(t)
      return { x: p.x + -dir.y * layer.side * layer.off, y: p.y + dir.x * layer.side * layer.off }
    }
    const cum = [0]
    let prev = offsetAt(0)
    for (let i = 1; i <= SAMPLES; i++) {
      const q = offsetAt(i / SAMPLES)
      cum.push(cum[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y))
      prev = q
    }
    const total = cum[SAMPLES]
    if (total < 1e-6) return
    const pitch = w * Math.max(0.3, m.spacing)
    const count = Math.min(MAX_PER_LAYER, Math.max(1, Math.round(total / pitch)))
    const jit = Math.min(1, Math.max(0, m.jitter))
    for (let k = 0; k < count; k++) {
      // Four draws per lipid whatever the irregularity, so changing it never reshuffles the others.
      const rAlong = rand() - 0.5
      const rAcross = rand() - 0.5
      const rAngle = rand() - 0.5
      const rSize = rand() - 0.5
      const s = Math.min(total, Math.max(0, ((k + 0.5) * total) / count + rAlong * 2 * jit * pitch * 0.3))
      // find the segment holding distance s
      let lo = 0
      let hi = SAMPLES
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (cum[mid] <= s) lo = mid
        else hi = mid
      }
      const seg = cum[hi] - cum[lo]
      const t = (lo + (seg > 1e-9 ? (s - cum[lo]) / seg : 0)) / SAMPLES
      const dir = line.dir(t)
      const pos = offsetAt(t)
      const across = rAcross * 2 * jit * w * 0.12
      const turn = (Math.atan2(dir.y, dir.x) * 180) / Math.PI + (layer.side > 0 ? 180 : 0) + rAngle * 2 * jit * 12
      const k2 = 1 + rSize * 2 * jit * 0.08
      lipids.push({
        x: pos.x + -dir.y * across,
        y: pos.y + dir.x * across,
        rot: turn,
        w: w * k2,
        h: h * k2,
      })
    }
  })
  return { lipids, w, h, thickness, d, peak: line.at(0.5) }
}

/** The part of the board the membrane covers, roughly: its line widened by half its thickness. */
export function membraneBounds(m: MembraneItem, aspect = aspectOf(m.iconId)): Rect {
  const line = centreLine(m)
  const half = (m.layers === 2 ? 2 * m.size * aspect + Math.max(0, m.gap) : m.size * aspect) / 2
  const pts: Pt[] = line ? Array.from({ length: 33 }, (_, i) => line.at(i / 32)) : [{ x: m.x1, y: m.y1 }]
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs) - half
  const y = Math.min(...ys) - half
  return { x, y, w: Math.max(...xs) + half - x, h: Math.max(...ys) + half - y }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Places one lipid, drawn in a 1 by 1 box centred on the middle of its own box. */
export const lipidTransform = (l: Lipid) =>
  `translate(${r3(l.x)} ${r3(l.y)}) rotate(${r3(l.rot)}) scale(${r6(l.w)} ${r6(l.h)}) translate(-0.5 -0.5)`
