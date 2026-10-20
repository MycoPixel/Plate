import { creditsText, wrapLines } from './credits'
import { arrowParts, boxOf, FIGURE_FONT, fontFamily, iconLayout, lineSpans, measureText, r3, transformAttr, unionAabb } from './geometry'
import { getIcon, ensureIcons, ICON_BY_ID, iconDataUri, iconIdOf, resolveColors, scopeIds } from './icons'
import { chartEls } from './charts'
import { lipidTransform, membraneLayout } from './membrane'
import { markerNumber } from './markers'
import { shapeEls } from './shapes'
import type { Doc, Item, Rect } from './types'
import { t } from './i18n'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'string' ? esc(v) : v}"`)
    .join('')

function itemSvg(item: Item, doc: Doc): string {
  switch (item.type) {
    case 'icon': {
      const meta = ICON_BY_ID.get(item.iconId)
      const parsed = getIcon(item.iconId)
      if (!meta || parsed?.status !== 'ready') return ''
      const l = iconLayout(item, meta.viewBox)
      const op = item.opacity < 1 ? item.opacity : undefined
      const open = `<g id="icon-${esc(item.id)}"${attrs({ transform: l.outer, opacity: op })}>`
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
      const clipId = `clip-${esc(item.id)}`
      return (
        `${open}<g transform="${l.inner}" clip-path="url(#${clipId})">` +
        `<clipPath id="${clipId}"><rect${attrs({ x: l.clip.x, y: l.clip.y, width: l.clip.w, height: l.clip.h })}/></clipPath>` +
        `${scopeIds(resolveColors(parsed.inner, parsed.palette, item.colors), esc(item.id))}</g></g>`
      )
    }
    case 'image':
      return (
        `<g id="image-${esc(item.id)}"${attrs({ transform: transformAttr(item, item.flipX), opacity: item.opacity < 1 ? item.opacity : undefined })}>` +
        `<image${attrs({ x: r3(item.x), y: r3(item.y), width: r3(item.w), height: r3(item.h), preserveAspectRatio: 'none', 'xlink:href': item.src })}/></g>`
      )
    case 'shape': {
      const common = {
        opacity: item.opacity < 1 ? item.opacity : undefined,
        transform: transformAttr(item),
      }
      return shapeEls(item)
        .map((el) =>
          el.kind === 'rect'
            ? `<rect${attrs({ x: r3(el.x), y: r3(el.y), width: r3(el.w), height: r3(el.h), rx: el.rx || undefined, fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`
            : el.kind === 'ellipse'
              ? `<ellipse${attrs({ cx: r3(el.cx), cy: r3(el.cy), rx: r3(el.rx), ry: r3(el.ry), fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`
              : `<path${attrs({ d: el.d, fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`,
        )
        .join('')
    }
    case 'marker':
      return (
        `<circle${attrs({ cx: r3(item.x), cy: r3(item.y), r: r3(item.size / 2), fill: item.fill, stroke: item.strokeWidth > 0 ? item.stroke : undefined, 'stroke-width': item.strokeWidth || undefined })}/>` +
        `<text${attrs({ x: r3(item.x), y: r3(item.y), 'font-family': FIGURE_FONT, 'font-size': r3(item.fontSize), 'font-weight': 700, fill: item.textFill, 'text-anchor': 'middle', 'dominant-baseline': 'central' })}>${markerNumber(doc, item.id)}</text>`
      )
    case 'chart': {
      const common = { opacity: item.opacity < 1 ? item.opacity : undefined, transform: transformAttr(item) }
      return chartEls(item)
        .map((el) => {
          if (el.kind === 'rect')
            return `<rect${attrs({ x: r3(el.x), y: r3(el.y), width: r3(el.w), height: r3(el.h), rx: el.rx || undefined, fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`
          if (el.kind === 'line')
            return `<line${attrs({ x1: r3(el.x1), y1: r3(el.y1), x2: r3(el.x2), y2: r3(el.y2), stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, 'stroke-dasharray': el.dash, ...common })}/>`
          if (el.kind === 'circle')
            return `<circle${attrs({ cx: r3(el.cx), cy: r3(el.cy), r: r3(el.r), fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`
          if (el.kind === 'path')
            return `<path${attrs({ d: el.d, fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth || undefined, ...common })}/>`
          const pos = el.rotate
            ? `translate(${r3(item.x)} ${r3(item.y)}) rotate(${r3(el.rotate)} ${r3(el.x)} ${r3(el.y)})`
            : attrs({ transform: transformAttr(item) })
          return `<text${attrs({ x: r3(el.x), y: r3(el.y), 'font-family': FIGURE_FONT, 'font-size': r3(el.size), fill: el.fill, 'text-anchor': el.anchor, ...(el.rotate ? { transform: pos } : { transform: transformAttr(item), opacity: item.opacity < 1 ? item.opacity : undefined }) })}>${esc(el.text)}</text>`
        })
        .join('')
    }
    case 'text': {
      const m = measureText(item)
      const b = boxOf(item)
      const ax = item.align === 'left' ? item.x : item.align === 'center' ? item.x + m.w / 2 : item.x + m.w
      const anchor = item.align === 'left' ? 'start' : item.align === 'center' ? 'middle' : 'end'
      const lh = item.fontSize * 1.2
      const spans = m.lines
        .flatMap((line, i) => lineSpans(line, ax, item.y + i * lh + item.fontSize * 0.95, item.fontSize))
        .map(
          (sp) =>
            `<tspan${attrs({
              x: sp.x === undefined ? undefined : r3(sp.x),
              y: sp.y === undefined ? undefined : r3(sp.y),
              dy: sp.dy === undefined ? undefined : r3(sp.dy),
              'font-size': sp.size === undefined ? undefined : r3(sp.size),
            })}>${esc(sp.text)}</tspan>`,
        )
        .join('')
      return `<text${attrs({
        'font-family': fontFamily(item.font),
        'font-size': item.fontSize,
        'font-weight': item.bold ? 700 : undefined,
        'font-style': item.italic ? 'italic' : undefined,
        fill: item.fill,
        'text-anchor': anchor,
        'xml:space': 'preserve',
        transform: transformAttr(b),
      })}>${spans}</text>`
    }
    case 'membrane': {
      const meta = ICON_BY_ID.get(item.iconId)
      const parsed = getIcon(item.iconId)
      if (!meta || parsed?.status !== 'ready') return ''
      const layout = membraneLayout(item)
      if (!layout.lipids.length) return ''
      const lid = `lipid-${esc(item.id)}`
      const [vx, vy, vw, vh] = meta.viewBox
      // The lipid is drawn once, in a 1 by 1 box, and every copy is a <use> of it.
      const def = parsed.inline
        ? `<g id="${lid}" transform="scale(${+(1 / vw).toPrecision(9)} ${+(1 / vh).toPrecision(9)}) translate(${r3(-vx)} ${r3(-vy)})" clip-path="url(#clip-${lid})">` +
          `<clipPath id="clip-${lid}"><rect${attrs({ x: vx, y: vy, width: vw, height: vh })}/></clipPath>` +
          `${scopeIds(resolveColors(parsed.inner, parsed.palette, item.colors), esc(item.id))}</g>`
        : `<image id="${lid}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" xlink:href="${iconDataUri(item.iconId, parsed, item.colors)}"/>`
      const uses = layout.lipids.map((l) => `<use xlink:href="#${lid}" transform="${lipidTransform(l)}"/>`).join('')
      return `<g id="membrane-${esc(item.id)}"${attrs({ opacity: item.opacity < 1 ? item.opacity : undefined })}><defs>${def}</defs>${uses}</g>`
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

export type SvgOptions = {
  /** Export only these items, cropped to their bounds, instead of the whole board. */
  onlyIds?: string[]
}

const SELECTION_PAD = 12

/** The part of the board an export covers, and the size of the image with the credit band under it. */
export function exportLayout(doc: Doc, withCredits: boolean, opts: SvgOptions = {}) {
  const only = opts.onlyIds ? new Set(opts.onlyIds) : null
  const visible = doc.items.filter((i) => !i.hidden && (!only || only.has(i.id)))
  let region: Rect = { x: 0, y: 0, w: Math.round(doc.width), h: Math.round(doc.height) }
  if (only && visible.length) {
    const u = unionAabb(visible)
    const x = Math.floor(u.x - SELECTION_PAD)
    const y = Math.floor(u.y - SELECTION_PAD)
    region = { x, y, w: Math.ceil(u.x + u.w + SELECTION_PAD) - x, h: Math.ceil(u.y + u.h + SELECTION_PAD) - y }
  }
  // Credits follow what is drawn when only a selection is exported.
  const credits = creditsText(only ? { ...doc, items: visible } : doc)
  const fs = Math.max(11, Math.round(region.w / 100))
  const lines = withCredits && credits ? wrapLines(credits, region.w - 32, fs) : []
  const band = lines.length ? Math.ceil(lines.length * fs * 1.4 + 20) : 0
  return { visible, region, credits, fs, lines, band, width: region.w, height: region.h + band }
}

export async function buildSvg(doc: Doc, withCredits: boolean, opts: SvgOptions = {}) {
  const { visible, region, credits, fs, lines, width: W, height: H } = exportLayout(doc, withCredits, opts)
  await ensureIcons(visible.flatMap((i) => iconIdOf(i) ?? []))

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${region.x} ${region.y} ${W} ${H}">`,
  )
  parts.push(`<title>${esc(doc.title)}</title>`)
  if (credits) parts.push(`<desc>${esc(credits)}</desc>`)
  if (!doc.transparent) parts.push(`<rect x="${region.x}" y="${region.y}" width="${W}" height="${H}" fill="${esc(doc.background)}"/>`)
  parts.push(`<clipPath id="board"><rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}"/></clipPath>`)
  parts.push('<g clip-path="url(#board)">')
  for (const it of visible) parts.push(itemSvg(it, doc))
  parts.push('</g>')
  if (lines.length) {
    parts.push(`<g font-family="${FIGURE_FONT}" font-size="${fs}" fill="#4A5B64">`)
    lines.forEach((l, i) => {
      parts.push(`<text x="${region.x + 16}" y="${r3(region.y + region.h + 16 + fs + i * fs * 1.4)}">${esc(l)}</text>`)
    })
    parts.push('</g>')
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width: W, height: H }
}

/** A small PNG of the board for the My figures gallery. Empty when it cannot be drawn. */
export async function thumbOf(doc: Doc, maxW = 320): Promise<string> {
  try {
    const { svg, width, height } = await buildSvg(doc, false)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error(t('Could not draw a thumbnail.')))
        i.src = url
      })
      const scale = Math.min(1, maxW / Math.max(1, width))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(width * scale))
      c.height = Math.max(1, Math.round(height * scale))
      const ctx = c.getContext('2d')
      if (!ctx) return ''
      ctx.drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return ''
  }
}

