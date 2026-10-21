import { useEffect, useRef } from 'react'
import { Glyph } from './Glyph'
import { t } from './i18n'
import { TEMPLATES } from './templates'
import type { Template } from './templates'

export function TemplateDialog({
  open,
  onClose,
  onPick,
  dirty,
}: {
  open: boolean
  onClose: () => void
  onPick: (tpl: Template) => void
  /** The current board has something on it, so say what is about to happen. */
  dirty: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Start from a template')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {dirty
            ? t('This replaces what is on the board. Undo brings your figure back.')
            : t('A starting layout you can change however you like.')}
        </p>
        <ul className="tpl-list">
          {TEMPLATES.map((tpl) => (
            <li key={tpl.id}>
              <button type="button" className="tpl" onClick={() => onPick(tpl)}>
                <span className="tpl-label">{t(tpl.label)}</span>
                <span className="note small">{t(tpl.hint)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </dialog>
  )
}