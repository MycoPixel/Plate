import { useEffect, useMemo, useRef, useState } from 'react'
import { exportLayout, pngSize } from './export'
import { Glyph } from './Glyph'
import { t, useLang } from './i18n'
import type { Doc } from './types'

export type ExportRequest = {
  format: 'png' | 'svg' | 'pdf'
  /** Set when only the selection is exported. */
  onlyIds?: string[]
  /** Physical width of the exported figure (PNG and PDF). */
  widthMm: number
  /** Pixels per inch (PNG). */
  dpi: number
}

type Preset = 'board' | 'nature1' | 'nature2' | 'custom'
const PRESET_MM: Partial<Record<Preset, number>> = { nature1: 89, nature2: 183 }
const DPIS = [72, 150, 300, 600]
const round1 = (n: number) => Math.round(n * 10) / 10

export function ExportDialog({
  doc,
  open,
  onClose,
  selectionIds,
  withCredits,
  setWithCredits,
  busy,
  onRun,
}: {
  doc: Doc
  open: boolean
  onClose: () => void
  selectionIds: string[]
  withCredits: boolean
  setWithCredits: (v: boolean) => void
  busy: boolean
  onRun: (req: ExportRequest) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLang()
  const [format, setFormat] = useState<ExportRequest['format']>('png')
  const [area, setArea] = useState<'board' | 'selection'>('board')
  const [preset, setPreset] = useState<Preset>('board')
  const [customMm, setCustomMm] = useState(100)
  const [dpi, setDpi] = useState(300)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const hasSelection = selectionIds.length > 0
  const onlyIds = area === 'selection' && hasSelection ? selectionIds : undefined
  const layout = useMemo(() => (open ? exportLayout(doc, withCredits, { onlyIds }) : null), [open, doc, withCredits, onlyIds])

  const width = layout?.width ?? 1
  const height = layout?.height ?? 1
  const widthMm = preset === 'board' ? round1((width * 25.4) / 96) : preset === 'custom' ? customMm : (PRESET_MM[preset] ?? customMm)
  const heightMm = round1((widthMm * height) / width)
  const scale = (widthMm / 25.4 * dpi) / width
  const px = pngSize(width, height, scale)

  const run = () => onRun({ format, onlyIds, widthMm, dpi })

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Export figure')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>

        <div className="export-grid">
          <label className="field">
            <span>{t('Format')}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportRequest['format'])}>
              <option value="png">{t('PNG image')}</option>
              <option value="svg">{t('SVG, editable vectors')}</option>
              <option value="pdf">{t('PDF, vector')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Area')}</span>
            <select value={hasSelection ? area : 'board'} onChange={(e) => setArea(e.target.value as 'board' | 'selection')}>
              <option value="board">{t('Whole board')}</option>
              <option value="selection" disabled={!hasSelection}>
                {t('Selection only')}
              </option>
            </select>
          </label>

          {format !== 'svg' && (
            <>
              <label className="field">
                <span>{t('Size')}</span>
                <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                  <option value="board">{t('Board size at 96 dpi')}</option>
                  <option value="nature1">{t('Nature, 1 column (89 mm)')}</option>
                  <option value="nature2">{t('Nature, 2 columns (183 mm)')}</option>
                  <option value="custom">{t('Custom width')}</option>
                </select>
              </label>
              <label className="field">
                <span>{t('Width (mm)')}</span>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  step={1}
                  value={widthMm}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber
                    if (Number.isFinite(n) && n > 0) {
                      setCustomMm(Math.min(2000, n))
                      setPreset('custom')
                    }
                  }}
                />
              </label>
            </>
          )}
          {format === 'png' && (
            <label className="field">
              <span>{t('Resolution (dpi)')}</span>
              <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                {DPIS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {format === 'png' && (
          <p className="export-summary">
            {t('{w} × {h} px at {dpi} dpi ({wmm} × {hmm} mm)', { w: px.w, h: px.h, dpi, wmm: widthMm, hmm: heightMm })}
          </p>
        )}
        {format === 'pdf' && <p className="export-summary">{t('{wmm} × {hmm} mm, vector', { wmm: widthMm, hmm: heightMm })}</p>}
        {format === 'png' && px.limited && (
          <p className="note error">{t('A PNG can be at most 8000 px on its longest side, so the real resolution is lower than asked.')}</p>
        )}
        {format === 'pdf' && (
          <p className="note">
            {t('Your browser’s print window opens. Choose “Save as PDF” as the destination; the page is already the size of the figure.')}
          </p>
        )}
        {format !== 'svg' && preset !== 'board' && preset !== 'custom' && (
          <p className="note">{t('Journal sizes are only a starting point. Check your journal’s author guidelines.')}</p>
        )}

        <label className="check">
          <input type="checkbox" checked={withCredits} onChange={(e) => setWithCredits(e.target.checked)} />
          <span>{t('Add the credit line under the figure when exporting')}</span>
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>
            <Glyph name="download" size={16} />
            <span>{busy ? t('Exporting…') : t('Export')}</span>
          </button>
        </div>
      </div>
    </dialog>
  )
}
