import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  aabbOf,
  arrowParts,
  bendFromPoint,
  boxOf,
  centerOf,
  fontFamily,
  iconLayout,
  lineSpans,
  measureText,
  rectsIntersect,
  resizeItem,
  snapAngle,
  snapToItems,
  transformAttr,
  translateItem,
  unionAabb,
} from './geometry'
import { expandGroups } from './groups'
import { getIcon, ICON_BY_ID, iconDataUri, resolveColors, scopeIds, useIconCacheVersion } from './icons'
import { detachOutside, targetAt } from './connectors'
import { newArrow, newLine, newMembrane, newShape } from './defaults'
import { lipidTransform, membraneLayout } from './membrane'
import { COLOR_VISION } from './colorvision'
import { chartEls } from './charts'
import { shapeEls } from './shapes'
import { t, useLang } from './i18n'
import { ICON_MIME } from './iconFilter'
import { markerNumber } from './markers'
import type { ArrowItem, ChartItem, ColorVision, Doc, Handle, IconItem, ImageItem, Item, MembraneItem, Pt, Rect, ShapeItem, TextItem, Tool } from './types'
import type { Guide } from './geometry'
import { clamp, isFormTarget } from './util'

type Drag =
  | { kind: 'move'; start: Pt; origin: Map<string, Item>; primary: string; moved: boolean; shift: boolean }
  | { kind: 'resize'; handle: Handle; origin: IconItem | ImageItem | ShapeItem | TextItem | ChartItem; moved: boolean }
  | { kind: 'rotate'; origin: IconItem | ImageItem | ShapeItem | TextItem | ChartItem; center: Pt; startAngle: number; moved: boolean }
  | { kind: 'arrowEnd'; which: 1 | 2; origin: ArrowItem; moved: boolean }
  | { kind: 'arrowBend'; origin: ArrowItem; moved: boolean }
  | { kind: 'create'; tool: CreateTool; start: Pt; id: string | null; from: string | null }
  /** A polygon or curve being drawn: each click drops a corner, and the shape lives on as we go. */
  | { kind: 'draft'; tool: 'poly' | 'path'; id: string | null; pts: Pt[] }
  | { kind: 'lineEnd'; which: 1 | 2; origin: MembraneItem; moved: boolean }
  | { kind: 'lineBend'; origin: MembraneItem; moved: boolean }
  | { kind: 'marquee'; start: Pt; base: string[]; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; left: number; top: number }

type CreateTool = 'arrow' | 'line' | 'rect' | 'ellipse' | 'membrane' | 'bracket' | 'brace' | 'callout'
/** A click on the first corner closes a polygon; double-click or Enter finishes either kind. */
const CLOSE_PX = 10

const GRID = 8
/** How close, in screen pixels, a pointer has to be to an item for an arrow end to attach to it. */
const ATTACH_PX = 6
/** How close, in screen pixels, two edges have to be for a smart guide to grab them. */
const GUIDE_PX = 6
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

const IconView = memo(function IconView({ item, v }: { item: IconItem; v: number }) {
  void v // changes when an icon finishes loading, so memoised rows redraw
  const meta = ICON_BY_ID.get(item.iconId)
  const parsed = getIcon(item.iconId)
  // Colour swapping and id scoping are string work; keep the result until the icon or its colours change.
  const html = useMemo(
    () =>
      parsed?.status === 'ready' && parsed.inline
        ? scopeIds(resolveColors(parsed.inner, parsed.palette, item.colors), item.id)
        : '',
    [parsed, item.colors, item.id],
  )
  const uri = useMemo(
    () => (parsed?.status === 'ready' && !parsed.inline ? iconDataUri(item.iconId, parsed, item.colors) : ''),
    [parsed, item.colors, item.iconId],
  )
  if (!meta) return null
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
          <g dangerouslySetInnerHTML={{ __html: html }} />
        </g>
      )}
      {parsed?.status === 'ready' && !parsed.inline && (
        <image
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          preserveAspectRatio="none"
          xlinkHref={uri}
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
})

