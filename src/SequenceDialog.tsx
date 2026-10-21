import { useEffect, useMemo, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { t } from './i18n'
import { parseFasta, residueCount } from './sequences'
import type { SequenceOptions } from './sequences'

const SAMPLE = `>sp|P69905|HBA_HUMAN Hemoglobin subunit alpha
VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVAD
ALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFL
ASVSTVLTSKYR`

const LINE_LENGTHS = [50, 60, 70, 80, 100, 120]
const SIZES = [10, 12, 14, 16, 18, 20]

export function SequenceDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (records: ReturnType<typeof parseFasta>, options: SequenceOptions) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState(SAMPLE)
  const [lineLength, setLineLength] = useState(60)
  const [fontSize, setFontSize] = useState(14)
  const [headers, setHeaders] = useState(true)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const records = useMemo(() => parseFasta(text), [text])
  const ok = records.length > 0

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>{t('Sequence from FASTA')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {t('Paste one or more FASTA records. Each sequence becomes monospace text you can move, recolour and resize, with the header above it when you ask for one.')}
        </p>
        <label className="field wide">
          <span>{t('FASTA')}</span>
          <textarea
            rows={7}
            spellCheck={false}
            className="mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t('FASTA')}
          />
        </label>
        {!ok && <p className="note error">{t('No sequence found. Paste FASTA text, with or without a header line.')}</p>}
        <div className="gen-row">
          <label className="field">
            <span>{t('Line length')}</span>
            <select value={lineLength} onChange={(e) => setLineLength(Number(e.target.value))}>
              {LINE_LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('Text size')}</span>
            <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={headers} onChange={(e) => setHeaders(e.target.checked)} />
            <span>{t('Include headers')}</span>
          </label>
        </div>
        {ok && (
          <p className="note small">
            {t('{n} sequences, {m} residues', { n: records.length, m: residueCount(records) })}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => ok && onAdd(records, { lineLength, headers, fontSize })}
          >
            {t('Add to figure')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
