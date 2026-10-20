import { useEffect, useMemo, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { t } from './i18n'
import { parseChartTable } from './charts'
import type { ChartKind, ChartSeries } from './types'

const SAMPLE = `Group\tControl\tDrug A\tDrug B
Cell viability\t8.2 ± 0.6\t5.1 ± 0.4\t3.4 ± 0.5
Apoptosis\t2.1 ± 0.2\t6.8 ± 0.7\t9.3 ± 0.8`

export function ChartDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (series: ChartSeries[], xNames: string[], kind: ChartKind) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState(SAMPLE)
  const [kind, setKind] = useState<ChartKind>('bar')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const parsed = useMemo(() => parseChartTable(text), [text])
  const ok = typeof parsed !== 'string'

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Chart from a table')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {t('Paste a table from Excel or a text editor. The first row names the categories, each row below is one series, and a number like 8.2 ± 0.6 gives that point an error bar.')}
        </p>
        <label className="field wide">
          <span>{t('Table')}</span>
          <textarea rows={6} spellCheck={false} className="mono" value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Table')} />
        </label>
        {!ok && <p className="note error">{parsed}</p>}
        <div className="gen-row">
          <label className="field">
            <span>{t('Chart type')}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>
              <option value="bar">{t('Bar chart')}</option>
              <option value="line">{t('Line graph')}</option>
              <option value="scatter">{t('Scatter plot')}</option>
            </select>
          </label>
          <span className="note small" style={{ alignSelf: 'end' }}>
            {ok
              ? t('{n} series, {m} categories', { n: parsed.series.length, m: parsed.xNames.length })
              : ''}
          </span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => ok && onAdd(parsed.series, parsed.xNames, kind)}>
            {t('Add to figure')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