const MAX_PX = 8000

/**
 * `dpi` (optional) is written into the PNG so other programs place it at the intended physical size.
 * It is the resolution that goes with `scale`; when the image has to be made smaller than asked, the
 * recorded value drops with it.
 */
export async function renderPng(
  doc: Doc,
  scale: number,
  withCredits: boolean,
  opts: SvgOptions & { dpi?: number } = {},
): Promise<Blob> {
  const { svg, width, height } = await buildSvg(doc, withCredits, opts)
  const s = Math.min(scale, MAX_PX / Math.max(width, height))
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
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('PNG encoding failed.')))), 'image/png'),
    )
    return opts.dpi ? await setPngDpi(png, (opts.dpi * s) / scale) : png
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Largest scale renderPng will really use, so the export dialog can tell the truth about the pixel size. */
export const pngSize = (width: number, height: number, scale: number) => {
  const s = Math.min(scale, MAX_PX / Math.max(width, height))
  return { w: Math.round(width * s), h: Math.round(height * s), limited: s < scale }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Writes the pHYs chunk (pixels per metre) right after IHDR, replacing any that is there. */
export async function setPngDpi(png: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer())
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (src.length < 33 || !signature.every((b, i) => src[i] === b)) return png

  const perMetre = Math.round(dpi / 0.0254)
  const phys = new Uint8Array(21)
  const dv = new DataView(phys.buffer)
  dv.setUint32(0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  dv.setUint32(8, perMetre)
  dv.setUint32(12, perMetre)
  phys[16] = 1 // unit: metre
  dv.setUint32(17, crc32(phys.subarray(4, 17)))

  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const parts: Uint8Array<ArrayBuffer>[] = [src.slice(0, 8)]
  let pos = 8
  while (pos + 12 <= src.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(...src.subarray(pos + 4, pos + 8))
    const end = pos + 12 + len
    if (end > src.length) return png
    if (type !== 'pHYs') parts.push(src.slice(pos, end))
    if (type === 'IHDR') parts.push(phys)
    pos = end
  }
  return new Blob(parts, { type: 'image/png' })
}

/** Puts a PNG on the clipboard, ready to paste into a slide or a document. */
export async function copyPng(blob: Promise<Blob>) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/**
 * Vector PDF through the browser's own print engine: the figure goes into a hidden page whose size is the
 * figure's size, and the print window is opened. Choosing "Save as PDF" there gives a PDF with real text
 * and vector shapes, drawn by exactly the same code as the SVG export.
 */
export async function printPdf(doc: Doc, withCredits: boolean, widthMm: number, opts: SvgOptions = {}) {
  const { svg, width, height } = await buildSvg(doc, withCredits, opts)
  const w = r3(widthMm)
  const h = r3((widthMm * height) / width)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  // Scripts are blocked, but the page stays same-origin so it can still lay out and print.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;'
  frame.srcdoc =
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>` +
    `@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0;width:${w}mm;height:${h}mm;overflow:hidden}` +
    `svg{display:block;width:${w}mm;height:${h}mm}</style></head><body>${svg}</body></html>`
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve()
    document.body.appendChild(frame)
  })
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    throw new Error(t('The print window could not be opened.'))
  }
  // Give embedded pictures a moment to decode before the page is laid out for printing.
  await new Promise((r) => setTimeout(r, 300))
  const cleanup = () => {
    window.clearTimeout(fallback)
    frame.remove()
  }
  const fallback = window.setTimeout(cleanup, 120_000)
  win.addEventListener('afterprint', cleanup, { once: true })
  win.focus()
  win.print()
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
