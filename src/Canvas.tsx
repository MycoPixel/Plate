import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  aabbOf,
  arrowParts,
  boxOf,
  centerOf,
  FIGURE_FONT,
  iconLayout,
  measureText,
  rectsIntersect,
  resizeItem,
  snapAngle,
  transformAttr,
  translateItem,
  unionAabb,
} from './geometry'
import { getIcon, ICON_BY_ID, scopeIds, useIconCacheVersion } from './icons'
import { newArrow, newShape } from './defaults'
import { ICON_MIME } from './Palette'
import type { ArrowItem, Doc, Handle, IconItem, Item, Pt, Rect, ShapeItem, TextItem, Tool } from './types'
import { clamp, isFormTarget } from './util'

type Drag =
  | { kind: 'move'; start: Pt; origin: Map<string, Item>; primary: string; moved: boolean; shift: boolean }
  | { kind: 'resize'; handle: Handle; origin: IconItem | ShapeItem | TextItem; moved: boolean }
  | { kind: 'rotate'; origin: IconItem | ShapeItem | TextItem; center: Pt; startAngle: number; moved: boolean }
  | { kind: 'arrowEnd'; which: 1 | 2; origin: ArrowItem; moved: boolean }
  | { kind: 'create'; tool: 'arrow' | 'rect' | 'ellipse'; start: Pt; id: string | null }
  | { kind: 'marquee'; start: Pt; base: string[]; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; left: number; top: number }

const GRID = 8
const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
const HANDLES: [Handle, number, number][] = [
  ['nw', -1, -1],
  ['n', 0, -1],
  ['ne', 1, -1],
  ['e', 1, 0],
  ['se', 1, 1],
  ['s', 0, 1],
  ['sw', -1, 1],
  ['w', -1, 0],
]

