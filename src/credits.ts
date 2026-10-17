import { measureText } from './geometry'
import { ICON_BY_ID } from './icons'
import type { Doc, IconMeta } from './types'

/** Icons used in the figure, one entry per icon, in layer order. */
export function usedIcons(doc: Doc): IconMeta[] {
  const seen = new Set<string>()
  const out: IconMeta[] = []
  for (const it of doc.items) {
    if (it.type !== 'icon' || seen.has(it.iconId)) continue
    seen.add(it.iconId)
    const m = ICON_BY_ID.get(it.iconId)
    if (m) out.push(m)
  }
  return out
}

export function creditsText(doc: Doc): string {
  const used = usedIcons(doc)
  if (!used.length) return ''
  const parts = used.map((m) => `${m.label} by ${m.author} (${m.license})`)
  return `Icons from Bioicons (bioicons.com): ${parts.join('; ')}.`
}

export function wrapLines(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && measureText({ text: next, fontSize, bold: false, italic: false }).w > maxWidth) {
      lines.push(cur)
      cur = word
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines
}
