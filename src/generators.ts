import { INK, newShape, newText } from './defaults'
import type { Doc, Item } from './types'

export type PlatePresetId = '6' | '12' | '24' | '48' | '96' | '384'

export type PlatePreset = {
  id: PlatePresetId
  label: string
  rows: number
  cols: number
}

/** Order matters: this is the order they are offered in. */
export const PLATE_PRESETS: PlatePreset[] = [
  { id: '6', label: '6 wells (2 × 3)', rows: 2, cols: 3 },
  { id: '12', label: '12 wells (3 × 4)', rows: 3, cols: 4 },
  { id: '24', label: '24 wells (4 × 6)', rows: 4, cols: 6 },
  { id: '48', label: '48 wells (6 × 8)', rows: 6, cols: 8 },
  { id: '96', label: '96 wells (8 × 12)', rows: 8, cols: 12 },
  { id: '384', label: '384 wells (16 × 24)', rows: 16, cols: 24 },
]

export type GelOptions = {
  lanes: number
  bands: number
  kind: 'gel' | 'blot'
}

export type PetriPattern = 'colonies' | 'streaks' | 'dilution' | 'inhibition'

export type PetriOptions = {
  pattern: PetriPattern
}

const COLONY_COLORS = ['#E8B4B8', '#B8D8BA', '#F4D29A', '#A8C8E8', '#D9C2E8']

const rowName = (i: number) => String.fromCharCode(65 + (i % 26))

/** A grid of wells with row letters and column numbers, centred on the board. */
export function wellPlate(preset: PlatePreset, doc: Doc): Item[] {
  const { rows, cols } = preset
  const gap = 8
  const pad = 52
  const d = Math.max(6, Math.min(34, (doc.width - pad * 2 - (cols - 1) * gap) / cols))
  const width = cols * d + (cols - 1) * gap
  const height = rows * d + (rows - 1) * gap
  const x0 = (doc.width - width) / 2
  const y0 = (doc.height - height) / 2 + 10
  const out: Item[] = []
  for (let c = 0; c < cols; c++) {
    out.push(newText({ x: x0 + c * (d + gap) + d / 2, y: y0 - 26 }, String(c + 1), Math.min(18, d + 4)))
    const l = out[out.length - 1]
    if (l.type === 'text') { l.align = 'center'; l.fill = '#5B6B76' }
  }
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * (d + gap)
    out.push(newText({ x: x0 - 26, y: y + d / 2 - 8 }, rowName(r), Math.min(18, d + 4)))
    const l = out[out.length - 1]
    if (l.type === 'text') { l.align = 'center'; l.fill = '#5B6B76' }
    for (let c = 0; c < cols; c++) {
      out.push({
        ...newShape('ellipse', { x: x0 + c * (d + gap), y }),
        w: d,
        h: d,
        fill: (r + c) % 2 === 0 ? '#EAF3F8' : '#FFFFFF',
        stroke: '#7C8B95',
        strokeWidth: 1.5,
      })
    }
  }
  return out
}

/** Deterministic jitter, so the same options give the same gel. */
const jitter = (n: number) => Math.abs(Math.sin(n * 127.1) * 43758.5453) % 1

/** A gel or western blot with numbered lanes and evenly spaced bands. */
export function gelLanes({ lanes, bands, kind }: GelOptions, doc: Doc): Item[] {
  const laneW = lanes > 8 ? 46 : 62
  const laneGap = 10
  const width = lanes * laneW + (lanes - 1) * laneGap
  const height = Math.max(220, 66 + bands * 42)
  const x0 = (doc.width - width) / 2
  const y0 = (doc.height - height) / 2 + 8
  const pad = { top: 44 }
  const out: Item[] = [
    {
      ...newShape('rect', { x: x0 - 18, y: y0 - pad.top }),
      w: width + 36,
      h: height + pad.top + 18,
      fill: kind === 'gel' ? '#EDF2F4' : '#FFFFFF',
      stroke: '#8FA0A8',
      strokeWidth: 2,
      radius: 8,
    },
  ]
  for (let i = 0; i < lanes; i++) {
    const x = x0 + i * (laneW + laneGap)
    out.push(newText({ x: x + laneW / 2, y: y0 - pad.top + 16 }, String(i + 1), 16))
    const label = out[out.length - 1]
    if (label.type === 'text') { label.align = 'center'; label.fill = '#5B6B76' }
    out.push({
      ...newShape('rect', { x: x + 6, y: y0 + 4 }),
      w: laneW - 12,
      h: 12,
      fill: '#D7E1E6',
      stroke: '#8FA0A8',
      strokeWidth: 1,
      radius: 3,
    })
    for (let b = 0; b < bands; b++) {
      const t = bands === 1 ? 0.5 : b / (bands - 1)
      const y = y0 + 48 + t * (height - 92)
      const j = jitter(i * 37 + b * 11)
      const bw = (laneW - 16) * (0.62 + 0.3 * j)
      const bh = kind === 'gel' ? 5 : 7
      out.push({
        ...newShape('rect', { x: x + (laneW - bw) / 2, y: y + (j - 0.5) * 10 }),
        w: bw,
        h: bh,
        fill: kind === 'gel' ? '#33454F' : '#1E2B32',
        stroke: 'none',
        strokeWidth: 0,
        radius: 2,
        opacity: kind === 'gel' ? 0.5 + 0.4 * j : 0.65 + 0.3 * j,
      })
    }
  }
  return out
}

