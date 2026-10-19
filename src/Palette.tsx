import { IconFilterHead, IconGrid } from './IconGrid'
import { useIconFilter } from './iconFilter'
import { t } from './i18n'

export function Palette({ onAdd }: { onAdd: (iconId: string) => void }) {
  const f = useIconFilter({ tabs: true })

  const emptyNote =
    f.list.length !== 0
      ? undefined
      : f.tab === 'favs' && !f.filtered
        ? t('No favorites yet. Click the star on an icon to keep it here.')
        : f.tab === 'recent' && !f.filtered
          ? t('Nothing used yet. Icons you add to the board show up here.')
          : t('No icons match “{q}”. Try a broader word, like “cell” or “tube”.', { q: f.q })

  return (
    <aside className="palette" aria-label={t('Icon library')}>
      <div className="palette-head">
        <IconFilterHead f={f} />
      </div>

      <IconGrid
        list={f.list}
        favSet={f.favSet}
        onPick={onAdd}
        total={f.total}
        draggable
        emptyNote={emptyNote}
        resetKey={f.resetKey}
        hint={t('Click to add, or drag onto the board. Credits for the icons you use are written for you.')}
      />
    </aside>
  )
}