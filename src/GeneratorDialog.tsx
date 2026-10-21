import { useEffect, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { PLATE_PRESETS } from './generators'
import type { GelOptions, PanelOptions, PetriPattern, PlatePresetId } from './generators'
import { t } from './i18n'

export type GeneratorKind = 'plate' | 'gel' | 'petri' | 'panels'

export type GeneratorRequest =
  | { kind: 'plate'; preset: PlatePresetId }
  | { kind: 'gel'; options: GelOptions }
  | { kind: 'petri'; pattern: PetriPattern }
  | { kind: 'panels'; options: PanelOptions }

const clampInt = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)))

const PATTERNS: { id: PetriPattern; label: string }[] = [
  { id: 'colonies', label: 'Colonies' },
  { id: 'streaks', label: 'Streaks' },
  { id: 'dilution', label: 'Serial dilution' },
  { id: 'inhibition', label: 'Inhibition zones' },
]

export function GeneratorDialog({
  open,
  kind,
  onClose,
  onInsert,
}: {
  open: boolean
  kind: GeneratorKind
  onClose: () => void
  onInsert: (req: GeneratorRequest) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [preset, setPreset] = useState<PlatePresetId>('96')
  const [pattern, setPattern] = useState<PetriPattern>('colonies')
  const [lanes, setLanes] = useState(6)
  const [bands, setBands] = useState(5)
  const [blot, setBlot] = useState(false)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(2)
  const [gap, setGap] = useState(24)
  const [labels, setLabels] = useState<PanelOptions['labels']>('letters')
  const [frame, setFrame] = useState(true)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const plate = kind === 'plate'
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>
            {plate ? t('Well plate') : kind === 'gel' ? t('Gel or blot') : kind === 'petri' ? t('Petri dish') : t('Panel grid')}
          </h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {plate
            ? t('A grid of wells with row letters and column numbers, added to the board as ordinary shapes you can repaint and move.')
            : kind === 'gel'
              ? t('Numbered lanes with evenly spaced bands, added as ordinary shapes. Use them as a starting point and drag the bands to match your data.')
              : kind === 'petri'
                ? t('An agar plate with colonies, streaks, dilution spots or an inhibition zone, added as ordinary shapes.')
                : t('Empty panels with a letter or number in each corner, so every part of the figure has a place. The frames are ordinary shapes.')}
        </p>
        {plate ? (
          <label className="field wide">
            <span>{t('Plate size')}</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as PlatePresetId)}>
              {PLATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.label)}
                </option>
              ))}
            </select>
          </label>
        ) : kind === 'gel' ? (
          <>
            <div className="gen-row">
              <label className="field">
                <span>{t('Lanes')}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={lanes}
                  onChange={(e) => setLanes(clampInt(e.target.value, 1, 12))}
                />
              </label>
              <label className="field">
                <span>{t('Bands per lane')}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={bands}
                  onChange={(e) => setBands(clampInt(e.target.value, 1, 10))}
                />
              </label>
              <label className="field">
                <span>{t('Type')}</span>
                <select value={blot ? 'blot' : 'gel'} onChange={(e) => setBlot(e.target.value === 'blot')}>
                  <option value="gel">{t('Gel')}</option>
                  <option value="blot">{t('Western blot')}</option>
                </select>
              </label>
            </div>
            <p className="note small">
              {t('Bands are placed evenly. Select one and drag it to line it up with a ladder.')}
            </p>
          </>
        ) : kind === 'petri' ? (
          <label className="field wide">
            <span>{t('Plate pattern')}</span>
            <select value={pattern} onChange={(e) => setPattern(e.target.value as PetriPattern)}>
              {PATTERNS.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {t(pt.label)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <div className="gen-row">
              <label className="field">
                <span>{t('Rows')}</span>
                <input type="number" min={1} max={6} value={rows} onChange={(e) => setRows(clampInt(e.target.value, 1, 6))} />
              </label>
              <label className="field">
                <span>{t('Columns')}</span>
                <input type="number" min={1} max={6} value={cols} onChange={(e) => setCols(clampInt(e.target.value, 1, 6))} />
              </label>
              <label className="field">
                <span>{t('Gap')}</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={gap}
                  onChange={(e) => setGap(clampInt(e.target.value, 0, 120))}
                />
              </label>
            </div>
            <div className="gen-row">
              <label className="field">
                <span>{t('Labels')}</span>
                <select value={labels} onChange={(e) => setLabels(e.target.value as PanelOptions['labels'])}>
                  <option value="letters">{t('A, B, C…')}</option>
                  <option value="numbers">{t('1, 2, 3…')}</option>
                  <option value="none">{t('None')}</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} />
                <span>{t('Draw a frame around each panel')}</span>
              </label>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onInsert(
                plate
                  ? { kind: 'plate', preset }
                  : kind === 'gel'
                    ? { kind: 'gel', options: { lanes, bands, kind: blot ? 'blot' : 'gel' } }
                    : kind === 'petri'
                      ? { kind: 'petri', pattern }
                      : { kind: 'panels', options: { rows, cols, gap, labels, frame } },
              )
            }
          >
            {t('Add to figure')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
