import { CHART_COLORS } from './charts'
import { measureText } from './geometry'
import { t } from './i18n'
import { ICON_BY_ID } from './icons'
import { DEFAULT_LIPID } from './membrane'
import { defaultPoints } from './shapes'
import type { ArrowItem, ChartItem, Doc, IconItem, IconMeta, ImageItem, Item, MarkerItem, MembraneItem, Pt, ShapeItem, TextItem } from './types'

export const uid = () => Math.random().toString(36).slice(2, 9)

export const INK = '#13262F'

/** Labels are English keys; show them with t(). */
export const ARTBOARDS = [
  { id: 'landscape', label: 'Landscape, 1200 × 800', w: 1200, h: 800 },
  { id: 'slide', label: 'Slide 16:9, 1280 × 720', w: 1280, h: 720 },
  { id: 'a4', label: 'A4 landscape, 1123 × 794', w: 1123, h: 794 },
  { id: 'square', label: 'Square, 1000 × 1000', w: 1000, h: 1000 },
  { id: 'column', label: 'Journal column, 600 × 800', w: 600, h: 800 },
]

export const emptyDoc = (): Doc => ({
  title: t('Untitled figure'),
  width: 1200,
  height: 800,
  background: '#FFFFFF',
  transparent: false,
  items: [],
})

export function newIcon(meta: IconMeta, center: Pt, maxSize = 150): IconItem {
  const [, , vw, vh] = meta.viewBox
  const s = maxSize / Math.max(vw, vh)
  const w = vw * s
  const h = vh * s
  return {
    type: 'icon',
    id: uid(),
    iconId: meta.id,
    x: center.x - w / 2,
    y: center.y - h / 2,
    w,
    h,
    rotation: 0,
    flipX: false,
    opacity: 1,
  }
}

export const newText = (at: Pt, text = t('Text'), fontSize = 24): TextItem => ({
  type: 'text',
  id: uid(),
  x: at.x,
  y: at.y,
  rotation: 0,
  text,
  fontSize,
  fill: INK,
  bold: false,
  italic: false,
  align: 'left',
})

export const newShape = (shape: ShapeItem['shape'], at: Pt): ShapeItem => ({
  type: 'shape',
  id: uid(),
  shape,
  x: at.x,
  y: at.y,
  w: 1,
  h: 1,
  rotation: 0,
  fill: shape === 'bracket' || shape === 'brace' || shape === 'path' ? 'none' : '#DCE7EE',
  stroke: INK,
  strokeWidth: 2,
  opacity: 1,
  radius: 0,
  ...(shape === 'poly' || shape === 'path' ? { points: defaultPoints(shape), smooth: shape === 'path' } : null),
})

/** A plain line is an arrow with no head, so it attaches to items and exports like any other. */
export const newLine = (at: Pt): ArrowItem => ({ ...newArrow(at), head: 'none' })

export const newMarker = (at: Pt): MarkerItem => ({
  type: 'marker',
  id: uid(),
  x: at.x,
  y: at.y,
  size: 34,
  label: '',
  fill: '#463C9B',
  stroke: '#FFFFFF',
  strokeWidth: 2,
  textFill: '#FFFFFF',
  fontSize: 18,
})

/** A chart with one series and three categories, ready to be filled in from Properties. */
export const newChart = (center: Pt, w = 380, h = 300): ChartItem => ({
  type: 'chart',
  id: uid(),
  x: center.x - w / 2,
  y: center.y - h / 2,
  w,
  h,
  rotation: 0,
  opacity: 1,
  title: '',
  yLabel: t('Signal'),
  xLabel: '',
  xNames: ['A', 'B', 'C'],
  series: [{ name: t('Series 1'), color: CHART_COLORS[0], values: [3, 5, 4] }],
  kind: 'bar',
  yMax: 0,
  showGrid: true,
})

export const newArrow = (at: Pt): ArrowItem => ({
  type: 'arrow',
  id: uid(),
  x1: at.x,
  y1: at.y,
  x2: at.x,
  y2: at.y,
  stroke: INK,
  strokeWidth: 3,
  head: 'end',
  dashed: false,
  kind: 'straight',
  bend: 0.5,
  axis: 'h',
})

export const newMembrane = (at: Pt): MembraneItem => ({
  type: 'membrane',
  id: uid(),
  x1: at.x,
  y1: at.y,
  x2: at.x,
  y2: at.y,
  bend: 0,
  iconId: DEFAULT_LIPID,
  size: 22,
  layers: 2,
  gap: 3,
  spacing: 1.05,
  jitter: 0.2,
  seed: Math.floor(Math.random() * 1_000_000_000),
  opacity: 1,
  flip: false,
})

/** Starting bend value that looks right for each arrow kind. */
export const defaultBend = (kind: ArrowItem['kind']) => (kind === 'curve' ? 0.25 : 0.5)

export function newImage(src: string, nw: number, nh: number, center: Pt, extra: Partial<ImageItem> = {}, maxSize = 260): ImageItem {
  const s = Math.min(1, maxSize / Math.max(nw, nh)) || 1
  const w = Math.max(8, nw * s)
  const h = Math.max(8, nh * s)
  return {
    type: 'image',
    id: uid(),
    src,
    x: center.x - w / 2,
    y: center.y - h / 2,
    w,
    h,
    rotation: 0,
    flipX: false,
    opacity: 1,
    ...extra,
  }
}

/** A small starter figure so a new user can see how things fit together. */
export function exampleDoc(): Doc {
  const place = (id: string, cx: number, cy: number, size: number) => {
    const m = ICON_BY_ID.get(id)
    return m ? newIcon(m, { x: cx, y: cy }, size) : null
  }
  const label = (text: string, cx: number, y: number, size = 22, bold = false) => {
    const item: TextItem = { ...newText({ x: 0, y }, text, size), bold, align: 'center' }
    item.x = cx - measureText(item).w / 2
    return item
  }
  const arrow = (x1: number, y1: number, x2: number, y2: number): ArrowItem => ({
    ...newArrow({ x: x1, y: y1 }),
    x2,
    y2,
  })

  const items: (Item | null)[] = [
    { ...newText({ x: 70, y: 56 }, t('From first contact to antibody response'), 32), bold: true },
    place('microbiology-bacteria-swimming', 125, 390, 150),
    place('blood-immunology-macrophage', 365, 390, 160),
    place('blood-immunology-t-lymphocyte', 615, 390, 130),
    place('blood-immunology-b-lymphocyte', 855, 390, 130),
    place('blood-immunology-antibody-1', 1075, 390, 130),
    arrow(205, 390, 275, 390),
    arrow(455, 390, 535, 390),
    arrow(690, 390, 775, 390),
    arrow(930, 390, 1005, 390),
    label(t('Bacterium'), 125, 500),
    label(t('Macrophage'), 365, 500),
    label(t('T lymphocyte'), 615, 500),
    label(t('B lymphocyte'), 855, 500),
    label(t('Antibody'), 1075, 500),
    label(t('engulfs'), 240, 335, 17),
    label(t('presents\nantigen'), 495, 318, 17),
    label(t('activates'), 732, 335, 17),
    label(t('produces'), 967, 335, 17),
  ]
  return { ...emptyDoc(), title: t('Example figure'), items: items.filter((i): i is Item => i !== null) }
}
