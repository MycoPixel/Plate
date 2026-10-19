import { boxOf, centerOf, r3, rotatePt } from './geometry'
import type { Anchor, ArrowItem, Doc, Item, MembraneItem, Pt } from './types'

/**
 * Arrows attached to items. An arrow keeps its own x1/y1/x2/y2 (so drawing and export need no changes);
 * syncConnectors recomputes the attached ends from the items they follow, after every change to the board.
 */

type Target = Exclude<Item, ArrowItem | MembraneItem>
type Side = NonNullable<Anchor['side']>

/** Space left between an item's outline and the arrow touching it. */
const GAP = 3

const isTarget = (it: Item | undefined): it is Target => !!it && it.type !== 'arrow' && it.type !== 'membrane'
const isEllipse = (it: Target) => it.type === 'shape' && it.shape === 'ellipse'

/** Where a line from the item's centre towards `toward` crosses the item's outline. */
function edgePoint(it: Target, toward: Pt): Pt {
  const b = boxOf(it)
  const c = centerOf(b)
  const l = rotatePt({ x: toward.x - c.x, y: toward.y - c.y }, -b.rotation)
  const len = Math.hypot(l.x, l.y)
  const dx = len < 1e-6 ? 1 : l.x / len
  const dy = len < 1e-6 ? 0 : l.y / len
  const hw = Math.max(b.w / 2, 0.5)
  const hh = Math.max(b.h / 2, 0.5)
  const reach = isEllipse(it)
    ? 1 / Math.hypot(dx / hw, dy / hh)
    : Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  const out = rotatePt({ x: dx * (reach + GAP), y: dy * (reach + GAP) }, b.rotation)
  return { x: c.x + out.x, y: c.y + out.y }
}

/** Middle of one side of the item (the side turns with the item when it is rotated). */
function sidePoint(it: Target, side: Side): Pt {
  const b = boxOf(it)
  const c = centerOf(b)
  const hw = b.w / 2 + GAP
  const hh = b.h / 2 + GAP
  const l = side === 'n' ? { x: 0, y: -hh } : side === 's' ? { x: 0, y: hh } : side === 'e' ? { x: hw, y: 0 } : { x: -hw, y: 0 }
  const out = rotatePt(l, b.rotation)
  return { x: c.x + out.x, y: c.y + out.y }
}

/** The side of the item that faces `toward`, judged in the item's own (unrotated) frame. */
function facingSide(it: Target, toward: Pt): Side {
  const b = boxOf(it)
  const c = centerOf(b)
  const l = rotatePt({ x: toward.x - c.x, y: toward.y - c.y }, -b.rotation)
  return Math.abs(l.x) / Math.max(b.w, 1) >= Math.abs(l.y) / Math.max(b.h, 1) ? (l.x >= 0 ? 'e' : 'w') : l.y >= 0 ? 's' : 'n'
}

const axisOfSide = (s: Side): 'h' | 'v' => (s === 'e' || s === 'w' ? 'h' : 'v')

