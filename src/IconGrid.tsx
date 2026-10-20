import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Glyph } from './Glyph'
import { ICONS, iconUrl, SOURCES } from './icons'
import type { SourceId } from './icons'
import { CATEGORY_COUNTS, ICON_MIME, licenseBadge } from './iconFilter'
import type { IconFilter, Tab, LicenseFilter } from './iconFilter'
import { categoryLabel, iconLabel, t } from './i18n'
import { toggleFavorite } from './library'
import type { IconMeta } from './types'

// The grid draws only the rows in view, so these have to match App.css exactly.
const TILE_H = 120
const GAP = 8
const PAD = 12
const MIN_TILE = 100
const OVERSCAN = 3

/** The standard search box, category list, source and license selects. */
export function IconFilterHead({ f }: { f: IconFilter }) {
  const favCount = f.favSet.size
  return (
    <>
      <label className="search">
        <Glyph name="search" size={16} />
        <input
          type="search"
          placeholder={t('Search icons')}
          aria-label={t('Search icons')}
          value={f.q}
          onChange={(e) => f.setQ(e.target.value)}
        />
      </label>
      {f.tabs && (
        <div className="seg" role="group" aria-label={t('Show')}>
          {(
            [
              ['all', t('All')],
              ['favs', `${t('Favorites')}${favCount ? ` (${favCount})` : ''}`],
              ['recent', t('Recent')],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={f.tab === id} onClick={() => f.setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <select aria-label={t('Category')} value={f.cat} onChange={(e) => f.setCat(e.target.value)}>
        <option value="All">{t('All categories ({n})', { n: ICONS.length })}</option>
        {f.categories.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)} ({CATEGORY_COUNTS.get(c)})
          </option>
        ))}
      </select>
      <div className="grid2">
        <select
          aria-label={t('Source')}
          value={f.source}
          onChange={(e) => f.setSource(e.target.value as SourceId | 'all')}
        >
          <option value="all">{t('All sources')}</option>
          {SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.label)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('License')}
          value={f.license}
          onChange={(e) => f.setLicense(e.target.value as LicenseFilter)}
        >
          <option value="any">{t('Any license')}</option>
          <option value="open">{t('CC0 and public domain')}</option>
          <option value="credit">{t('Needs credit (CC BY, MIT)')}</option>
        </select>
      </div>
    </>
  )
}

type Props = {
  list: IconMeta[]
  favSet: Set<string>
  onPick: (iconId: string) => void
  /** Changes whenever the filters do, so the grid scrolls back to the top. */
  resetKey: string
  /** Extra wording after the results count, e.g. "Click to add, or drag onto the board." */
  hint?: ReactNode
  /** How many icons the library holds, for the "{n} of {total}" count. */
  total?: number
  /** Fixed height, used where the grid is not in a flex column (dialogs). */
  height?: number
  /** Shown when nothing matched. */
  emptyNote?: ReactNode
  /** Tiles can be dragged onto the board. Off where there is no board to drop on. */
  draggable?: boolean
}

/**
 * A windowed grid of icon tiles. The library holds 2,886 drawings, far too many to
 * keep in the DOM at once, so only the rows near the viewport are rendered and the
 * rest is left as scroll space.
 */
export function IconGrid({
  list,
  favSet,
  onPick,
  resetKey,
  hint,
  total,
  height,
  emptyNote,
  draggable,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Filtered down to nothing new: drop the scroll, or the padding below leaves a gap.
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setScrollTop(0)
  }
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [resetKey])

  // Until the scroll box has been measured there is nowhere to put a tile; that is
  // also the case for a grid inside a dialog that is not open yet.
  const cols = box.w > 0 ? Math.max(1, Math.floor((box.w - PAD * 2 + GAP) / (MIN_TILE + GAP))) : 0
  const colW = cols ? (box.w - PAD * 2 - (cols - 1) * GAP) / cols : 0
  const rows = cols ? Math.ceil(list.length / cols) : 0
  const step = TILE_H + GAP
  const first = Math.max(0, Math.min(rows, Math.floor(scrollTop / step) - OVERSCAN))
  const last = Math.max(first, Math.min(rows, Math.ceil((scrollTop + box.h) / step) + OVERSCAN))
  const start = first * cols
  const visible = cols ? list.slice(start, last * cols) : []

  // The scroll box is exactly as tall as the whole list, so the scrollbar never jumps.
  const style = {
    ...(height ? { height } : null),
  } as CSSProperties

  return (
    <>
      <div
        ref={ref}
        className="tiles"
        style={style}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="tiles-canvas" style={{ height: rows * step }}>
          {visible.map((i, n) => (
            <div
              key={i.id}
              className="tile-wrap"
              style={{
                top: Math.floor((start + n) / cols) * step,
                left: ((start + n) % cols) * (colW + GAP),
                width: colW,
              }}
            >
              <button
                type="button"
                className="tile"
                draggable={draggable}
                title={t('{name}, by {author} ({license})', {
                  name: iconLabel(i),
                  author: i.author,
                  license: i.license,
                })}
                aria-label={t('Add {name}', { name: iconLabel(i) })}
                onClick={() => onPick(i.id)}
                onDragStart={(e) => {
                  if (!draggable) return
                  e.dataTransfer.setData(ICON_MIME, i.id)
                  e.dataTransfer.setData('text/plain', iconLabel(i))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <img src={iconUrl(i)} alt="" loading="lazy" draggable={false} />
                <span className="tile-name">{iconLabel(i)}</span>
                <span className="tile-lic" data-lic={licenseBadge(i)}>
                  {licenseBadge(i)}
                </span>
              </button>
              <button
                type="button"
                className="tile-fav"
                aria-pressed={favSet.has(i.id)}
                aria-label={t(
                  favSet.has(i.id) ? 'Remove {name} from favorites' : 'Add {name} to favorites',
                  { name: iconLabel(i) },
                )}
                title={t(favSet.has(i.id) ? 'Remove from favorites' : 'Add to favorites')}
                onClick={() => toggleFavorite(i.id)}
              >
                {favSet.has(i.id) ? '★' : '☆'}
              </button>
            </div>
          ))}
        </div>
        {list.length === 0 && emptyNote && <p className="note">{emptyNote}</p>}
      </div>

      <p className="palette-foot">
        {t('{n} of {total} icons.', { n: list.length, total: total ?? list.length })} {hint}
      </p>
    </>
  )
}