const ItemView = memo(function ItemView({ item, zoom, v }: { item: Item; zoom: number; v: number }) {
  void v // changes when an icon finishes loading, so memoised rows redraw
  switch (item.type) {
    case 'icon': {
      const meta = ICON_BY_ID.get(item.iconId)
      if (!meta) return null
      const parsed = getIcon(item.iconId)
      const l = iconLayout(item, meta.viewBox)
      return (
        <g
          data-id={item.id}
          transform={l.outer}
          opacity={item.opacity < 1 ? item.opacity : undefined}
          data-locked={item.locked || undefined}
        >
          <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" />
          {parsed?.status === 'ready' && parsed.inline && (
            <g transform={l.inner} clipPath={`url(#clip-${item.id})`} pointerEvents="none">
              <clipPath id={`clip-${item.id}`}>
                <rect x={l.clip.x} y={l.clip.y} width={l.clip.w} height={l.clip.h} />
              </clipPath>
              <g dangerouslySetInnerHTML={{ __html: scopeIds(parsed.inner, item.id) }} />
            </g>
          )}
          {parsed?.status === 'ready' && !parsed.inline && (
            <image
              x={item.x}
              y={item.y}
              width={item.w}
              height={item.h}
              preserveAspectRatio="none"
              xlinkHref={parsed.dataUri}
              pointerEvents="none"
            />
          )}
          {parsed?.status !== 'ready' && (
            <rect
              className={parsed?.status === 'error' ? 'icon-error' : 'icon-loading'}
              x={item.x}
              y={item.y}
              width={item.w}
              height={item.h}
              pointerEvents="none"
            />
          )}
        </g>
      )
    }
    case 'shape': {
      const common = {
        fill: item.fill,
        stroke: item.strokeWidth > 0 ? item.stroke : 'none',
        strokeWidth: item.strokeWidth > 0 ? item.strokeWidth : undefined,
      }
      return (
        <g
          data-id={item.id}
          transform={transformAttr(item)}
          opacity={item.opacity < 1 ? item.opacity : undefined}
          data-locked={item.locked || undefined}
        >
          {item.shape === 'rect' ? (
            <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.radius || undefined} {...common} />
          ) : (
            <ellipse cx={item.x + item.w / 2} cy={item.y + item.h / 2} rx={item.w / 2} ry={item.h / 2} {...common} />
          )}
        </g>
      )
    }
    case 'text': {
      const m = measureText(item)
      const b = boxOf(item)
      const ax = item.align === 'left' ? item.x : item.align === 'center' ? item.x + m.w / 2 : item.x + m.w
      const anchor = item.align === 'left' ? 'start' : item.align === 'center' ? 'middle' : 'end'
      const lh = item.fontSize * 1.2
      return (
        <g data-id={item.id} transform={transformAttr(b)} data-locked={item.locked || undefined}>
          <rect x={item.x} y={item.y} width={m.w} height={m.h} fill="transparent" />
          <text
            fontFamily={FIGURE_FONT}
            fontSize={item.fontSize}
            fontWeight={item.bold ? 700 : undefined}
            fontStyle={item.italic ? 'italic' : undefined}
            fill={item.fill}
            textAnchor={anchor}
            pointerEvents="none"
            style={{ whiteSpace: 'pre' }}
          >
            {m.lines.map((line, i) => (
              <tspan key={i} x={ax} y={item.y + i * lh + item.fontSize * 0.95}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        </g>
      )
    }
    case 'arrow': {
      const { line, heads } = arrowParts(item)
      return (
        <g data-id={item.id} data-locked={item.locked || undefined}>
          <line
            x1={item.x1}
            y1={item.y1}
            x2={item.x2}
            y2={item.y2}
            stroke="transparent"
            strokeWidth={Math.max(item.strokeWidth, 14 / zoom)}
            pointerEvents="stroke"
          />
          <g pointerEvents="none">
            <line
              x1={line[0]}
              y1={line[1]}
              x2={line[2]}
              y2={line[3]}
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
              strokeDasharray={item.dashed ? `${item.strokeWidth * 3} ${item.strokeWidth * 2}` : undefined}
            />
            {heads.map((p, i) => (
              <polygon key={i} points={p} fill={item.stroke} />
            ))}
          </g>
        </g>
      )
    }
  }
})

function Overlay({ items, zoom }: { items: Item[]; zoom: number }) {
  if (items.length === 0) return null
  const hs = 9 / zoom

  if (items.length === 1) {
    const it = items[0]
    if (it.type === 'arrow') {
      return (
        <g>
          <line
            className="sel-line"
            x1={it.x1}
            y1={it.y1}
            x2={it.x2}
            y2={it.y2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {([1, 2] as const).map((w) => (
            <circle
              key={w}
              className="handle"
              data-handle={`a${w}`}
              cx={w === 1 ? it.x1 : it.x2}
              cy={w === 1 ? it.y1 : it.y2}
              r={hs * 0.62}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'move' }}
            />
          ))}
        </g>
      )
    }
    const b = boxOf(it)
    const c = centerOf(b)
    const corners = it.type === 'text'
    return (
      <g transform={`translate(${c.x} ${c.y}) rotate(${b.rotation})`}>
        <rect
          className="sel-box"
          x={-b.w / 2}
          y={-b.h / 2}
          width={b.w}
          height={b.h}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {!it.locked && (
          <>
            <line
              className="sel-line"
              x1={0}
              y1={-b.h / 2}
              x2={0}
              y2={-b.h / 2 - 26 / zoom}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <circle
              className="handle handle-rotate"
              data-handle="rotate"
              cx={0}
              cy={-b.h / 2 - 26 / zoom}
              r={hs * 0.62}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'grab' }}
            />
            {HANDLES.filter(([h]) => !corners || h.length === 2).map(([h, hx, hy]) => (
              <rect
                key={h}
                className="handle"
                data-handle={h}
                x={(hx * b.w) / 2 - hs / 2}
                y={(hy * b.h) / 2 - hs / 2}
                width={hs}
                height={hs}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: CURSORS[h] }}
              />
            ))}
          </>
        )}
      </g>
    )
  }

  const u = unionAabb(items)
  return (
    <g pointerEvents="none">
      {items.map((it) => {
        const a = aabbOf(it)
        return (
          <rect key={it.id} className="sel-box thin" x={a.x} y={a.y} width={a.w} height={a.h} vectorEffect="non-scaling-stroke" />
        )
      })}
      <rect className="sel-box dashed" x={u.x} y={u.y} width={u.w} height={u.h} vectorEffect="non-scaling-stroke" />
    </g>
  )
}

