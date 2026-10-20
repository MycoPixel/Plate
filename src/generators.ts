import { newShape, newText } from './defaults'
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
  const height = Math.max(220, 110 + bands * 42)
  const x0 = (doc.width - width) / 2
  const y0 = (doc.height - height) / 2 + 8
  const out: Item[] = [
    {
      ...newShape('rect', { x: x0 - 18, y: y0 - 18 }),
      w: width + 36,
      h: height + 36,
      fill: kind === 'gel' ? '#EDF2F4' : '#FFFFFF',
      stroke: '#8FA0A8',
      strokeWidth: 2,
      radius: 8,
    },
  ]
  for (let i = 0; i < lanes; i++) {
    const x = x0 + i * (laneW + laneGap)
    out.push(newText({ x: x + laneW / 2, y: y0 - 26 }, String(i + 1), 16))
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
