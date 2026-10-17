import { useSyncExternalStore } from 'react'
import raw from './icons.json'
import type { IconMeta } from './types'

type RawIcon = {
  id: string
  label: string
  category: string
  author: string
  license: 'cc0' | 'mit' | 'by3' | 'by4'
  inline: boolean
  viewBox: number[]
}
const { authors, icons: rawIcons } = raw as unknown as { authors: Record<string, string>; icons: RawIcon[] }

// icons.json stores only what varies per icon; the rest is derived here.
const LICENSES = {
  cc0: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  mit: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  by3: { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  by4: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
}

export const ICONS: IconMeta[] = rawIcons.map((r) => ({
  id: r.id,
  label: r.label,
  category: r.category,
  file: `icons/${r.id}.svg`,
  inline: r.inline,
  viewBox: r.viewBox,
  license: LICENSES[r.license].name,
  licenseUrl: LICENSES[r.license].url,
  author: r.author,
  authorUrl: authors[r.author] ?? '',
  source: 'https://bioicons.com',
}))
export const ICON_BY_ID = new Map(ICONS.map((i) => [i.id, i]))
export const CATEGORIES = Array.from(new Set(ICONS.map((i) => i.category))).sort((a, b) =>
  a.localeCompare(b),
)

export const iconUrl = (meta: IconMeta) => new URL(meta.file, document.baseURI).href

export type ParsedIcon =
  | { status: 'ready'; inline: boolean; inner: string; dataUri: string }
  | { status: 'error' }

const cache = new Map<string, ParsedIcon>()
const pending = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
let version = 0

const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Re-renders a component whenever another icon finishes loading. */
export const useIconCacheVersion = () => useSyncExternalStore(subscribe, () => version)

export const getIcon = (id: string) => cache.get(id)

const SVG_NS = 'http://www.w3.org/2000/svg'
const OK_ATTR_NS = new Set([
  null,
  SVG_NS,
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
])
const P = '__P__' // placeholder replaced by a per-item prefix so ids never collide

function toBase64(s: string) {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function parseSvg(text: string, meta: IconMeta): ParsedIcon {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.querySelector('parsererror')) {
    return { status: 'error' }
  }

  // Strip anything that is not plain SVG: scripts, editor metadata, foreign namespaces.
  const drop: Element[] = []
  root.querySelectorAll('*').forEach((el) => {
    if (
      el.namespaceURI !== SVG_NS ||
      ['script', 'foreignObject', 'metadata', 'title', 'desc'].includes(el.localName)
    ) {
      drop.push(el)
    }
  })
  drop.forEach((el) => el.remove())
  const all = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || !OK_ATTR_NS.has(a.namespaceURI)) el.removeAttributeNode(a)
    }
  }

  // Icons that carry <style> rules would leak CSS into each other, so they stay isolated as images.
  const inline = !root.querySelector('style')

  if (!inline) {
    root.setAttribute('viewBox', meta.viewBox.join(' '))
    root.setAttribute('width', '100%')
    root.setAttribute('height', '100%')
    const s = new XMLSerializer().serializeToString(root)
    return {
      status: 'ready',
      inline: false,
      inner: '',
      dataUri: `data:image/svg+xml;base64,${toBase64(s)}`,
    }
  }

  const fixRef = (v: string) =>
    v.replace(
      /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
      (_m, q: string, id: string) => `url(${q}#${P}${id}${q})`,
    )
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      if (a.name === 'id') a.value = P + a.value
      else if (a.localName === 'href' && a.value.startsWith('#')) a.value = `#${P}${a.value.slice(1)}`
      else if (a.value.includes('url(')) a.value = fixRef(a.value)
    }
  }
  for (const a of Array.from(root.attributes)) {
    if (!a.name.startsWith('xmlns')) root.removeAttributeNode(a)
  }
  const out = new XMLSerializer().serializeToString(root)
  const close = out.lastIndexOf('</svg>')
  const inner = close === -1 ? '' : out.slice(out.indexOf('>') + 1, close)
  return { status: 'ready', inline: true, inner, dataUri: '' }
}

async function load(id: string) {
  const meta = ICON_BY_ID.get(id)
  if (!meta) {
    cache.set(id, { status: 'error' })
  } else {
    try {
      const res = await fetch(iconUrl(meta))
      if (!res.ok) throw new Error(String(res.status))
      cache.set(id, parseSvg(await res.text(), meta))
    } catch {
      cache.set(id, { status: 'error' })
    }
  }
  pending.delete(id)
  emit()
}

/** Starts loading the given icons and resolves once all of them are parsed. */
export function ensureIcons(ids: Iterable<string>): Promise<void> {
  const all: Promise<void>[] = []
  for (const id of ids) {
    if (cache.has(id)) continue
    let p = pending.get(id)
    if (!p) {
      p = load(id)
      pending.set(id, p)
    }
    all.push(p)
  }
  return Promise.all(all).then(() => undefined)
}

export const scopeIds = (inner: string, itemId: string) => inner.split(P).join(`i${itemId}-`)
