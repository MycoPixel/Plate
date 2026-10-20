import type { Doc, Item, MarkerItem, TextItem } from './types'

/** Markers in the order a reader meets them: top to bottom, then left to right. */
export function readingOrder(items: Item[]): MarkerItem[] {
  return items
    .filter((i): i is MarkerItem => i.type === 'marker' && !i.hidden)
    .sort((a, b) => (Math.abs(a.y - b.y) > 12 ? a.y - b.y : a.x - b.x))
}

/** The number a marker gets, counting from one in reading order. */
export function markerNumber(doc: Doc, id: string): number {
  return readingOrder(doc.items).findIndex((m) => m.id === id) + 1
}

/** The caption text for every marker, one per line. Markers without a label are left out. */
export function legendLines(doc: Doc): string[] {
  const rows = readingOrder(doc.items).map((m, i) => ({ n: i + 1, label: m.label.trim() }))
  return rows
    .filter((r) => r.label)
    .map((r) => `${r.n}\t${r.label}`)
}

export const legendText = (doc: Doc) => legendLines(doc).join('\n')

/**
 * Keeps the numbers and the legends in step with the markers. Called on every change, the same way
 * arrows are kept attached to the items they point at: a text item marked as a legend is rewritten
 * from whatever the markers currently say.
 */
export function syncMarkers(doc: Doc): Doc {
  if (!doc.items.some((i) => i.type === 'marker' || (i.type === 'text' && i.legend))) return doc
  const text = legendText(doc)
  const items = doc.items.map((it) => (it.type === 'text' && it.legend && it.text !== text ? { ...it, text } : it))
  return items.some((it, k) => it !== doc.items[k]) ? { ...doc, items } : doc
}

/** A legend text item, which fills itself in from the markers. */
export function newLegend(at: { x: number; y: number }): TextItem {
  return {
    type: 'text',
    id: Math.random().toString(36).slice(2, 9),
    x: at.x,
    y: at.y,
    rotation: 0,
    text: '',
    fontSize: 18,
    fill: '#13262F',
    bold: false,
    italic: false,
    align: 'left',
    font: 'sans',
    legend: true,
  }
}

export function hasMarkers(doc: Doc) {
  return doc.items.some((i) => i.type === 'marker')
}