import { useEffect, useRef } from 'react'
import { Glyph } from './Glyph'
import { IconFilterHead, IconGrid } from './IconGrid'
import { useIconFilter } from './iconFilter'
import { t } from './i18n'
import type { IconMeta } from './types'

export function ReplaceIconDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (meta: IconMeta) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const f = useIconFilter({ tabs: false, epoch: open })

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog dialog-wide"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Replace icon')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {t(
            'Pick another drawing. The icon stays exactly where it is, at the same size, and keeps any colours you set on it.',
          )}
        </p>
        <div className="replace-head">
          <IconFilterHead f={f} />
        </div>
        <IconGrid
          list={f.list}
          favSet={f.favSet}
          onPick={(id) => {
            const meta = f.list.find((i) => i.id === id)
            if (meta) onPick(meta)
          }}
          total={f.total}
          height={360}
          resetKey={f.resetKey}
          emptyNote={t('No icons match “{q}”. Try a broader word, like “cell” or “tube”.', { q: f.q })}
          hint={t('Click a drawing to use it.')}
        />
      </div>
    </dialog>
  )
}