/** An agar plate: a dish with colonies, streaks, a dilution grid, or an inhibition zone. */
export function petriDish(pattern: PetriPattern, doc: Doc): Item[] {
  const D = Math.min(doc.width, doc.height) * 0.74
  const cx = doc.width / 2
  const cy = doc.height / 2
  const R = D / 2
  const x0 = cx - R
  const y0 = cy - R
  const out: Item[] = [
    { ...newShape('ellipse', { x: x0, y: y0 }), w: D, h: D, fill: '#FBF7EE', stroke: '#9AA5AB', strokeWidth: 2.5 },
    { ...newShape('ellipse', { x: x0 + 9, y: y0 + 9 }), w: D - 18, h: D - 18, fill: 'none', stroke: '#C9CFD3', strokeWidth: 1 },
  ]
  const colony = (fx: number, fy: number, size: number, color: string, opacity: number) =>
    out.push({
      ...newShape('ellipse', { x: cx + fx * R - size / 2, y: cy + fy * R - size / 2 }),
      w: size,
      h: size,
      fill: color,
      stroke: 'none',
      strokeWidth: 0,
      opacity,
    })

  if (pattern === 'colonies') {
    for (let i = 0; i < 30; i++) {
      const a = jitter(i * 3.7 + 11) * Math.PI * 2
      const r = Math.sqrt(jitter(i * 7.1 + 5)) * 0.8
      const size = 4 + jitter(i * 13.3) * 10
      colony(Math.cos(a) * r, Math.sin(a) * r, size, COLONY_COLORS[i % COLONY_COLORS.length], 0.55 + jitter(i * 3.1) * 0.4)
    }
  } else if (pattern === 'streaks') {
    // Zonal streaks: thin cleared lines radiating from the edge, denser near the plate rim.
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI / 2 + k * 0.42 + jitter(k * 5.5) * 0.12
      const len = R * (0.55 + jitter(k * 9.1) * 0.4)
      out.push({
        ...newShape('ellipse', { x: cx + Math.cos(ang) * len * 0.5 - len / 2, y: cy + Math.sin(ang) * len * 0.5 - 2 }),
        w: len,
        h: 5,
        rotation: (ang * 180) / Math.PI,
        fill: '#FFFFFF',
        stroke: 'none',
        strokeWidth: 0,
        opacity: 0.7,
      })
      for (let j = 0; j < 3; j++) {
        const a2 = ang + (j + 1) * 0.09
        const l2 = len * (1 - (j + 1) * 0.16)
        out.push({
          ...newShape('ellipse', { x: cx + Math.cos(a2) * l2 * 0.5 - l2 / 2, y: cy + Math.sin(a2) * l2 * 0.5 - 1.5 }),
          w: l2,
          h: 3,
          rotation: (a2 * 180) / Math.PI,
          fill: '#FFFFFF',
          stroke: 'none',
          strokeWidth: 0,
          opacity: 0.55,
        })
      }
    }
  } else if (pattern === 'dilution') {
    // Four dilution columns, spots shrinking as the sample is diluted.
    const cols = 4
    const rows = 3
    const gap = 0.36
    for (let c = 0; c < cols; c++) {
      const size = 12 - c * 2.6
      for (let r = 0; r < rows; r++) {
        colony((c - (cols - 1) / 2) * gap, (r - (rows - 1) / 2) * gap, size, '#E8A0A0', 0.75 - c * 0.15)
      }
    }
  } else {
    // Antibiotic disc in the middle, a clear inhibition zone around it, colonies outside.
    const zone = { ...newShape('ellipse', { x: cx - R * 0.36, y: cy - R * 0.36 }), w: R * 0.72, h: R * 0.72, fill: '#FFFFFF', stroke: 'none', strokeWidth: 0, opacity: 0.5 }
    out.push(zone)
    out.push({ ...newShape('ellipse', { x: cx - R * 0.15, y: cy - R * 0.15 }), w: R * 0.3, h: R * 0.3, fill: '#D9B8E6', stroke: '#8B5FA8', strokeWidth: 1.5, opacity: 0.85 })
    for (let i = 0; i < 22; i++) {
      const a = jitter(i * 5.9 + 3) * Math.PI * 2
      const r = 0.42 + jitter(i * 11.7) * 0.42
      const size = 4 + jitter(i * 4.3) * 9
      colony(Math.cos(a) * r, Math.sin(a) * r, size, COLONY_COLORS[(i * 2) % COLONY_COLORS.length], 0.6 + jitter(i * 8.1) * 0.35)
    }
  }
  return out
}

export type PanelOptions = {
  rows: number
  cols: number
  /** Space between neighbouring panels, in board units. */
  gap: number
  labels: 'letters' | 'numbers' | 'none'
  frame: boolean
}

/** Letters for panel labels: A…Z, then AA, AB… past Z. */
function panelLetter(i: number) {
  let n = i
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** A grid of empty panels, each with its own letter or number, ready to fill in. */
export function panelGrid({ rows, cols, gap, labels, frame }: PanelOptions, doc: Doc): Item[] {
  const margin = 48
  const cellW = (doc.width - margin * 2 - gap * (cols - 1)) / cols
  const cellH = (doc.height - margin * 2 - gap * (rows - 1)) / rows
  const out: Item[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = margin + c * (cellW + gap)
      const y = margin + r * (cellH + gap)
      if (frame) {
        out.push({
          ...newShape('rect', { x, y }),
          w: cellW,
          h: cellH,
          fill: 'none',
          stroke: '#C9D2D8',
          strokeWidth: 1.5,
          radius: 4,
        })
      }
      if (labels !== 'none') {
        const i = r * cols + c
        const label = newText({ x: x + 8, y: y + 6 }, labels === 'letters' ? panelLetter(i) : String(i + 1), 22)
        label.bold = true
        label.fill = INK
        out.push(label)
      }
    }
  }
  return out
}