/** The arrow with its attached ends moved to where they belong. Same object when nothing moves. */
function resolveArrow(a: ArrowItem, byId: Map<string, Item>): ArrowItem {
  const A = a.from ? byId.get(a.from.id) : undefined
  const B = a.to ? byId.get(a.to.id) : undefined
  const from = isTarget(A) && A.id !== a.to?.id ? a.from : undefined
  const to = isTarget(B) && B.id !== a.from?.id ? a.to : undefined
  const ta = from ? (A as Target) : undefined
  const tb = to ? (B as Target) : undefined

  let p1: Pt = { x: a.x1, y: a.y1 }
  let p2: Pt = { x: a.x2, y: a.y2 }
  let axis = a.axis
  const elbow = a.kind === 'elbow'

  // What each end looks towards: the other item's centre, or the other end if that one is free.
  const look1: Pt = tb ? centerOf(boxOf(tb)) : { x: a.x2, y: a.y2 }
  const look2: Pt = ta ? centerOf(boxOf(ta)) : { x: a.x1, y: a.y1 }

  let side1: Side | undefined = from?.side
  let side2: Side | undefined = to?.side
  if (elbow) {
    if (ta && tb && !side1 && !side2) {
      // Both ends automatic: leave and arrive along whichever direction the two items are mostly apart.
      const ca = centerOf(boxOf(ta))
      const cb = centerOf(boxOf(tb))
      const dx = cb.x - ca.x
      const dy = cb.y - ca.y
      if (Math.abs(dx) >= Math.abs(dy)) [side1, side2] = dx >= 0 ? ['e', 'w'] : ['w', 'e']
      else [side1, side2] = dy >= 0 ? ['s', 'n'] : ['n', 's']
    } else {
      if (ta && !side1) side1 = facingSide(ta, look1)
      if (tb && !side2) side2 = facingSide(tb, look2)
    }
    if (side1 && ta) axis = axisOfSide(side1)
    else if (side2 && tb) axis = axisOfSide(side2)
  }
  if (ta) p1 = side1 ? sidePoint(ta, side1) : edgePoint(ta, look1)
  if (tb) p2 = side2 ? sidePoint(tb, side2) : edgePoint(tb, look2)

  const x1 = r3(p1.x)
  const y1 = r3(p1.y)
  const x2 = r3(p2.x)
  const y2 = r3(p2.y)
  if (x1 === a.x1 && y1 === a.y1 && x2 === a.x2 && y2 === a.y2 && axis === a.axis && from === a.from && to === a.to) return a
  return { ...a, x1, y1, x2, y2, axis, from, to }
}

/**
 * Brings every attached arrow in line with the items it follows. An arrow whose item is gone keeps its
 * last position and becomes free. Returns the same board object when nothing changes.
 */
export function syncConnectors(d: Doc): Doc {
  let byId: Map<string, Item> | null = null
  let changed = false
  const items = d.items.map((it) => {
    if (it.type !== 'arrow' || (!it.from && !it.to)) return it
    byId ??= new Map(d.items.map((i) => [i.id, i]))
    const next = resolveArrow(it, byId)
    if (next !== it) changed = true
    return next
  })
  return changed ? { ...d, items } : d
}

/**
 * The item a pointer at `p` would attach to: the topmost item under it, within `pad` of its outline.
 * A large shape (over half the board in either direction) is taken as a backdrop and only counts
 * near its edge, so an arrow drawn on a panel does not stick to the panel.
 */
export function targetAt(d: Doc, p: Pt, pad: number, exclude?: string): Target | null {
  for (let i = d.items.length - 1; i >= 0; i--) {
    const it = d.items[i]
    if (!isTarget(it) || it.hidden || it.id === exclude) continue
    const b = boxOf(it)
    const c = centerOf(b)
    const l = rotatePt({ x: p.x - c.x, y: p.y - c.y }, -b.rotation)
    const inside = (m: number) => {
      const hw = b.w / 2 + m
      const hh = b.h / 2 + m
      if (hw <= 0 || hh <= 0) return false
      return isEllipse(it) ? (l.x / hw) ** 2 + (l.y / hh) ** 2 <= 1 : Math.abs(l.x) <= hw && Math.abs(l.y) <= hh
    }
    if (!inside(pad)) continue
    const backdrop = it.type === 'shape' && (b.w > d.width / 2 || b.h > d.height / 2)
    if (backdrop && inside(-pad * 3)) continue
    return it
  }
  return null
}

/** Arrow copies follow the copied items they were attached to; ends attached to anything else are let go. */
export function remapAnchors<T extends Item>(copies: T[], idMap: Map<string, string>): T[] {
  const map = (a?: Anchor): Anchor | undefined => {
    const id = a && idMap.get(a.id)
    return a && id ? { ...a, id } : undefined
  }
  return copies.map((c) => (c.type === 'arrow' && (c.from || c.to) ? ({ ...c, from: map(c.from), to: map(c.to) } as T) : c))
}

/** Moving an arrow by itself pulls it off whatever it was attached to, unless that moves along with it. */
export function detachOutside(a: ArrowItem, moving: ReadonlySet<string>): ArrowItem {
  const keep = (x?: Anchor) => (x && moving.has(x.id) ? x : undefined)
  const from = keep(a.from)
  const to = keep(a.to)
  return from === a.from && to === a.to ? a : { ...a, from, to }
}