/** A membrane: the lipid is drawn once in a <defs>, and every lipid along the line is a <use> of it. */
const MembraneView = memo(function MembraneView({ item, zoom }: { item: MembraneItem; zoom: number; v: number }) {
  const meta = ICON_BY_ID.get(item.iconId)
  const parsed = getIcon(item.iconId)
  const layout = membraneLayout(item)
  const lid = `lipid-${item.id}`
  const ready = parsed?.status === 'ready' ? parsed : null
  const html = ready?.inline ? scopeIds(resolveColors(ready.inner, ready.palette, item.colors), item.id) : ''
  const uri = ready && !ready.inline ? iconDataUri(item.iconId, ready, item.colors) : ''
  const vb = meta?.viewBox
  return (
    <g data-id={item.id} data-locked={item.locked || undefined} opacity={item.opacity < 1 ? item.opacity : undefined}>
      <path
        d={layout.d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(layout.thickness, 14 / zoom)}
        strokeLinecap="round"
        pointerEvents="stroke"
      />
      {ready && vb && (
        <g pointerEvents="none">
          <defs>
            {ready.inline ? (
              <g id={lid} transform={`scale(${1 / vb[2]} ${1 / vb[3]}) translate(${-vb[0]} ${-vb[1]})`} clipPath={`url(#clip-${lid})`}>
                <clipPath id={`clip-${lid}`}>
                  <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} />
                </clipPath>
                <g dangerouslySetInnerHTML={{ __html: html }} />
              </g>
            ) : (
              <image id={lid} x={0} y={0} width={1} height={1} preserveAspectRatio="none" href={uri} />
            )}
          </defs>
          {layout.lipids.map((l, i) => (
            <use key={i} href={`#${lid}`} transform={lipidTransform(l)} />
          ))}
        </g>
      )}
    </g>
  )
})

