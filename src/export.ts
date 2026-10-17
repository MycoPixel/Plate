import { creditsText, wrapLines } from './credits'
import { arrowParts, boxOf, FIGURE_FONT, iconLayout, measureText, r3, transformAttr } from './geometry'
import { getIcon, ensureIcons, ICON_BY_ID, iconDataUri, resolveColors, scopeIds } from './icons'
import type { Doc, Item } from './types'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'string' ? esc(v) : v}"`)
    .join('')

function itemSvg(item: Item): string {
  switch (item.type) {
    case 'icon': {
      const meta = ICON_BY_ID.get(item.iconId)
      const parsed = getIcon(item.iconId)
      if (!meta || parsed?.status !== 'ready') return ''
      const l = iconLayout(item, meta.viewBox)
      const op = item.opacity < 1 ? item.opacity : undefined
      const open = `<g id="icon-${item.id}"${attrs({ transform: l.outer, opacity: op })}>`
      if (!parsed.inline) {
        return `${open}<image${attrs({
          x: r3(item.x),
          y: r3(item.y),
          width: r3(item.w),
          height: r3(item.h),
          preserveAspectRatio: 'none',
          'xlink:href': iconDataUri(item.iconId, parsed, item.colors),
        })}/></g>`
      }
      const clipId = `clip-${item.id}`
      return (
        `${open}<g transform="${l.inner}" clip-path="url(#${clipId})">` +
        `<clipPath id="${clipId}"><rect${attrs({ x: l.clip.x, y: l.clip.y, width: l.clip.w, height: l.clip.h })}/></clipPath>` +
        `${scopeIds(resolveColors(parsed.inner, parsed.palette, item.colors), item.id)}</g></g>`
      )
    }
    case 'image':
      return (
        `<g id="image-${item.id}"${attrs({ transform: transformAttr(item, item.flipX), opacity: item.opacity < 1 ? item.opacity : undefined })}>` +
        `<image${attrs({ x: r3(item.x), y: r3(item.y), width: r3(item.w), height: r3(item.h), preserveAspectRatio: 'none', 'xlink:href': item.src })}/></g>`
      )
    case 'shape': {
      const common = {
        fill: item.fill,
        stroke: item.strokeWidth > 0 ? item.stroke : 'none',
        'stroke-width': item.strokeWidth > 0 ? item.strokeWidth : undefined,
        opacity: item.opacity < 1 ? item.opacity : undefined,
        transform: transformAttr(item),
      }
      return item.shape === 'rect'
        ? `<rect${attrs({ x: r3(item.x), y: r3(item.y), width: r3(item.w), height: r3(item.h), rx: item.radius || undefined, ...common })}/>`
        : `<ellipse${attrs({ cx: r3(item.x + item.w / 2), cy: r3(item.y + item.h / 2), rx: r3(item.w / 2), ry: r3(item.h / 2), ...common })}/>`
    }
    case 'text': {
      const m = measureText(item)
      const b = boxOf(item)
      const ax = item.align === 'left' ? item.x : item.align === 'center' ? item.x + m.w / 2 : item.x + m.w
      const anchor = item.align === 'left' ? 'start' : item.align === 'center' ? 'middle' : 'end'
      const lh = item.fontSize * 1.2
      const spans = m.lines
        .map((line, i) => `<tspan${attrs({ x: r3(ax), y: r3(item.y + i * lh + item.fontSize * 0.95) })}>${esc(line || ' ')}</tspan>`)
        .join('')
      return `<text${attrs({
        'font-family': FIGURE_FONT,
        'font-size': item.fontSize,
        'font-weight': item.bold ? 700 : undefined,
        'font-style': item.italic ? 'italic' : undefined,
        fill: item.fill,
        'text-anchor': anchor,
        'xml:space': 'preserve',
        transform: transformAttr(b),
      })}>${spans}</text>`
    }
    case 'arrow': {
      const { d, heads } = arrowParts(item)
      const dash = item.dashed ? `${item.strokeWidth * 3} ${item.strokeWidth * 2}` : undefined
      return (
        `<g><path${attrs({ d, fill: 'none', stroke: item.stroke, 'stroke-width': item.strokeWidth, 'stroke-linejoin': 'round', 'stroke-dasharray': dash })}/>` +
        heads.map((p) => `<polygon points="${p}" fill="${esc(item.stroke)}"/>`).join('') +
        '</g>'
      )
    }
  }
}

export async function buildSvg(doc: Doc, withCredits: boolean) {
  const visible = doc.items.filter((i) => !i.hidden)
  await ensureIcons(visible.flatMap((i) => (i.type === 'icon' ? [i.iconId] : [])))

  const credits = creditsText(doc)
  const fs = Math.max(11, Math.round(doc.width / 100))
  const lines = withCredits && credits ? wrapLines(credits, doc.width - 32, fs) : []
  const band = lines.length ? Math.ceil(lines.length * fs * 1.4 + 20) : 0
  const W = Math.round(doc.width)
  const H = Math.round(doc.height) + band

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  )
  parts.push(`<title>${esc(doc.title)}</title>`)
  if (credits) parts.push(`<desc>${esc(credits)}</desc>`)
  if (!doc.transparent) parts.push(`<rect width="${W}" height="${H}" fill="${esc(doc.background)}"/>`)
  parts.push(`<clipPath id="board"><rect width="${doc.width}" height="${doc.height}"/></clipPath>`)
  parts.push('<g clip-path="url(#board)">')
  for (const it of visible) parts.push(itemSvg(it))
  parts.push('</g>')
  if (lines.length) {
    parts.push(`<g font-family="${FIGURE_FONT}" font-size="${fs}" fill="#4A5B64">`)
    lines.forEach((l, i) => {
      parts.push(`<text x="16" y="${r3(doc.height + 16 + fs + i * fs * 1.4)}">${esc(l)}</text>`)
    })
    parts.push('</g>')
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width: W, height: H }
}

export async function renderPng(doc: Doc, scale: number, withCredits: boolean): Promise<Blob> {
  const { svg, width, height } = await buildSvg(doc, withCredits)
  const s = Math.min(scale, 8000 / Math.max(width, height))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * s)
    canvas.height = Math.round(height * s)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available in this browser.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const fileSlug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'figure'
