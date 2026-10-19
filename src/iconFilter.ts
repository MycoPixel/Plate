import { useMemo, useState } from 'react'
import { CATEGORIES, ICON_BY_ID, ICONS, isOpenLicense, sourceOf } from './icons'
import type { SourceId } from './icons'
import { categoryLabel, iconNameEs, useLang } from './i18n'
import { useLibrary } from './library'
import type { IconMeta } from './types'

export const ICON_MIME = 'application/x-plate-icon'

export type Tab = 'all' | 'favs' | 'recent'
export type LicenseFilter = 'any' | 'open' | 'credit'

/** Short license badge on a tile: CC0, public domain, or "credit needed" (CC BY and MIT). */
export const licenseBadge = (m: IconMeta) =>
  m.license.startsWith('CC0') ? 'CC0' : m.license === 'Public Domain' ? 'PD' : 'BY'

/** Search text without case or accents, so "celula" finds "célula" and "neutrofilo" the drawing. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

export const CATEGORY_COUNTS: Map<string, number> = (() => {
  const m = new Map<string, number>()
  for (const i of ICONS) m.set(i.category, (m.get(i.category) ?? 0) + 1)
  return m
})()

export type IconFilter = ReturnType<typeof useIconFilter>

/** The palette's search, category, source, license and tab state, and the icons it leaves. */
export function useIconFilter(opts: { tabs?: boolean; epoch?: unknown } = {}) {
  const tabs = opts.tabs ?? true
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [source, setSource] = useState<SourceId | 'all'>('all')
  const [license, setLicense] = useState<LicenseFilter>('any')
  const [tab, setTab] = useState<Tab>('all')
  const lang = useLang()
  const { favs, recent } = useLibrary()

  // A dialog passes its open state as `epoch`, so it reopens on the whole library.
  const epoch = opts.epoch
  const [seenEpoch, setSeenEpoch] = useState(epoch)
  if (seenEpoch !== epoch) {
    setSeenEpoch(epoch)
    setQ('')
    setCat('All')
    setSource('all')
    setLicense('any')
    setTab('all')
  }

  const list = useMemo(() => {
    const s = fold(q.trim())
    const base: IconMeta[] =
      tab === 'favs'
        ? favs.flatMap((id) => ICON_BY_ID.get(id) ?? [])
        : tab === 'recent'
          ? recent.flatMap((id) => ICON_BY_ID.get(id) ?? [])
          : ICONS
    return base.filter(
      (i) =>
        (cat === 'All' || i.category === cat) &&
        (source === 'all' || sourceOf(i) === source) &&
        (license === 'any' || isOpenLicense(i) === (license === 'open')) &&
        (!s ||
          fold(i.label).includes(s) ||
          fold(i.category).includes(s) ||
          fold(i.author).includes(s) ||
          (i.tags ?? []).some((tag) => fold(tag).includes(s)) ||
          fold(categoryLabel(i.category)).includes(s) ||
          (lang === 'es' && fold(iconNameEs(i.id) ?? '').includes(s))),
    )
  }, [q, cat, source, license, tab, lang, favs, recent])

  const categories = useMemo(
    () => [...CATEGORIES].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), lang)),
    [lang],
  )
  const favSet = useMemo(() => new Set(favs), [favs])

  return {
    q,
    setQ,
    cat,
    setCat,
    source,
    setSource,
    license,
    setLicense,
    tab,
    setTab,
    list,
    categories,
    counts: CATEGORY_COUNTS,
    favSet,
    tabs,
    total: tab === 'favs' ? favs.length : tab === 'recent' ? recent.length : ICONS.length,
    filtered: source !== 'all' || license !== 'any' || cat !== 'All' || q.trim() !== '',
    /** Changes whenever the filters do, so the grid can scroll back to the top. */
    resetKey: `${q}|${cat}|${source}|${license}|${tab}`,
  }
}