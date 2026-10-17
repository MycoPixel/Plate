import { useEffect, useRef, useState } from 'react'
import { Glyph } from './Glyph'
import { renderSmiles } from './structure'
import type { StructureImage } from './structure'

const EXAMPLES: [string, string][] = [
  ['Benzene', 'c1ccccc1'],
  ['Caffeine', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C'],
  ['Aspirin', 'CC(=O)OC1=CC=CC=C1C(=O)O'],
  ['Glucose', 'OCC1OC(O)C(O)C(O)C1O'],
  ['Adenine', 'Nc1ncnc2[nH]cnc12'],
  ['Ethanol', 'CCO'],
]

export function StructureDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (smiles: string, color: boolean, image: StructureImage) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [smiles, setSmiles] = useState('CN1C=NC2=C1C(=O)N(C(=O)N2C)C')
  const [color, setColor] = useState(true)
  const [preview, setPreview] = useState<StructureImage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Redraw the preview shortly after typing stops.
  useEffect(() => {
    if (!open) return
    let live = true
    const t = window.setTimeout(() => {
      renderSmiles(smiles, color).then(
        (img) => {
          if (!live) return
          setPreview(img)
          setError(null)
        },
        (e: unknown) => {
          if (!live) return
          setPreview(null)
          setError(e instanceof Error ? e.message : 'Could not draw that structure.')
        },
      )
    }, 250)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [smiles, color, open])

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-head">
          <h2>Chemical structure</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Glyph name="close" />
          </button>
        </header>
        <p className="note">
          Paste a SMILES string and Plate draws the skeletal structure as an editable picture you can place,
          resize and export with the rest of the figure.
        </p>
        <label className="field wide">
          <span>SMILES</span>
          <textarea
            rows={2}
            spellCheck={false}
            className="mono"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            aria-label="SMILES"
          />
        </label>
        <div className="chips" role="group" aria-label="Examples">
          {EXAMPLES.map(([name, s]) => (
            <button key={name} type="button" className="mini" onClick={() => setSmiles(s)}>
              {name}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={color} onChange={(e) => setColor(e.target.checked)} />
          <span>Colour the heteroatoms (N, O, S, halogens)</span>
        </label>
        <div className="structure-preview" aria-live="polite">
          {preview && !error && <img src={preview.src} alt="Preview of the structure" />}
          {error && <p className="note error">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!preview || !!error}
            onClick={() => preview && onAdd(smiles.trim(), color, preview)}
          >
            Add to figure
          </button>
        </div>
      </div>
    </dialog>
  )
}
