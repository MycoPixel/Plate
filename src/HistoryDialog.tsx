import { useEffect, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { t, useLang } from './i18n'
import { getVersion, listVersions, removeVersion } from './versions'
import type { VersionMeta } from './versions'
import type { Doc } from './types'

export function HistoryDialog({
  open,
  figId,
  onClose,
  onSnapshot,
  onRestore,
}: {
  open: boolean
  figId: string | null
  onClose: () => void
  onSnapshot: () => Promise<void>
  onRestore: (doc: Doc, meta: VersionMeta) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const lang = useLang()
  const [rows, setRows] = useState<VersionMeta[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    let live = true
    const load = async () => {
      setBusy(true)
      try {
        const list = await listVersions(figId ?? '')
        if (live) setRows(list)
      } catch {
        if (live) setRows([])
      } finally {
        if (live) setBusy(false)
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [open, figId])

  const refresh = async () => {
    if (!figId) return
    setBusy(true)
    try {
      setRows(await listVersions(figId))
    } catch {
      setRows([])
    } finally {
      setBusy(false)
    }
  }

  const restore = async (meta: VersionMeta) => {
    try {
      const doc = await getVersion(meta.id)
      if (doc) onRestore(doc, meta)
    } catch {
      /* the version is gone or the store is unavailable */
    }
  }

  const drop = async (id: number) => {
    try {
      await removeVersion(id)
      await refresh()
    } catch {
      /* nothing to show; the row stays */
    }
  }

  const when = (at: number) =>
    new Date(at).toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Version history')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {t('EnlacePlot keeps the last 30 versions of this figure while you work, at most one every few minutes. Restoring one first saves the current state as a new version, so nothing is lost.')}
        </p>
        <div className="dialog-actions start">
          <button
            type="button"
            className="btn"
            disabled={!figId || busy}
            onClick={() => {
              void onSnapshot().then(refresh)
            }}
          >
            {t('Save a version now')}
          </button>
        </div>
        {!figId && <p className="note small">{t('Versions start once this figure has been saved in this browser.')}</p>}
        {figId && !busy && rows.length === 0 && <p className="note small">{t('No versions yet. One is saved as you keep working.')}</p>}
        {rows.length > 0 && (
          <ul className="version-list" aria-label={t('Saved versions')}>
            {rows.map((r) => (
              <li key={r.id}>
                <div className="version-when">
                  <strong>{when(r.at)}</strong>
                  <span className="note small">
                    {r.title} · {t('{n} items', { n: r.items })}
                  </span>
                </div>
                <button type="button" className="btn version-restore" onClick={() => void restore(r)}>
                  {t('Restore')}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('Delete this version')}
                  title={t('Delete this version')}
                  onClick={() => void drop(r.id)}
                >
                  <Glyph name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
