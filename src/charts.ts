import { t } from './i18n'
import type { ChartItem, ChartSeries } from './types'

export type ChartEl =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; dash?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'path'; d: string; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; rotate?: number }

/** Colours offered to series, in the order they are taken. */
export const CHART_COLORS = ['#2F6F8F', '#D07B3F', '#5B8C5A', '#8B5FA8', '#C4563A', '#A8842C']

const n = (v: number) => +v.toFixed(2)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fontSize = 13

/** Work out a rounded top of axis that holds the data with a little room. */
function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const step = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const top = m * step
    if (v <= top * 1.05) return top
  }
  return 10 * step
}

/** Everything a chart draws, in the item's own box (0,0,w,h). */
export function chartEls(item: ChartItem): ChartEl[] {
  const { w, h } = item
  const padL = 52
  const padR = 14
  const padT = item.title ? 30 : 12
  const padB = item.xLabel ? 46 : 34
  const plotL = padL
  const plotR = w - padR
  const plotT = padT
  const plotB = h - padB
  const plotW = Math.max(10, plotR - plotL)
  const plotH = Math.max(10, plotB - plotT)

  const cats = Math.max(1, item.xNames.length)
  const all = item.series.flatMap((s) => s.values)
  const withErr = item.series.flatMap((s) => s.errors ?? [])
  let lo = Math.min(0, ...all, ...withErr)
  let hi = Math.max(...all, ...withErr.map((e) => Math.abs(e)))
  if (item.yMax > 0) hi = Math.max(hi, item.yMax)
  const top = item.yMax > 0 ? item.yMax : niceMax(hi)
  lo = Math.min(0, lo)

  const yOf = (v: number) => plotB - ((v - lo) / (top - lo || 1)) * plotH
  const xOf = (i: number) => plotL + ((i + 0.5) / cats) * plotW

  const out: ChartEl[] = []

  if (item.title) {
    out.push({ kind: 'text', x: w / 2, y: 14, text: item.title, size: fontSize + 2, fill: '#13262F', anchor: 'middle' })
  }
  if (item.yLabel) {
    out.push({ kind: 'text', x: 14, y: plotT + plotH / 2, text: item.yLabel, size: fontSize, fill: '#13262F', anchor: 'middle', rotate: -90 })
  }
  if (item.xLabel) {
    out.push({ kind: 'text', x: plotL + plotW / 2, y: h - 6, text: item.xLabel, size: fontSize, fill: '#13262F', anchor: 'middle' })
  }

  // Grid and y ticks.
  const ticks = 5
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((top - lo) * i) / ticks
    const y = yOf(v)
    if (item.showGrid && i > 0 && i < ticks) {
      out.push({ kind: 'line', x1: plotL, y1: y, x2: plotR, y2: y, stroke: '#DCE3E8', strokeWidth: 1 })
    }
    out.push({ kind: 'text', x: plotL - 6, y: y + 4, text: String(Math.abs(v) < 1e-9 ? 0 : +v.toFixed(2)), size: fontSize - 2, fill: '#5B6B76', anchor: 'end' })
  }
  out.push({ kind: 'line', x1: plotL, y1: plotB, x2: plotR, y2: plotB, stroke: '#13262F', strokeWidth: 1.2 })
  out.push({ kind: 'line', x1: plotL, y1: plotT, x2: plotL, y2: plotB, stroke: '#13262F', strokeWidth: 1.2 })

  // Category names.
  item.xNames.forEach((name, i) => {
    out.push({ kind: 'text', x: xOf(i), y: plotB + 14, text: name, size: fontSize - 2, fill: '#5B6B76', anchor: 'middle' })
  })

  const barSlot = plotW / cats
  const series = item.series

  if (item.kind === 'bar') {
    const group = Math.max(1, series.length)
    const bw = Math.min(34, (barSlot * 0.8) / group)
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const cx = plotL + barSlot * i + barSlot / 2 + (si - (group - 1) / 2) * bw
        const y = yOf(v)
        out.push({ kind: 'rect', x: cx - bw / 2, y: Math.min(y, yOf(lo)), w: bw, h: Math.abs(plotB - y), rx: 2, fill: s.color, stroke: 'none', strokeWidth: 0 })
        if (s.errors?.[i] != null) {
          const err = s.errors[i]
          out.push({ kind: 'line', x1: cx, y1: yOf(v + err), x2: cx, y2: yOf(v - err), stroke: '#13262F', strokeWidth: 1 })
          out.push({ kind: 'line', x1: cx - 3, y1: yOf(v + err), x2: cx + 3, y2: yOf(v + err), stroke: '#13262F', strokeWidth: 1 })
          out.push({ kind: 'line', x1: cx - 3, y1: yOf(v - err), x2: cx + 3, y2: yOf(v - err), stroke: '#13262F', strokeWidth: 1 })
        }
      })
    })
  } else {
    series.forEach((s) => {
      const pts = s.values.map((v, i) => `${n(xOf(i))} ${n(yOf(v))}`)
      if (item.kind === 'line' && pts.length > 1) {
        out.push({ kind: 'path', d: `M${pts.join('L')}`, fill: 'none', stroke: s.color, strokeWidth: 2.5 })
      }
      s.values.forEach((v, i) => {
        const x = xOf(i)
        const y = yOf(v)
        if (item.kind === 'scatter' || series.length > 1) {
          out.push({ kind: 'circle', cx: x, cy: y, r: 3.5, fill: s.color, stroke: 'none', strokeWidth: 0 })
        }
        if (s.errors?.[i] != null) {
          const err = s.errors[i]
          out.push({ kind: 'line', x1: x, y1: yOf(v + err), x2: x, y2: yOf(v - err), stroke: s.color, strokeWidth: 1.2 })
          out.push({ kind: 'line', x1: x - 3, y1: yOf(v + err), x2: x + 3, y2: yOf(v + err), stroke: s.color, strokeWidth: 1.2 })
          out.push({ kind: 'line', x1: x - 3, y1: yOf(v - err), x2: x + 3, y2: yOf(v - err), stroke: s.color, strokeWidth: 1.2 })
        }
      })
    })
  }

  // A legend, when there is more than one series.
  if (series.length > 1) {
    const ly = plotT + 12
    let lx = plotL + 6
    series.forEach((s) => {
      out.push({ kind: 'rect', x: lx, y: ly - 7, w: 12, h: 12, rx: 2, fill: s.color, stroke: 'none', strokeWidth: 0 })
      const label = esc(s.name)
      out.push({ kind: 'text', x: lx + 16, y: ly + 3, text: label, size: fontSize - 1, fill: '#13262F', anchor: 'start' })
      lx += 16 + s.name.length * 7 + 18
    })
  }

  return out
}

