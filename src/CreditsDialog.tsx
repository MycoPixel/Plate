import { useEffect, useRef } from 'react'
import { creditsText, usedIcons } from './credits'
import { Glyph } from './Glyph'
import { iconUrl } from './icons'
import { iconLabel, t, useLang } from './i18n'
import type { Doc } from './types'

export function CreditsDialog({
  doc,
  open,
  onClose,
  withCredits,
  setWithCredits,
  onCopied,
}: {
  doc: Doc
  open: boolean
  onClose: () => void
  withCredits: boolean
  setWithCredits: (v: boolean) => void
  onCopied: (ok: boolean) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLang()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const used = usedIcons(doc)
  const text = creditsText(doc)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopied(true)
    } catch {
      onCopied(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Credits for this figure')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>

        {used.length === 0 ? (
          <p className="note">
            {t('No library icons are on the board yet. When you add some, the author and license of each one will be listed here.')}
          </p>
        ) : (
          <>
            <p className="note">
              {t('Most icons are free to use but ask for credit. Put this line in your figure legend or slide notes, or let the export add it under the figure.')}
            </p>
            <ul className="credit-list">
              {used.map((m) => (
                <li key={m.id}>
                  <img src={iconUrl(m)} alt="" />
                  <div>
                    <strong>{iconLabel(m)}</strong>
                    <span>
                      {t('by')}{' '}
                      {m.authorUrl ? (
                        <a href={m.authorUrl} target="_blank" rel="noreferrer">
                          {m.author}
                        </a>
                      ) : (
                        m.author
                      )}
                      ,{' '}
                      <a href={m.licenseUrl} target="_blank" rel="noreferrer">
                        {m.license}
                      </a>
                      ,{' '}
                      <a href={m.source} target="_blank" rel="noreferrer">
                        {new URL(m.source).hostname}
                      </a>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <label className="field wide">
              <span className="sr-only">{t('Credit line')}</span>
              <textarea readOnly rows={4} value={text} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <label className="check">
              <input type="checkbox" checked={withCredits} onChange={(e) => setWithCredits(e.target.checked)} />
              <span>{t('Add the credit line under the figure when exporting')}</span>
            </label>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={copy}>
                <Glyph name="copy" size={16} />
                <span>{t('Copy credit line')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
