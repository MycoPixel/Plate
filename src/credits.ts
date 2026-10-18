import { measureText } from './geometry'
import { ICON_BY_ID } from './icons'
import { t } from './i18n'
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

/** The web address the artwork can be traced back to. */
const entryUrl = (m: IconMeta) => m.source

/** One credit per illustration, in the wording the collection itself asks for. */
function credit(m: IconMeta, recoloured: boolean): string {
  if (m.via) {
    // Commons wants the author, the license and a link to the file page.
    return t(
      recoloured
        ? '{label} by {author} ({license}, {via}, recoloured), {url}'
        : '{label} by {author} ({license}, {via}), {url}',
      { label: m.label, author: m.author, license: m.license, via: m.via, url: entryUrl(m) },
    )
  }
  if (!m.collection) {
    // CC BY asks that changes are mentioned, and recolouring is a change.
    return t(recoloured ? '{label} by {author} ({license}, recoloured)' : '{label} by {author} ({license})', {
      label: m.label,
      author: m.author,
      license: m.license,
    })
  }
  // CC BY asks that changes be mentioned, and recolouring is a change. Public domain drawings need
  // no adaptation note, so the wording is kept as the collection publishes it.
  const adapted = recoloured && m.license.startsWith('CC')
  return t('{collection}. ({date}). {label}{author}{license}{adapted}{doi}. NIAID NIH BioArt Source. {url}', {
    collection: m.collection,
    date: m.date ?? '',
    label: m.label,
    author: m.license.startsWith('CC') ? `. ${m.author}` : '',
    license: `. ${m.license}`,
    adapted: adapted ? t(', adapted') : '',
    doi: m.doi ? `. ${m.doi}` : '',
    url: entryUrl(m),
  })
}

export function creditsText(doc: Doc): string {
  const used = usedIcons(doc)
  if (!used.length) return ''
  // CC BY asks that changes are mentioned, and recolouring is a change.
  const recoloured = new Set(doc.items.flatMap((i) => (i.type === 'icon' && i.colors ? [i.iconId] : [])))
  // The icon names stay in the original language so each credit can be traced to its source.
  const commons = used.filter((m) => m.via === 'Wikimedia Commons')
  const phylopic = used.filter((m) => m.via === 'PhyloPic')
  const health = used.filter((m) => m.via === 'Health Icons')
  const bioart = used.filter((m) => m.collection && !m.via)
  const bioicons = used.filter((m) => !m.collection && !m.via)
  const lines = []
  if (bioicons.length) {
    lines.push(
      t('Icons from Bioicons (bioicons.com): {list}.', { list: bioicons.map((m) => credit(m, recoloured.has(m.id))).join('; ') }),
    )
  }
  if (commons.length) {
    lines.push(
      t('Drawings from Wikimedia Commons: {list}.', { list: commons.map((m) => credit(m, recoloured.has(m.id))).join('; ') }),
    )
  }
  if (phylopic.length) {
    lines.push(
      t('Silhouettes from PhyloPic: {list}.', { list: phylopic.map((m) => credit(m, recoloured.has(m.id))).join('; ') }),
    )
  }
  if (health.length) {
    lines.push(
      t('Icons from Health Icons (healthicons.org): {list}.', {
        list: health.map((m) => credit(m, recoloured.has(m.id))).join('; '),
      }),
    )
  }
  if (bioart.length) {
    lines.push(
      t('Illustrations from the NIH BioArt Source: {list}.', { list: bioart.map((m) => credit(m, recoloured.has(m.id))).join('; ') }),
    )
  }
  return lines.join(' ')
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