/** A fresh series, used by the chart dialog. */
export const blankSeries = (name: string, color: string, count: number): ChartSeries => ({
  name,
  color,
  values: Array.from({ length: count }, () => 0),
})

/** Turns a pasted table into series. First row: categories. Each row below: one series. */
export function parseChartTable(text: string): { series: ChartSeries[]; xNames: string[] } | string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return t('Paste a table with a header row and one row per series.')

  const rows = lines.map((l) => l.split(/\t|,(?![0-9.])|\s{2,}/).map((c) => c.trim()))
  const header = rows[0]
  if (header.length < 2) return t('The header row needs at least two columns.')
  const xNames = header.slice(1)
  const series: ChartSeries[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    if (cells.length < 2) continue
    const name = cells[0] || `Series ${r}`
    const values: number[] = []
    const errors: number[] = []
    for (let c = 1; c < header.length; c++) {
      const cell = cells[c] ?? ''
      const m = cell.match(/^(-?[0-9.]+)\s*±\s*([0-9.]+)$/)
      if (m) {
        values.push(Number(m[1]))
        errors.push(Number(m[2]))
      } else {
        const v = Number(cell)
        values.push(Number.isFinite(v) ? v : 0)
        errors.push(0)
      }
    }
    series.push({ name, color: CHART_COLORS[(r - 1) % CHART_COLORS.length], values, errors: errors.some((e) => e > 0) ? errors : undefined })
  }
  if (!series.length) return t('Add one row per series, with numbers in the columns.')
  return { series, xNames }
}
