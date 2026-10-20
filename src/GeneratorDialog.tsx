import { useEffect, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { PLATE_PRESETS } from './generators'
import type { GelOptions, PlatePresetId } from './generators'
import { t } from './i18n'

export type GeneratorKind = 'plate' | 'gel'

export type GeneratorRequest =
  | { kind: 'plate'; preset: PlatePresetId }
  | { kind: 'gel'; options: GelOptions }

const clampInt = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)))

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
  const [lanes, setLanes] = useState(6)
  const [bands, setBands] = useState(5)
  const [blot, setBlot] = useState(false)

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
          <h2>{plate ? t('Well plate') : t('Gel or blot')}</h2>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          {plate
            ? t('A grid of wells with row letters and column numbers, added to the board as ordinary shapes you can repaint and move.')
            : t('Numbered lanes with evenly spaced bands, added as ordinary shapes. Use them as a starting point and drag the bands to match your data.')}
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
        ) : (
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
                  : { kind: 'gel', options: { lanes, bands, kind: blot ? 'blot' : 'gel' } },
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
