import { t } from './i18n'
import { toBase64 } from './icons'

export type StructureImage = { src: string; w: number; h: number }

/** Draws a SMILES string as a skeletal structure and returns it as an SVG image source. */
export async function renderSmiles(smiles: string, color = true): Promise<StructureImage> {
  const text = smiles.trim()
  if (!text) throw new Error(t('Type or paste a SMILES string.'))
  if (text.length > 2000) throw new Error(t('That SMILES is too long.'))
  // Loaded on demand so people who never draw a structure do not download the drawing library.
  const { default: SmilesDrawer } = await import('smiles-drawer')
  const drawer = new SmilesDrawer.SvgDrawer({ width: 600, height: 600, padding: 16, bondThickness: 1.6 })
  const svg = await new Promise<SVGSVGElement>((resolve, reject) => {
    SmilesDrawer.parse(
      SmilesDrawer.clean(text),
      (tree) => {
        try {
          resolve(drawer.draw(tree, null, color ? 'light' : 'oldschool'))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(t('Could not draw that structure.')))
        }
      },
      (e) => reject(new Error(e?.message ? t('Could not read that SMILES: {msg}', { msg: t(e.message) }) : t('Could not read that SMILES.'))),
    )
  })

  // The drawer centres the molecule in a square; crop the view to what was actually drawn.
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden'
  host.appendChild(svg)
  document.body.appendChild(host)
  let box: DOMRect
  try {
    box = svg.getBBox()
  } finally {
    host.remove()
  }
  const pad = 8
  const x = box.x - pad
  const y = box.y - pad
  const w = Math.max(10, box.width + pad * 2)
  const h = Math.max(10, box.height + pad * 2)
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
  const scale = 4 // a comfortable pixel size to start from
  svg.setAttribute('width', String(Math.round(w * scale)))
  svg.setAttribute('height', String(Math.round(h * scale)))
  const out = new XMLSerializer().serializeToString(svg)
  return { src: `data:image/svg+xml;base64,${toBase64(out)}`, w: w * scale, h: h * scale }
}
