import { emptyDoc, newIcon, newShape, newText, uid } from './defaults'
import { ICON_BY_ID } from './icons'
import type { ArrowItem, Doc, Item, Pt, ShapeItem, TextItem } from './types'

export type Template = {
  id: string
  label: string
  hint: string
  build: () => Doc
}

/** Places a library icon if the drawing is actually in the library, so a template never breaks. */
function iconAt(iconId: string, x: number, y: number, size: number): Item | null {
  const meta = ICON_BY_ID.get(iconId)
  return meta ? { ...newIcon(meta, { x, y }), w: size, h: size } : null
}

const box = (x: number, y: number, w: number, h: number, over: Partial<ShapeItem> = {}): ShapeItem => ({
  ...newShape('rect', { x, y }),
  w,
  h,
  fill: '#FFFFFF',
  stroke: '#9AAAB4',
  strokeWidth: 2,
  radius: 10,
  ...over,
})

const label = (text: string, at: Pt, fontSize: number, over: Partial<TextItem> = {}): TextItem => ({
  ...newText(at, text, fontSize),
  ...over,
})

const arrow = (x1: number, y1: number, x2: number, y2: number): ArrowItem => ({
  type: 'arrow',
  id: uid(),
  x1,
  y1,
  x2,
  y2,
  stroke: '#13262F',
  strokeWidth: 3,
  head: 'end',
  dashed: false,
  kind: 'straight',
  bend: 0.5,
  axis: 'h',
})

function doc(title: string, items: (Item | null)[]): Doc {
  return { ...emptyDoc(), title, items: items.filter((i): i is Item => !!i) }
}

/** Three stacked panels with letters, the shape most journal graphical abstracts take. */
function graphicalAbstract(): Doc {
  const items: Item[] = []
  const W = 320
  const H = 156
  for (let i = 0; i < 3; i++) {
    const y = 170 + i * (H + 44)
    items.push(box(60, y, W, H))
    items.push(label(String.fromCharCode(65 + i), { x: 60, y: y - 40 }, 32, { bold: true }))
  }
  return doc('Graphical abstract', [
    label('Graphical abstract', { x: 60, y: 66 }, 38, { bold: true }),
    ...items,
    iconAt('intracellular-components-mitochondria', 96, 200, 100),
    iconAt('nucleic-acids-a-dna', 96, 396, 116),
    iconAt('oncology-apoptosis', 96, 592, 100),
    label('Mechanism', { x: 230, y: 238 }, 22),
    label('Target', { x: 230, y: 434 }, 22),
    label('Outcome', { x: 230, y: 630 }, 22),
    arrow(360, 248, 460, 248),
    arrow(360, 444, 460, 444),
    label('leads to', { x: 470, y: 236 }, 18, { fill: '#5B6B76' }),
    label('leads to', { x: 470, y: 432 }, 18, { fill: '#5B6B76' }),
  ])
}

/** A left-to-right chain of nodes, the usual pathway figure. */
function pathway(): Doc {
  const nodes: Item[] = []
  const xs = [90, 430, 770]
  const labels = ['Receptor', 'Kinase cascade', 'Response']
  const icons = ['nucleic-acids-lentivirus-library', 'intracellular-components-ribosome', 'oncology-apoptosis']
  xs.forEach((x, i) => {
    nodes.push(box(x, 300, 190, 140, { radius: 70 }))
    nodes.push(label(labels[i], { x: x + 95, y: 375 }, 22, { align: 'center' }))
    const ic = iconAt(icons[i], x + 55, 200, 80)
    if (ic) nodes.push(ic)
  })
  return doc('Signalling pathway', [
    label('Signalling pathway', { x: 90, y: 90 }, 34, { bold: true }),
    ...nodes,
    arrow(280, 370, 430, 370),
    arrow(620, 370, 770, 370),
    label('ligand', { x: 130, y: 170 }, 20),
  ])
}

/** Four panels in a row with A-D, for a methods figure. */
function workflow(): Doc {
  const items: Item[] = []
  const W = 260
  const H = 330
  const X0 = 35
  const STEP = W + 30
  const names = ['Isolation', 'Culture', 'Treatment', 'Analysis']
  const icons = ['nucleic-acids-a-dna', 'microbiology-bacteria-swimming', 'oncology-apoptosis', 'intracellular-components-ribosome']
  for (let i = 0; i < 4; i++) {
    const x = X0 + i * STEP
    items.push(box(x, 240, W, H))
    items.push(label(String.fromCharCode(65 + i), { x, y: 194 }, 32, { bold: true }))
    items.push(label(names[i], { x: x + W / 2 - 60, y: 268 }, 22, { bold: true }))
    const ic = iconAt(icons[i], x + 70, 320, 120)
    if (ic) items.push(ic)
    items.push(label('your text here', { x: x + 40, y: 486 }, 17, { fill: '#5B6B76' }))
    if (i < 3) items.push(arrow(x + W, 405, x + STEP, 405))
  }
  return doc('Workflow, panels A–D', [
    label('Workflow', { x: X0, y: 92 }, 34, { bold: true }),
    ...items,
  ])
}

/** A 96-well plate: 8 rows by 12 columns, with the labels a plate map uses. */
function plate96(): Doc {
  const items: Item[] = []
  const rows = 'ABCDEFGH'
  const r = 34
  const gap = 10
  const x0 = 150
  const y0 = 170
  for (let c = 0; c < 12; c++) {
    items.push(label(String(c + 1), { x: x0 + c * (r + gap), y: y0 - 30 }, 18, { align: 'center' }))
  }
  rows.split('').forEach((rl, ri) => {
    const y = y0 + ri * (r + gap)
    items.push(label(rl, { x: x0 - 34, y: y + 8 }, 18, { align: 'center' }))
    for (let c = 0; c < 12; c++) {
      items.push({
        ...newShape('ellipse', { x: x0 + c * (r + gap), y }),
        w: r,
        h: r,
        fill: (ri + c) % 2 === 0 ? '#EAF3F8' : '#FFFFFF',
        stroke: '#7C8B95',
        strokeWidth: 1.5,
      })
    }
  })
  return doc('96-well plate', [
    label('96-well plate layout', { x: 60, y: 70 }, 34, { bold: true }),
    ...items,
    label('Empty plate. Repaint the wells you use, or cover them with icons.', { x: 150, y: 700 }, 20, { fill: '#5B6B76' }),
  ])
}

/** Order matters: this is the order they are offered in. */
export const TEMPLATES: Template[] = [
  { id: 'graphical-abstract', label: 'Graphical abstract', hint: 'Three stacked panels with A, B and C.', build: graphicalAbstract },
  { id: 'pathway', label: 'Signalling pathway', hint: 'Three nodes joined by arrows.', build: pathway },
  { id: 'workflow', label: 'Workflow, panels A–D', hint: 'Four panels across, with A to D.', build: workflow },
  { id: 'plate-96', label: '96-well plate', hint: '8 by 12 wells, with row and column labels.', build: plate96 },
]