import { useMemo, useState } from 'react'
import { Glyph } from './Glyph'
import { CATEGORIES, ICONS, iconUrl } from './icons'
import { categoryLabel, iconLabel, iconNameEs, t, useLang } from './i18n'

export const ICON_MIME = 'application/x-plate-icon'

const badge = (license: string) => (license.startsWith('CC0') ? 'CC0' : 'BY')

/** Search text without case or accents, so "celula" finds "célula" and "neutrofilo" the drawing. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

export function Palette({ onAdd }: { onAdd: (iconId: string) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const lang = useLang()

  const list = useMemo(() => {
    const s = fold(q.trim())
    return ICONS.filter(
      (i) =>
        (cat === 'All' || i.category === cat) &&
        (!s ||
          fold(i.label).includes(s) ||
          fold(i.category).includes(s) ||
          fold(i.author).includes(s) ||
          (i.tags ?? []).some((tag) => fold(tag).includes(s)) ||
          fold(categoryLabel(i.category)).includes(s) ||
          (lang === 'es' && fold(iconNameEs(i.id) ?? '').includes(s))),
    )
  }, [q, cat, lang])

  const categories = useMemo(
    () => [...CATEGORIES].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), lang)),
    [lang],
  )

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of ICONS) m.set(i.category, (m.get(i.category) ?? 0) + 1)
    return m
  }, [])

  return (
    <aside className="palette" aria-label={t('Icon library')}>
      <div className="palette-head">
        <label className="search">
          <Glyph name="search" size={16} />
          <input
            type="search"
            placeholder={t('Search icons')}
            aria-label={t('Search icons')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select aria-label={t('Category')} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="All">{t('All categories ({n})', { n: ICONS.length })}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)} ({counts.get(c)})
            </option>
          ))}
        </select>
      </div>

      <div className="tiles">
        {list.map((i) => (
          <button
            key={i.id}
            type="button"
            className="tile"
            draggable
            title={t('{name}, by {author} ({license})', { name: iconLabel(i), author: i.author, license: i.license })}
            aria-label={t('Add {name}', { name: iconLabel(i) })}
            onClick={() => onAdd(i.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(ICON_MIME, i.id)
              e.dataTransfer.setData('text/plain', iconLabel(i))
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <img src={iconUrl(i)} alt="" loading="lazy" draggable={false} />
            <span className="tile-name">{iconLabel(i)}</span>
            <span className="tile-lic" data-lic={badge(i.license)}>
              {badge(i.license)}
            </span>
          </button>
        ))}
        {list.length === 0 && (
          <p className="note">{t('No icons match “{q}”. Try a broader word, like “cell” or “tube”.', { q })}</p>
        )}
      </div>

      <p className="palette-foot">
        {t('{n} of {total} icons. Click to add, or drag onto the board. Credits for the icons you use are written for you.', {
          n: list.length,
          total: ICONS.length,
        })}
      </p>
    </aside>
  )
}
