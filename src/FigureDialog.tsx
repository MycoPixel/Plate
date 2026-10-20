import { useEffect, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { t, useLang } from './i18n'
import { listFigures, removeFigure } from './store'
import type { FigureMeta } from './store'

/** Thumbnails are drawn as PNGs; older ones are plain SVG. */
const thumbUrl = (f: FigureMeta) =>
  f.thumb.startsWith('data:image/png') ? f.thumb : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.thumb)}`

export function FigureDialog({
  open,
  onClose,
  onOpen,
  onNew,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const lang = useLang()
  const [figs, setFigs] = useState<FigureMeta[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    let live = true
    setFigs(null)
    listFigures().then((list) => {
      if (live) setFigs(list)
    })
    return () => {
      live = false
    }
  }

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
    if (open) window.setTimeout(load, 0)
  }, [open])

  const remove = (f: FigureMeta) => {
    if (!window.confirm(t('Delete “{name}”? This cannot be undone.', { name: f.title }))) return
    setBusyId(f.id)
    removeFigure(f.id).then(() => {
      setBusyId(null)
      load()
      onDelete(f.id)
    })
  }

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('My figures')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">{t('Everything you draw is kept in this browser, so you can come back to it later. Nothing is uploaded anywhere.')}</p>
        {figs === null ? (
          <p className="note">{t('Loading…')}</p>
        ) : figs.length === 0 ? (
          <p className="note">{t('No saved figures yet. Draw something and it appears here.')}</p>
        ) : (
          <ul className="gallery">
            {figs.map((f) => (
              <li key={f.id} className="gallery-item">
                <button
                  type="button"
                  className="gallery-thumb"
                  onClick={() => onOpen(f.id)}
                  aria-label={t('Open {name}', { name: f.title })}
                >
                  {f.thumb ? <img src={thumbUrl(f)} alt="" /> : <Glyph name="file" size={34} />}
                </button>
                <span className="gallery-title">{f.title}</span>
                <span className="note small">{new Date(f.updatedAt).toLocaleString(lang)}</span>
                <button type="button" className="icon-btn" aria-label={t('Open {name}', { name: f.title })} onClick={() => onOpen(f.id)}>
                  <Glyph name="folder" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busyId === f.id}
                  aria-label={t('Delete {name}', { name: f.title })}
                  onClick={() => remove(f)}
                >
                  <Glyph name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            {t('New figure')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
