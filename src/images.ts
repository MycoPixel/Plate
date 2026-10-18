import { t } from './i18n'
import { stripUnsafe, toBase64 } from './icons'

export type ImportedImage = { src: string; w: number; h: number; name: string }

const MAX_FILE = 25 * 1024 * 1024
const MAX_SVG = 4 * 1024 * 1024
const MAX_SIDE = 2400 // longest side kept for pictures; bigger ones are shrunk so figures stay light
const KEEP_BYTES = 1_500_000 // pictures under this size and side are stored as they came

const readDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error(t('The file could not be read.')))
    r.readAsDataURL(file)
  })

function sizeOfSvg(root: Element): { w: number; h: number } {
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] }
  const w = parseFloat(root.getAttribute('width') ?? '')
  const h = parseFloat(root.getAttribute('height') ?? '')
  return w > 0 && h > 0 ? { w, h } : { w: 200, h: 200 }
}

/** Cleans a user's SVG (no scripts, no outside references) and returns it as an image source. */
export function svgTextToImage(text: string, name: string): ImportedImage {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error(t('That does not look like a valid SVG file.'))
  }
  stripUnsafe(root)
  root.querySelectorAll('image').forEach((im) => {
    const href = im.getAttribute('href') ?? im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
    if (!href.startsWith('data:image/')) im.remove() // no pictures fetched from the web
  })
  const { w, h } = sizeOfSvg(root)
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  root.setAttribute('width', String(w))
  root.setAttribute('height', String(h))
  const out = new XMLSerializer().serializeToString(root)
  return { src: `data:image/svg+xml;base64,${toBase64(out)}`, w, h, name }
}

export async function importImageFile(file: File): Promise<ImportedImage> {
  const name = file.name.replace(/\.[^.]+$/, '') || 'Image'
  if (file.size > MAX_FILE) throw new Error(t('That file is larger than 25 MB.'))
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  if (isSvg) {
    if (file.size > MAX_SVG) throw new Error(t('That SVG is larger than 4 MB. Simplify it first, or export it as PNG.'))
    return svgTextToImage(await file.text(), name)
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new Error(t('Use an SVG, PNG, JPG, WebP or GIF image.'))
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error(t('That image could not be opened.'))
    })
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const big = Math.max(nw, nh) > MAX_SIDE
    if (!big && file.size <= KEEP_BYTES) return { src: await readDataUrl(file), w: nw, h: nh, name }
    const s = Math.min(1, MAX_SIDE / Math.max(nw, nh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(nw * s))
    canvas.height = Math.max(1, Math.round(nh * s))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(t('Canvas is not available in this browser.'))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpeg = file.type === 'image/jpeg'
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, jpeg ? 'image/jpeg' : 'image/png', 0.9))
    if (!blob) throw new Error(t('The image could not be compressed.'))
    return { src: await readDataUrl(blob), w: nw, h: nh, name }
  } finally {
    URL.revokeObjectURL(url)
  }
}
