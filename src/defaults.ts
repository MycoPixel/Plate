import { measureText } from './geometry'
import { ICON_BY_ID } from './icons'
import type { ArrowItem, Doc, IconItem, IconMeta, Item, Pt, ShapeItem, TextItem } from './types'

export const uid = () => Math.random().toString(36).slice(2, 9)

export const INK = '#13262F'

export const ARTBOARDS = [
  { id: 'landscape', label: 'Landscape, 1200 × 800', w: 1200, h: 800 },
  { id: 'slide', label: 'Slide 16:9, 1280 × 720', w: 1280, h: 720 },
  { id: 'a4', label: 'A4 landscape, 1123 × 794', w: 1123, h: 794 },
  { id: 'square', label: 'Square, 1000 × 1000', w: 1000, h: 1000 },
  { id: 'column', label: 'Journal column, 600 × 800', w: 600, h: 800 },
]

export const emptyDoc = (): Doc => ({
  title: 'Untitled figure',
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

export const newText = (at: Pt, text = 'Text', fontSize = 24): TextItem => ({
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

export const newShape = (shape: 'rect' | 'ellipse', at: Pt): ShapeItem => ({
  type: 'shape',
  id: uid(),
  shape,
  x: at.x,
  y: at.y,
  w: 1,
  h: 1,
  rotation: 0,
  fill: '#DCE7EE',
  stroke: INK,
  strokeWidth: 2,
  opacity: 1,
  radius: 0,
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
})

/** A small starter figure so a new user can see how things fit together. */
export function exampleDoc(): Doc {
  const place = (id: string, cx: number, cy: number, size: number) => {
    const m = ICON_BY_ID.get(id)
    return m ? newIcon(m, { x: cx, y: cy }, size) : null
  }
  const label = (text: string, cx: number, y: number, size = 22, bold = false) => {
    const t: TextItem = { ...newText({ x: 0, y }, text, size), bold, align: 'center' }
    t.x = cx - measureText(t).w / 2
    return t
  }
  const arrow = (x1: number, y1: number, x2: number, y2: number): ArrowItem => ({
    ...newArrow({ x: x1, y: y1 }),
    x2,
    y2,
  })

  const items: (Item | null)[] = [
    { ...newText({ x: 70, y: 56 }, 'From first contact to antibody response', 32), bold: true },
    place('microbiology-bacteria-swimming', 125, 390, 150),
    place('blood-immunology-macrophage', 365, 390, 160),
    place('blood-immunology-t-lymphocyte', 615, 390, 130),
    place('blood-immunology-b-lymphocyte', 855, 390, 130),
    place('blood-immunology-antibody-1', 1075, 390, 130),
    arrow(205, 390, 275, 390),
    arrow(455, 390, 535, 390),
    arrow(690, 390, 775, 390),
    arrow(930, 390, 1005, 390),
    label('Bacterium', 125, 500),
    label('Macrophage', 365, 500),
    label('T lymphocyte', 615, 500),
    label('B lymphocyte', 855, 500),
    label('Antibody', 1075, 500),
    label('engulfs', 240, 335, 17),
    label('presents\nantigen', 495, 318, 17),
    label('activates', 732, 335, 17),
    label('produces', 967, 335, 17),
  ]
  return { ...emptyDoc(), title: 'Example figure', items: items.filter((i): i is Item => i !== null) }
}