export type CanvasProps = {
  doc: Doc
  selection: string[]
  tool: Tool
  zoom: number
  setZoom: (z: number) => void
  fitTick: number
  snap: boolean
  showGrid: boolean
  setSelection: (ids: string[]) => void
  setDoc: (fn: (d: Doc) => Doc, record?: boolean, key?: string) => void
  checkpoint: () => void
  onToolDone: () => void
  onAddIcon: (iconId: string, at: Pt) => void
  onCreateText: (at: Pt) => void
  onExample: () => void
}

export function Canvas(props: CanvasProps) {
  const { doc, selection, tool, zoom, snap, showGrid, setSelection, setDoc, checkpoint } = props
  const iconsV = useIconCacheVersion()
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const zoomRef = useRef(zoom)
  const setZoomRef = useRef(props.setZoom)
  const anchor = useRef<{ bx: number; by: number; cx: number; cy: number } | null>(null)

  useEffect(() => {
    zoomRef.current = zoom
    setZoomRef.current = props.setZoom
  })

  const selected = useMemo(() => doc.items.filter((i) => selection.includes(i.id)), [doc.items, selection])

  const toBoard = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const m = svgRef.current?.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }, [])
  const toBoardRef = useRef(toBoard)

  const snapV = (n: number) => (snap ? Math.round(n / GRID) * GRID : n)
  const snapP = (p: Pt): Pt => ({ x: snapV(p.x), y: snapV(p.y) })

  // Fit the board in view on request (and once on mount).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const pad = 96
    const z = Math.min((el.clientWidth - pad) / doc.width, (el.clientHeight - pad) / doc.height)
    setZoomRef.current(clamp(Number.isFinite(z) ? z : 1, 0.1, 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitTick])

  // Keep the point under the cursor fixed while zooming with the wheel.
  useLayoutEffect(() => {
    const a = anchor.current
    const el = stageRef.current
    const svg = svgRef.current
    if (!a || !el || !svg) return
    anchor.current = null
    const er = el.getBoundingClientRect()
    const sr = svg.getBoundingClientRect()
    el.scrollLeft += sr.left + a.bx * zoom - (er.left + a.cx)
    el.scrollTop += sr.top + a.by * zoom - (er.top + a.cy)
  }, [zoom])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const next = clamp(zoomRef.current * Math.exp(-e.deltaY * 0.0015), 0.1, 4)
      const bp = toBoardRef.current(e)
      const er = el.getBoundingClientRect()
      anchor.current = { bx: bp.x, by: bp.y, cx: e.clientX - er.left, cy: e.clientY - er.top }
      setZoomRef.current(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Hold space to pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isFormTarget(e.target)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    const blur = () => setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const patch = (id: string, fn: (it: Item) => Item) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? fn(it) : it)) }), false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      stage.setPointerCapture(e.pointerId)
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, left: stage.scrollLeft, top: stage.scrollTop }
      return
    }
    if (e.button !== 0) return
    // Ignore presses on the scrollbars and on the empty-state buttons.
    const t = e.target as Element
    if (t.closest('button')) return
    if (e.clientX > stage.getBoundingClientRect().left + stage.clientWidth) return
    if (e.clientY > stage.getBoundingClientRect().top + stage.clientHeight) return

    const p = toBoard(e)
    stage.setPointerCapture(e.pointerId)

    if (tool === 'text') {
      props.onCreateText(snapP(p))
      drag.current = null
      return
    }
    if (tool !== 'select') {
      drag.current = { kind: 'create', tool, start: snapP(p), id: null }
      return
    }

    const handle = t.closest('[data-handle]')?.getAttribute('data-handle')
    const only = selected.length === 1 ? selected[0] : null
    if (handle && only) {
      if (handle === 'rotate' && only.type !== 'arrow') {
        const c = centerOf(boxOf(only))
        drag.current = {
          kind: 'rotate',
          origin: only,
          center: c,
          startAngle: (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI,
          moved: false,
        }
        return
      }
      if ((handle === 'a1' || handle === 'a2') && only.type === 'arrow') {
        drag.current = { kind: 'arrowEnd', which: handle === 'a1' ? 1 : 2, origin: only, moved: false }
        return
      }
      if (only.type !== 'arrow' && handle in CURSORS) {
        drag.current = { kind: 'resize', handle: handle as Handle, origin: only, moved: false }
        return
      }
    }

    const id = t.closest('[data-id]')?.getAttribute('data-id') ?? null
    const item = id ? doc.items.find((i) => i.id === id) : undefined
    if (id && item && !item.locked) {
      let sel = selection
      if (e.shiftKey) {
        sel = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]
        setSelection(sel)
        if (!sel.includes(id)) {
          drag.current = null
          return
        }
      } else if (!selection.includes(id)) {
        sel = [id]
        setSelection(sel)
      }
      drag.current = {
        kind: 'move',
        start: p,
        origin: new Map(doc.items.filter((i) => sel.includes(i.id)).map((i) => [i.id, i])),
        primary: id,
        moved: false,
        shift: e.shiftKey,
      }
      return
    }

    if (!e.shiftKey) setSelection([])
    drag.current = { kind: 'marquee', start: p, base: e.shiftKey ? selection : [], moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      const stage = stageRef.current
      if (stage) {
        stage.scrollLeft = d.left - (e.clientX - d.sx)
        stage.scrollTop = d.top - (e.clientY - d.sy)
      }
      return
    }
    const p = toBoard(e)

    switch (d.kind) {
      case 'move': {
        let dx = p.x - d.start.x
        let dy = p.y - d.start.y
        if (!d.moved) {
          if (Math.hypot(dx, dy) * zoom < 3) return
          d.moved = true
          checkpoint()
        }
        if (snap) {
          const o = boxOf(d.origin.get(d.primary)!)
          dx = snapV(o.x + dx) - o.x
          dy = snapV(o.y + dy) - o.y
        }
        setDoc(
          (doc0) => ({
            ...doc0,
            items: doc0.items.map((it) => {
              const o = d.origin.get(it.id)
              return o ? translateItem(o, dx, dy) : it
            }),
          }),
          false,
        )
        break
      }
      case 'resize': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const lock = (d.origin.type === 'icon') !== e.shiftKey
        const next = resizeItem(d.origin, d.handle, snap ? snapP(p) : p, lock)
        patch(d.origin.id, () => next)
        break
      }
      case 'rotate': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const ang = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI
        let rot = d.origin.rotation + (ang - d.startAngle)
        if (e.shiftKey) rot = Math.round(rot / 15) * 15
        rot = Math.round((((rot % 360) + 360) % 360) * 10) / 10
        patch(d.origin.id, (it) => (it.type === 'arrow' ? it : { ...it, rotation: rot }))
        break
      }
      case 'arrowEnd': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const other = d.which === 1 ? { x: d.origin.x2, y: d.origin.y2 } : { x: d.origin.x1, y: d.origin.y1 }
        const q = e.shiftKey ? snapAngle(other, p) : snapP(p)
        patch(d.origin.id, (it) =>
          it.type !== 'arrow' ? it : d.which === 1 ? { ...it, x1: q.x, y1: q.y } : { ...it, x2: q.x, y2: q.y },
        )
        break
      }
      case 'create': {
        if (!d.id) {
          if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * zoom < 4) return
          checkpoint()
          const made = d.tool === 'arrow' ? newArrow(d.start) : newShape(d.tool, d.start)
          d.id = made.id
          setDoc((doc0) => ({ ...doc0, items: [...doc0.items, made] }), false)
          setSelection([made.id])
        }
        const id = d.id
        const q = snapP(p)
        patch(id, (it) => {
          if (it.type === 'arrow') {
            const end = e.shiftKey ? snapAngle(d.start, p) : q
            return { ...it, x2: end.x, y2: end.y }
          }
          if (it.type === 'shape') {
            let w = q.x - d.start.x
            let h = q.y - d.start.y
            if (e.shiftKey) {
              const s = Math.max(Math.abs(w), Math.abs(h))
              w = Math.sign(w || 1) * s
              h = Math.sign(h || 1) * s
            }
            return { ...it, x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) }
          }
          return it
        })
        break
      }
      case 'marquee': {
        if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) * zoom < 3) return
        d.moved = true
        const r: Rect = {
          x: Math.min(d.start.x, p.x),
          y: Math.min(d.start.y, p.y),
          w: Math.abs(p.x - d.start.x),
          h: Math.abs(p.y - d.start.y),
        }
        setMarquee(r)
        const hit = doc.items.filter((it) => !it.hidden && !it.locked && rectsIntersect(aabbOf(it), r)).map((i) => i.id)
        setSelection(Array.from(new Set([...d.base, ...hit])))
        break
      }
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    const stage = stageRef.current
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
    if (!d) return
    if (d.kind === 'marquee') setMarquee(null)
    if (d.kind === 'move' && !d.moved && !d.shift && selection.length > 1) setSelection([d.primary])
    if (d.kind === 'create' && d.id) props.onToolDone()
  }

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ICON_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(ICON_MIME)
    if (!id) return
    e.preventDefault()
    props.onAddIcon(id, snapP(toBoard(e)))
  }

  const cursor = spaceDown ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'
  const W = doc.width * zoom
  const H = doc.height * zoom

  return (
    <div
      className="stage"
      ref={stageRef}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="stage-inner">
        <div className="board-wrap" style={{ width: W, height: H }}>
          <svg
            ref={svgRef}
            className="board"
            width={W}
            height={H}
            viewBox={`0 0 ${doc.width} ${doc.height}`}
            role="img"
            aria-label={`Figure board, ${doc.width} by ${doc.height}`}
          >
            <defs>
              <pattern id="dots" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                <circle cx={GRID} cy={GRID} r={Math.max(0.6, 1 / zoom)} className="grid-dot" />
              </pattern>
              <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
                <rect width="16" height="16" fill="#fff" />
                <rect width="8" height="8" fill="#E3EAEE" />
                <rect x="8" y="8" width="8" height="8" fill="#E3EAEE" />
              </pattern>
            </defs>
            <rect width={doc.width} height={doc.height} fill={doc.transparent ? 'url(#checker)' : doc.background} />
            {showGrid && zoom >= 0.5 && (
              <rect width={doc.width} height={doc.height} fill="url(#dots)" pointerEvents="none" />
            )}
            <g>
              {doc.items.map((it) => (it.hidden ? null : <ItemView key={it.id} item={it} zoom={zoom} v={iconsV} />))}
            </g>
            <Overlay items={selected} zoom={zoom} />
            {marquee && (
              <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
          </svg>

          {doc.items.length === 0 && (
            <div className="empty">
              <h2>Start with an icon</h2>
              <p>
                Click or drag anything from the library on the left. Add labels and arrows from the toolbar above.
              </p>
              <button type="button" className="btn" onClick={props.onExample}>
                Load an example figure
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
