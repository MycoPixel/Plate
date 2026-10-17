import { useMemo, useState } from 'react'
import { Glyph } from './Glyph'
import { CATEGORIES, ICONS, iconUrl } from './icons'

export const ICON_MIME = 'application/x-plate-icon'

const badge = (license: string) => (license.startsWith('CC0') ? 'CC0' : 'BY')

export function Palette({ onAdd }: { onAdd: (iconId: string) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ICONS.filter(
      (i) =>
        (cat === 'All' || i.category === cat) &&
        (!s ||
          i.label.toLowerCase().includes(s) ||
          i.category.toLowerCase().includes(s) ||
          i.author.toLowerCase().includes(s)),
    )
  }, [q, cat])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of ICONS) m.set(i.category, (m.get(i.category) ?? 0) + 1)
    return m
  }, [])

  return (
    <aside className="palette" aria-label="Icon library">
      <div className="palette-head">
        <label className="search">
          <Glyph name="search" size={16} />
          <input
            type="search"
            placeholder="Search icons"
            aria-label="Search icons"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="All">All categories ({ICONS.length})</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c} ({counts.get(c)})
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
            title={`${i.label}, by ${i.author} (${i.license})`}
            aria-label={`Add ${i.label}`}
            onClick={() => onAdd(i.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(ICON_MIME, i.id)
              e.dataTransfer.setData('text/plain', i.label)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <img src={iconUrl(i)} alt="" loading="lazy" draggable={false} />
            <span className="tile-name">{i.label}</span>
            <span className="tile-lic" data-lic={badge(i.license)}>
              {badge(i.license)}
            </span>
          </button>
        ))}
        {list.length === 0 && (
          <p className="note">No icons match “{q}”. Try a broader word, like “cell” or “tube”.</p>
        )}
      </div>

      <p className="palette-foot">
        {list.length} of {ICONS.length} icons. Click to add, or drag onto the board. Credits for the
        icons you use are written for you.
      </p>
    </aside>
  )
}