const ItemView = memo(function ItemView({ item, zoom, v, doc }: { item: Item; zoom: number; v: number; doc: Doc }) {
  switch (item.type) {
    case 'icon':
      return <IconView item={item} v={v} />
    case 'image':
      return (
        <g
          data-id={item.id}
          transform={transformAttr(item, item.flipX)}
          opacity={item.opacity < 1 ? item.opacity : undefined}
          data-locked={item.locked || undefined}
        >
          <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" />
          <image
            x={item.x}
            y={item.y}
            width={item.w}
            height={item.h}
            preserveAspectRatio="none"
            xlinkHref={item.src}
            pointerEvents="none"
          />
        </g>
      )
    case 'shape': {
      return (
        <g
          data-id={item.id}
          transform={transformAttr(item)}
          opacity={item.opacity < 1 ? item.opacity : undefined}
          data-locked={item.locked || undefined}
        >
          {shapeEls(item).map((el, k) =>
            el.kind === 'rect' ? (
              <rect key={k} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx || undefined} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
            ) : el.kind === 'ellipse' ? (
              <ellipse key={k} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
            ) : (
              <path key={k} d={el.d} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
            ),
          )}
        </g>
      )
    }
    case 'chart': {
      const els = chartEls(item)
      return (
        <g data-id={item.id} transform={transformAttr(item)} opacity={item.opacity < 1 ? item.opacity : undefined} data-locked={item.locked || undefined}>
          <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" />
          <g pointerEvents="none">
            {els.map((el, k) =>
              el.kind === 'rect' ? (
                <rect key={k} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx || undefined} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
              ) : el.kind === 'line' ? (
                <line key={k} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} strokeDasharray={el.dash} />
              ) : el.kind === 'circle' ? (
                <circle key={k} cx={el.cx} cy={el.cy} r={el.r} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
              ) : el.kind === 'path' ? (
                <path key={k} d={el.d} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth || undefined} />
              ) : (
                <text
                  key={k}
                  x={el.x}
                  y={el.y}
                  fontFamily={fontFamily('sans')}
                  fontSize={el.size}
                  fill={el.fill}
                  textAnchor={el.anchor}
                  transform={el.rotate ? `rotate(${el.rotate} ${el.x} ${el.y})` : undefined}
                >
                  {el.text}
                </text>
              ),
            )}
          </g>
        </g>
      )
    }
    case 'marker': {
      return (
        <g data-id={item.id} opacity={undefined} data-locked={item.locked || undefined}>
          <circle
            cx={item.x}
            cy={item.y}
            r={item.size / 2}
            fill={item.fill}
            stroke={item.strokeWidth > 0 ? item.stroke : 'none'}
            strokeWidth={item.strokeWidth || undefined}
          />
          <text
            x={item.x}
            y={item.y}
            fontFamily={fontFamily('sans')}
            fontSize={item.fontSize}
            fontWeight={700}
            fill={item.textFill}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {markerNumber(doc, item.id)}
          </text>
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
            fontFamily={fontFamily(item.font)}
            fontSize={item.fontSize}
            fontWeight={item.bold ? 700 : undefined}
            fontStyle={item.italic ? 'italic' : undefined}
            fill={item.fill}
            textAnchor={anchor}
            pointerEvents="none"
            style={{ whiteSpace: 'pre' }}
          >
            {m.lines.flatMap((line, i) =>
              lineSpans(line, ax, item.y + i * lh + item.fontSize * 0.95, item.fontSize).map((sp, j) => (
                <tspan key={`${i}:${j}`} x={sp.x} y={sp.y} dy={sp.dy} fontSize={sp.size}>
                  {sp.text}
                </tspan>
              )),
            )}
          </text>
        </g>
      )
    }
    case 'membrane':
      return <MembraneView item={item} zoom={zoom} v={v} />
    case 'arrow': {
      const { d, hit, heads } = arrowParts(item)
      return (
        <g data-id={item.id} data-locked={item.locked || undefined}>
          <path
            d={hit}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(item.strokeWidth, 14 / zoom)}
            pointerEvents="stroke"
          />
          <g pointerEvents="none">
            <path
              d={d}
              fill="none"
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
              strokeLinejoin="round"
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

/** Outline around the item an arrow end would attach to. */
function ConnectHighlight({ item, zoom }: { item: Item; zoom: number }) {
  if (item.type === 'arrow' || item.type === 'membrane') return null
  const b = boxOf(item)
  const c = centerOf(b)
  const pad = 3 / zoom
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${b.rotation})`} pointerEvents="none">
      {item.type === 'shape' && item.shape === 'ellipse' ? (
        <ellipse className="connect-target" rx={b.w / 2 + pad} ry={b.h / 2 + pad} vectorEffect="non-scaling-stroke" />
      ) : (
        <rect
          className="connect-target"
          x={-b.w / 2 - pad}
          y={-b.h / 2 - pad}
          width={b.w + 2 * pad}
          height={b.h + 2 * pad}
          rx={3 / zoom}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}

function Overlay({ items, zoom }: { items: Item[]; zoom: number }) {
  if (items.length === 0) return null
  const hs = 9 / zoom

  if (items.length === 1) {
    const it = items[0]
    if (it.type === 'arrow') {
      const { hit, handle: mid } = arrowParts(it)
      return (
        <g>
          <path className="sel-line" d={hit} fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {it.kind !== 'straight' && (
            <rect
              className="handle"
              data-handle="bend"
              x={mid.x - hs / 2}
              y={mid.y - hs / 2}
              width={hs}
              height={hs}
              transform={`rotate(45 ${mid.x} ${mid.y})`}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'move' }}
            />
          )}
          {([1, 2] as const).map((w) => (
            <circle
              key={w}
              className={(w === 1 ? it.from : it.to) ? 'handle handle-attached' : 'handle'}
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
    if (it.type === 'membrane') {
      const { d, peak } = membraneLayout(it)
      return (
        <g>
          <path className="sel-line" d={d} fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <rect
            className="handle"
            data-handle="bend"
            x={peak.x - hs / 2}
            y={peak.y - hs / 2}
            width={hs}
            height={hs}
            transform={`rotate(45 ${peak.x} ${peak.y})`}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
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
  /** Bumped to ask for the selection, rather than the whole board, to fill the view. */
  zoomSelTick: number
  /** Screen only. Exports always keep the real colours. */
  colorVision: ColorVision
  snap: boolean
  showGrid: boolean
  setSelection: (ids: string[]) => void
  setDoc: (fn: (d: Doc) => Doc, record?: boolean, key?: string) => void
  checkpoint: () => void
  onToolDone: () => void
  onAddIcon: (iconId: string, at: Pt) => void
  onCreateText: (at: Pt) => void
  onExample: () => void
  onImportFiles: (files: File[], at: Pt) => void
}

export function Canvas(props: CanvasProps) {
  useLang()
  const { doc, selection, tool, zoom, snap, showGrid, setSelection, setDoc, checkpoint } = props
  const { colorVision } = props
  const { setZoom } = props
  const iconsV = useIconCacheVersion()
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<{ v: Guide[]; h: Guide[] }>({ v: [], h: [] })
  const [spaceDown, setSpaceDown] = useState(false)
  /** The item an arrow end would attach to right now (highlighted while drawing or dragging an end). */
  const [connectTo, setConnectTo] = useState<string | null>(null)
  const zoomRef = useRef(zoom)
  const setZoomRef = useRef(props.setZoom)
  const anchor = useRef<{ bx: number; by: number; cx: number; cy: number } | null>(null)

  useEffect(() => {
    zoomRef.current = zoom
    setZoomRef.current = props.setZoom
  })

  const selected = useMemo(() => doc.items.filter((i) => selection.includes(i.id)), [doc.items, selection])

  useEffect(() => {
    if (tool !== 'arrow') setConnectTo(null)
  }, [tool])

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

  // Fill the view with the selection instead of the whole board.
  useEffect(() => {
    if (props.zoomSelTick === 0) return
    const el = stageRef.current
    const svg = svgRef.current
    const sel = doc.items.filter((i) => selection.includes(i.id) && !i.hidden)
    if (!el || !svg || sel.length === 0) return
    const r = unionAabb(sel)
    const pad = 96
    const z = clamp(
      Math.min((el.clientWidth - pad) / Math.max(r.w, 1), (el.clientHeight - pad) / Math.max(r.h, 1)),
      0.1,
      4,
    )
    setZoom(z)
    const er = el.getBoundingClientRect()
    const sr = svg.getBoundingClientRect()
    el.scrollLeft += sr.left + (r.x + r.w / 2) * z - (er.left + el.clientWidth / 2)
    el.scrollTop += sr.top + (r.y + r.h / 2) * z - (er.top + el.clientHeight / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomSelTick])

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

  // Enter finishes a shape being drawn; Escape gives up on it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (drag.current?.kind !== 'draft') return
      if (e.key === 'Enter') {
        e.preventDefault()
        finishDraft()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        const id = drag.current.id
        drag.current = null
        if (id) setDoc((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))
        props.onToolDone()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.onToolDone])

  const patch = (id: string, fn: (it: Item) => Item) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? fn(it) : it)) }), false)

  /** Keeps the shape being drawn inside the box that covers its corners. */
  const updateDraft = (cursor: Pt) => {
    const d = drag.current
    if (d?.kind !== 'draft' || !d.id) return
    const all = [...d.pts, cursor]
    const x = Math.min(...all.map((q) => q.x))
    const y = Math.min(...all.map((q) => q.y))
    const w = Math.max(...all.map((q) => q.x)) - x
    const h = Math.max(...all.map((q) => q.y)) - y
    const pad = 6 / zoom
    patch(d.id, (it) =>
      it.type === 'shape'
        ? { ...it, x: x - pad, y: y - pad, w: Math.max(1, w + pad * 2), h: Math.max(1, h + pad * 2), points: d.pts.map((q) => [(q.x - x + pad) / Math.max(1, w + pad * 2), (q.y - y + pad) / Math.max(1, h + pad * 2)] as [number, number]), }
        : it,
    )
  }

  /** Ends a shape being drawn and hands the tool back so it can start the next one. */
  const finishDraft = () => {
    drag.current = null
    setDoc((d) => d)
    props.onToolDone()
  }

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
    const target = e.target as Element
    if (target.closest('button')) return
    if (e.clientX > stage.getBoundingClientRect().left + stage.clientWidth) return
    if (e.clientY > stage.getBoundingClientRect().top + stage.clientHeight) return

    const p = toBoard(e)
    stage.setPointerCapture(e.pointerId)

    if (tool === 'text') {
      props.onCreateText(snapP(p))
      drag.current = null
      return
    }
    // Adding a corner to the shape being drawn. Clicking the first corner again closes a polygon.
    const drafting = drag.current?.kind === 'draft' ? drag.current : null
    if (tool === 'poly' || tool === 'path') {
      const q = snapP(p)
      if (drafting) {
        const first = drafting.pts[0]
        const closes = drafting.pts.length >= 3 && Math.hypot(q.x - first.x, q.y - first.y) * zoom < CLOSE_PX
        if (closes || e.detail >= 2) {
          finishDraft()
          return
        }
        drafting.pts.push(q)
        updateDraft(q)
        return
      }
      checkpoint()
      const made = newShape(tool, q)
      drag.current = { kind: 'draft', tool, id: made.id, pts: [q] }
      setDoc((doc0) => ({ ...doc0, items: [...doc0.items, made] }))
      setSelection([made.id])
      return
    }
    if (drafting) {
      // Any other tool ends a shape left half-drawn rather than leaving it behind.
      finishDraft()
    }
    if (tool !== 'select') {
      const from = (tool === 'arrow' || tool === 'line') && !e.altKey ? targetAt(doc, p, ATTACH_PX / zoom) : null
      drag.current = { kind: 'create', tool, start: snapP(p), id: null, from: from?.id ?? null }
      return
    }

    const handle = target.closest('[data-handle]')?.getAttribute('data-handle')
    const only = selected.length === 1 ? selected[0] : null
    if (handle && only) {
      if (handle === 'rotate' && only.type !== 'arrow' && only.type !== 'membrane' && only.type !== 'marker') {
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
      if (handle === 'bend' && only.type === 'arrow') {
        drag.current = { kind: 'arrowBend', origin: only, moved: false }
        return
      }
      if ((handle === 'a1' || handle === 'a2') && only.type === 'membrane') {
        drag.current = { kind: 'lineEnd', which: handle === 'a1' ? 1 : 2, origin: only, moved: false }
        return
      }
      if (handle === 'bend' && only.type === 'membrane') {
        drag.current = { kind: 'lineBend', origin: only, moved: false }
        return
      }
      if (only.type !== 'arrow' && only.type !== 'membrane' && only.type !== 'marker' && handle in CURSORS) {
        drag.current = { kind: 'resize', handle: handle as Handle, origin: only, moved: false }
        return
      }
    }

    const id = target.closest('[data-id]')?.getAttribute('data-id') ?? null
    const item = id ? doc.items.find((i) => i.id === id) : undefined
    if (id && item && !item.locked) {
      const members = expandGroups(doc.items, [id])
      let sel = selection
      if (e.altKey) {
        // Alt-click reaches into a group and picks just this item.
        sel = [id]
        setSelection(sel)
      } else if (e.shiftKey) {
        sel = selection.includes(id)
          ? selection.filter((s) => !members.includes(s))
          : Array.from(new Set([...selection, ...members]))
        setSelection(sel)
        if (!sel.includes(id)) {
          drag.current = null
          return
        }
      } else if (!selection.includes(id)) {
        sel = members
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
    if (!d) {
      // With the arrow tool, show which item a press would start the arrow on.
      const hit = tool === 'arrow' && !e.altKey ? targetAt(doc, toBoard(e), ATTACH_PX / zoom) : null
      setConnectTo((prev) => (prev === (hit?.id ?? null) ? prev : (hit?.id ?? null)))
      return
    }
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
        const moving = new Set(d.origin.keys())
        // Line the moving box up with whatever else is on the board, then fall back to the
        // grid only if that lands closer than the objects do.
        const base = unionAabb([...d.origin.values()])
        const targets = [
          ...doc.items.filter((it) => !moving.has(it.id) && !it.hidden).map(aabbOf),
          { x: 0, y: 0, w: doc.width, h: doc.height },
        ]
        const s = snapToItems({ ...base, x: base.x + dx, y: base.y + dy }, targets, GUIDE_PX / zoom)
        const anchor = d.origin.get(d.primary)
        const gb = anchor ? boxOf(anchor) : base
        // Both are extra nudges on top of dx/dy, so they can be compared and added the same way.
        const gx = snap ? snapV(gb.x + dx) - (gb.x + dx) : 0
        const gy = snap ? snapV(gb.y + dy) - (gb.y + dy) : 0
        // The grid only wins where no object caught the box, or where it lands closer.
        const useGridX = snap && (s.v.length === 0 || Math.abs(gx) < Math.abs(s.dx))
        const useGridY = snap && (s.h.length === 0 || Math.abs(gy) < Math.abs(s.dy))
        dx += useGridX ? gx : s.dx
        dy += useGridY ? gy : s.dy
        setGuides({ v: useGridX ? [] : s.v, h: useGridY ? [] : s.h })
        setDoc(
          (doc0) => ({
            ...doc0,
            items: doc0.items.map((it) => {
              const o = d.origin.get(it.id)
              if (!o) return it
              const moved = translateItem(o, dx, dy)
              // An arrow dragged without the items it is attached to comes loose from them.
              return moved.type === 'arrow' ? detachOutside(moved, moving) : moved
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
        const lock = (d.origin.type === 'icon' || d.origin.type === 'image') !== e.shiftKey
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
        const otherId = d.which === 1 ? d.origin.to?.id : d.origin.from?.id
        // Over an item the end attaches to it (hold Alt to leave it free); anywhere else it comes loose.
        const hit = e.altKey ? null : targetAt(doc, p, ATTACH_PX / zoom, otherId)
        setConnectTo(hit?.id ?? null)
        const q = hit ? p : e.shiftKey ? snapAngle(other, p) : snapP(p)
        const was = d.which === 1 ? d.origin.from : d.origin.to
        const anchor = hit ? (was?.id === hit.id ? was : { id: hit.id }) : undefined
        patch(d.origin.id, (it) => {
          if (it.type !== 'arrow') return it
          return d.which === 1 ? { ...it, x1: q.x, y1: q.y, from: anchor } : { ...it, x2: q.x, y2: q.y, to: anchor }
        })
        break
      }
      case 'lineEnd': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const other = d.which === 1 ? { x: d.origin.x2, y: d.origin.y2 } : { x: d.origin.x1, y: d.origin.y1 }
        const q = e.shiftKey ? snapAngle(other, p) : snapP(p)
        patch(d.origin.id, (it) => {
          if (it.type !== 'membrane') return it
          return d.which === 1 ? { ...it, x1: q.x, y1: q.y } : { ...it, x2: q.x, y2: q.y }
        })
        break
      }
      case 'lineBend': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const curve = { ...d.origin, kind: 'curve' as const, axis: 'h' as const }
        const bend = Math.round(bendFromPoint(curve, snap ? snapP(p) : p) * 100) / 100
        patch(d.origin.id, (it) => (it.type === 'membrane' ? { ...it, bend } : it))
        break
      }
      case 'arrowBend': {
        if (!d.moved) {
          d.moved = true
          checkpoint()
        }
        const bend = Math.round(bendFromPoint(d.origin, snap ? snapP(p) : p) * 100) / 100
        patch(d.origin.id, (it) => (it.type === 'arrow' ? { ...it, bend } : it))
        break
      }
      case 'create': {
        if (!d.id) {
          if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * zoom < 4) return
          checkpoint()
          const made =
            d.tool === 'arrow'
              ? { ...newArrow(d.start), from: d.from ? { id: d.from } : undefined }
              : d.tool === 'line'
                ? { ...newLine(d.start), from: d.from ? { id: d.from } : undefined }
                : d.tool === 'membrane'
                  ? newMembrane(d.start)
                  : newShape(d.tool, d.start)
          d.id = made.id
          setDoc((doc0) => ({ ...doc0, items: [...doc0.items, made] }), false)
          setSelection([made.id])
        }
        const id = d.id
        const q = snapP(p)
        const hit = (d.tool === 'arrow' || d.tool === 'line') && !e.altKey ? targetAt(doc, p, ATTACH_PX / zoom, d.from ?? undefined) : null
        setConnectTo(hit?.id ?? null)
        patch(id, (it) => {
          if (it.type === 'arrow') {
            const end = hit ? p : e.shiftKey ? snapAngle(d.start, p) : q
            return { ...it, x2: end.x, y2: end.y, to: hit ? { id: hit.id } : undefined }
          }
          if (it.type === 'membrane') {
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
      case 'draft':
        updateDraft(snapP(p))
        break
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
        setSelection(Array.from(new Set([...d.base, ...expandGroups(doc.items, hit)])))
        break
      }
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const stage = stageRef.current
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
    // A shape being drawn corner by corner survives the pointer coming up.
    if (d?.kind === 'draft') return
    drag.current = null
    setGuides({ v: [], h: [] })
    if (!d) return
    if (d.kind === 'marquee') setMarquee(null)
    setConnectTo(null)
    if (d.kind === 'move' && !d.moved && !d.shift && selection.length > 1) setSelection(expandGroups(doc.items, [d.primary]))
    if (d.kind === 'create' && d.id) props.onToolDone()
  }

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ICON_MIME) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(ICON_MIME)
    if (!id) {
      if (e.dataTransfer.files.length) {
        e.preventDefault()
        props.onImportFiles(Array.from(e.dataTransfer.files), snapP(toBoard(e)))
      }
      return
    }
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
            filter={colorVision === 'normal' ? undefined : 'url(#colour-vision)'}
            role="img"
            aria-label={t('Figure board, {w} by {h}', { w: doc.width, h: doc.height })}
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
              {colorVision !== 'normal' && (
                <filter id="colour-vision" colorInterpolationFilters="linearRGB">
                  <feColorMatrix type="matrix" values={COLOR_VISION[colorVision].values} />
                </filter>
              )}
            </defs>
            <rect width={doc.width} height={doc.height} fill={doc.transparent ? 'url(#checker)' : doc.background} />
            {showGrid && zoom >= 0.5 && (
              <rect width={doc.width} height={doc.height} fill="url(#dots)" pointerEvents="none" />
            )}
            <g>
              {doc.items.map((it) => (it.hidden ? null : <ItemView key={it.id} item={it} zoom={zoom} v={iconsV} doc={doc} />))}
            </g>
            <Overlay items={selected} zoom={zoom} />
            {(guides.v.length > 0 || guides.h.length > 0) && (
              <g pointerEvents="none">
                {guides.v.map((g, i) => (
                  <line
                    key={`v${i}`}
                    className="guide"
                    x1={g.at}
                    y1={g.from}
                    x2={g.at}
                    y2={g.to}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {guides.h.map((g, i) => (
                  <line
                    key={`h${i}`}
                    className="guide"
                    x1={g.from}
                    y1={g.at}
                    x2={g.to}
                    y2={g.at}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
            {connectTo && (() => {
              const target = doc.items.find((i) => i.id === connectTo)
              return target ? <ConnectHighlight item={target} zoom={zoom} /> : null
            })()}
            {marquee && (
              <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
          </svg>

          {doc.items.length === 0 && (
            <div className="empty">
              <h2>{t('Start with an icon')}</h2>
              <p>
                {t('Click or drag anything from the library on the left. Add labels and arrows from the toolbar above.')}
              </p>
              <button type="button" className="btn" onClick={props.onExample}>
                {t('Load an example figure')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
