import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ARTBOARDS, defaultBend } from './defaults'
import { FONTS } from './geometry'
import { Glyph } from './Glyph'
import type { GlyphName } from './Glyph'
import { iconLabel, t, useLang } from './i18n'
import { getIcon, ICON_BY_ID, ICONS, iconUrl, useIconCacheVersion } from './icons'
import { markerNumber } from './markers'
import { membraneLayout } from './membrane'
import { colourConflicts, itemColours, PALETTES } from './palettes'
import type { Anchor, ChartItem, ChartSeries, Doc, FontId, ImageItem, IconMeta, Item, MembraneItem, ShapeItem } from './types'
import { isColor, round2 } from './util'

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
/** What an arrange button does: line items up with each other, with the board, or space them evenly. */
export type ArrangeOp =
  | { kind: 'align'; to: Align }
  | { kind: 'board'; to: Align }
  | { kind: 'distribute'; axis: 'h' | 'v' }
export type Order = 'front' | 'forward' | 'backward' | 'back'

type Props = {
  doc: Doc
  selected: Item[]
  focusTextTick: number
  patch: (ids: string[], p: Record<string, unknown>, key?: string) => void
  patchDoc: (p: Partial<Doc>, key?: string) => void
  onDuplicate: () => void
  onRepeat: (count: number, dx: number, dy: number) => void
  onDelete: () => void
  onOrder: (o: Order) => void
  onArrange: (a: ArrangeOp) => void
  onZoomSelection: () => void
  onFit: () => void
  onSelect: (ids: string[], additive: boolean) => void
  onToggle: (id: string, flag: 'hidden' | 'locked') => void
  onGroup: () => void
  onUngroup: () => void
  onScale: (factor: number) => void
  onRedrawStructure: (id: string, smiles: string, color: boolean) => Promise<boolean>
  onReplaceIcon: () => void
  onPalette: (colors: string[]) => void
}

function RepeatSection({ onRepeat }: { onRepeat: (count: number, dx: number, dy: number) => void }) {
  const [n, setN] = useState(3)
  const [dx, setDx] = useState(48)
  const [dy, setDy] = useState(48)
  return (
    <Section title={t('Repeat')}>
      <div className="grid2">
        <Num label={t('Copies')} value={n} min={1} max={50} onChange={(v) => setN(Math.round(v))} />
        <Num label={t('Step X')} value={dx} onChange={setDx} />
        <Num label={t('Step Y')} value={dy} onChange={setDy} />
      </div>
      <button
        type="button"
        className="mini"
        onClick={() => onRepeat(Math.max(1, Math.min(50, Math.round(n))), dx, dy)}
      >
        {t('Add copies')}
      </button>
    </Section>
  )
}

function PaletteSection({ selected, onPalette }: { selected: Item[]; onPalette: (colors: string[]) => void }) {
  const conflicts = useMemo(
    () => colourConflicts(selected.flatMap(itemColours)),
    [selected],
  )
  const first = conflicts[0]
  return (
    <Section title={t('Accessible palette')}>
      <p className="note small">{t('Apply a colourblind-safe palette to the selected shapes, text, markers, arrows and charts, in layer order.')}</p>
      <div className="palette-list">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="palette-btn"
            title={t(p.label)}
            aria-label={t(p.label)}
            onClick={() => onPalette(p.colors)}
          >
            <span className="palette-strip" aria-hidden="true">
              {p.colors.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span>{t(p.label)}</span>
          </button>
        ))}
      </div>
      {first ? (
        <p className="note error">
          {t('{n} colour pairs may be hard to tell apart under colour blindness. The closest is {a} and {b} ({vision}).', {
            n: conflicts.length,
            a: first.a,
            b: first.b,
            vision: t(first.vision === 'deuteranopia' ? 'Deuteranopia' : 'Protanopia'),
          })}
        </p>
      ) : (
        <p className="note small">{t('No very close colour pairs found under deuteranopia or protanopia.')}</p>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sec">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={round2(value)}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

const asHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000')
const safeColor = (c: string, fb: string) => (isColor(c) ? c : fb)

function Color({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string
  value: string
  onChange: (c: string) => void
  allowNone?: boolean
}) {
  const none = value === 'none'
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-row">
        <input
          type="color"
          aria-label={label}
          value={asHex(none ? '#ffffff' : value)}
          onChange={(e) => onChange(safeColor(e.target.value, value))}
        />
        {allowNone && (
          <button type="button" className="mini" aria-pressed={none} onClick={() => onChange(none ? '#DCE7EE' : 'none')}>
            {t('None')}
          </button>
        )}
      </div>
    </div>
  )
}

function IconBtn({
  icon,
  label,
  onClick,
  pressed,
  disabled,
}: {
  icon: GlyphName
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph name={icon} />
    </button>
  )
}

const SHAPE_NAMES: Record<ShapeItem['shape'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  bracket: 'Bracket',
  brace: 'Brace',
  callout: 'Callout',
  poly: 'Polygon',
  path: 'Curve',
}

function nameOf(it: Item, doc?: Doc): string {
  switch (it.type) {
    case 'icon':
      { const m = ICON_BY_ID.get(it.iconId); return m ? iconLabel(m) : t('Icon') }
    case 'text':
      if (it.legend) return t('Marker legend')
      return it.text.split('\n')[0].slice(0, 28) || t('Text')
    case 'image':
      return it.smiles ? t('Structure') : (it.name ?? t('Image'))
    case 'membrane':
      return t('Membrane')
    case 'marker': {
      const n = doc ? markerNumber(doc, it.id) : 1
      return it.label.trim() ? `${n}  ${it.label.trim()}` : `${n}  ${t('Marker')}`
    }
    case 'arrow':
      return it.head === 'none' ? t('Line') : it.kind === 'elbow' ? t('Elbow arrow') : it.kind === 'curve' ? t('Curved arrow') : t('Arrow')
    case 'shape':
      return t(SHAPE_NAMES[it.shape])
    case 'chart':
      return it.title.trim() || t('Chart')
  }
}

function Layers({ doc, selected, onSelect, onToggle }: Pick<Props, 'doc' | 'selected' | 'onSelect' | 'onToggle'>) {
  const ids = new Set(selected.map((s) => s.id))
  const rows = [...doc.items].reverse()
  return (
    <Section title={t('Layers')}>
      {rows.length === 0 ? (
        <p className="note">{t('Nothing here yet.')}</p>
      ) : (
        <ul className="layers">
          {rows.map((it) => {
            const meta = it.type === 'icon' ? ICON_BY_ID.get(it.iconId) : undefined
            const glyph: GlyphName = it.type === 'image' ? 'image' : it.type === 'text' ? 'text' : it.type === 'arrow' ? 'arrow' : it.type === 'membrane' ? 'membrane' : it.type === 'shape' ? (it.shape === 'rect' ? 'rect' : 'ellipse') : 'file'
            return (
              <li key={it.id} data-hidden={it.hidden || undefined}>
                <button
                  type="button"
                  className="layer"
                  aria-pressed={ids.has(it.id)}
                  onClick={(e) => onSelect([it.id], e.shiftKey)}
                >
                  {meta ? (
                    <img src={iconUrl(meta)} alt="" draggable={false} />
                  ) : it.type === 'image' ? (
                    <img src={it.src} alt="" draggable={false} />
                  ) : (
                    <Glyph name={glyph} size={16} />
                  )}
                  <span>{nameOf(it, doc)}</span>
                  {it.group && <Glyph name="group" size={13} />}
                </button>
                <IconBtn
                  icon={it.hidden ? 'eyeOff' : 'eye'}
                  label={t(it.hidden ? 'Show {name}' : 'Hide {name}', { name: nameOf(it, doc) })}
                  onClick={() => onToggle(it.id, 'hidden')}
                />
                <IconBtn
                  icon={it.locked ? 'lock' : 'unlock'}
                  label={t(it.locked ? 'Unlock {name}' : 'Lock {name}', { name: nameOf(it, doc) })}
                  onClick={() => onToggle(it.id, 'locked')}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/** The rest of the icon's colours, behind a toggle so the most used ones stay prominent. */
function MoreColours({
  palette,
  colors,
  set,
}: {
  palette: string[]
  colors: Record<string, string> | undefined
  set: (p: Record<string, unknown>, f: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rest = palette.slice(12)
  return (
    <div className="more-colours">
      <button type="button" className="mini" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? t('Fewer colours') : t('{n} more colours', { n: rest.length })}
      </button>
      {open && (
        <div className="swatches">
          {rest.map((orig) => (
            <input
              key={orig}
              type="color"
              aria-label={t('Recolour {hex}', { hex: orig })}
              title={orig}
              value={colors?.[orig] ?? orig}
              onChange={(e) => {
                const next = { ...(colors ?? {}), [orig]: e.target.value }
                if (e.target.value.toLowerCase() === orig) delete next[orig]
                set({ colors: Object.keys(next).length ? next : undefined }, `col:${orig}`)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const LIPIDS = ICONS.filter((m) => m.category === 'Cell membrane' && /lipid/.test(m.id))

/** The host name of an icon's source page, or the text itself when it is not a real URL. */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * A list of numbers you can type over: the text stays exactly as typed until the field
 * loses focus, while every finished number is applied to the figure at once. The old
 * version wrote the parsed numbers straight back, so typing "0.5" collapsed to "0" after
 * the first keystroke.
 */
function NumberListField({ value, onCommit, rows = 2 }: { value: number[]; onCommit: (nums: number[]) => void; rows?: number }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <textarea
      rows={rows}
      className="mono"
      value={text ?? value.map((v) => String(v)).join(', ')}
      onChange={(e) => {
        setText(e.target.value)
        onCommit(
          e.target.value
            .split(/[,\s]+/)
            .map((w) => w.trim())
            .filter((w) => w.length > 0 && Number.isFinite(Number(w)))
            .map((w) => Number(w)),
        )
      }}
      onBlur={() => setText(null)}
    />
  )
}

/** Settings of a membrane: which lipid, how many layers, and how tightly and evenly they are packed. */
/** The data behind a chart: series names, colours, values and error bars. */
function ChartSection({
  item,
  onSet,
}: {
  item: ChartItem
  onSet: (p: Record<string, unknown>, f: string) => void
}) {
  const series = item.series
  const setSeries = (next: ChartSeries[], f: string) => onSet({ series: next }, f)
  const edit = (si: number, p: Partial<ChartSeries>) => {
    const next = series.slice()
    next[si] = { ...next[si], ...p }
    setSeries(next, 'cs')
  }
  return (
    <Section title={t('Data')}>
      <label className="field wide">
        <span>{t('Chart type')}</span>
        <select value={item.kind} onChange={(e) => onSet({ kind: e.target.value }, 'ckind')}>
          <option value="bar">{t('Bar chart')}</option>
          <option value="line">{t('Line graph')}</option>
          <option value="scatter">{t('Scatter plot')}</option>
        </select>
      </label>
      <div className="grid2">
        <label className="field wide">
          <span>{t('Title')}</span>
          <input value={item.title} maxLength={80} onChange={(e) => onSet({ title: e.target.value }, 'ctitle')} />
        </label>
        <label className="field wide">
          <span>{t('Top of y axis, 0 for auto')}</span>
          <input type="number" min={0} value={item.yMax} onChange={(e) => onSet({ yMax: Math.max(0, e.target.valueAsNumber || 0) }, 'cymax')} />
        </label>
        <label className="field wide">
          <span>{t('Y axis label')}</span>
          <input value={item.yLabel} maxLength={60} onChange={(e) => onSet({ yLabel: e.target.value }, 'cylab')} />
        </label>
        <label className="field wide">
          <span>{t('X axis label')}</span>
          <input value={item.xLabel} maxLength={60} onChange={(e) => onSet({ xLabel: e.target.value }, 'cxlab')} />
        </label>
      </div>
      <label className="field wide">
        <span>{t('Categories, separated by commas')}</span>
        <input
          value={item.xNames.join(', ')}
          onChange={(e) => onSet({ xNames: e.target.value.split(',').map((w) => w.trim()).filter((w) => w) }, 'cxn')}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={item.showGrid} onChange={(e) => onSet({ showGrid: e.target.checked }, 'cgrid')} />
        <span>{t('Show grid lines')}</span>
      </label>
      {series.map((sr, si) => (
        <div key={si} className="chart-series">
          <div className="color-row">
            <input type="color" aria-label={t('Series colour')} value={sr.color} onChange={(e) => edit(si, { color: e.target.value })} />
            <input
              type="text"
              aria-label={t('Series name')}
              value={sr.name}
              maxLength={40}
              onChange={(e) => edit(si, { name: e.target.value })}
            />
          </div>
          <label className="field wide">
            <span>{t('Values, in category order')}</span>
            <NumberListField value={sr.values} onCommit={(vals) => edit(si, { values: vals })} />
          </label>
          <label className="field wide">
            <span>{t('Error bars, leave blank for none')}</span>
            <NumberListField
              rows={1}
              value={sr.errors ?? []}
              onCommit={(errs) => {
                const short = errs.slice(0, sr.values.length)
                while (short.length < sr.values.length) short.push(0)
                edit(si, { errors: short.some((v) => v > 0) ? short : undefined })
              }}
            />
          </label>
        </div>
      ))}
    </Section>
  )
}

function MembraneSection({
  item,
  meta,
  onSet,
}: {
  item: MembraneItem
  meta: IconMeta | undefined
  onSet: (p: Record<string, unknown>, f: string) => void
}) {
  const options = LIPIDS.some((m) => m.id === item.iconId) || !meta ? LIPIDS : [meta, ...LIPIDS]
  const count = membraneLayout(item).lipids.length
  const pct = (label: string, value: number, min: number, max: number, key: string, field: string, scale = 100) => (
    <label className="field wide">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.round(value * scale)}
        onChange={(e) => onSet({ [field]: Number(e.target.value) / scale }, key)}
      />
    </label>
  )
  return (
    <Section title={t('Membrane')}>
      <label className="field wide">
        <span>{t('Lipid')}</span>
        <select value={item.iconId} onChange={(e) => onSet({ iconId: e.target.value, colors: undefined }, 'lipid')}>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {iconLabel(m)} ({m.license})
            </option>
          ))}
        </select>
      </label>
      <label className="field wide">
        <span>{t('Layers')}</span>
        <select value={item.layers} onChange={(e) => onSet({ layers: Number(e.target.value) }, 'layers')}>
          <option value={2}>{t('Bilayer')}</option>
          <option value={1}>{t('Single layer')}</option>
        </select>
      </label>
      <div className="grid2">
        <Num label={t('Lipid width')} value={item.size} min={4} onChange={(n) => onSet({ size: Math.max(4, n) }, 'msize')} />
        {item.layers === 2 && <Num label={t('Gap between layers')} value={item.gap} min={0} onChange={(n) => onSet({ gap: Math.max(0, n) }, 'mgap')} />}
      </div>
      {pct(t('Spacing'), item.spacing, 50, 200, 'mspacing', 'spacing')}
      {pct(t('Irregularity'), item.jitter, 0, 100, 'mjitter', 'jitter')}
      {!(item.pts && item.pts.length > 2) && pct(t('Bend'), item.bend, -150, 150, 'mbend', 'bend')}
      {pct(t('Opacity'), item.opacity, 5, 100, 'mop', 'opacity')}
      <div className="btn-row">
        {item.layers === 1 && (
          <IconBtn icon="flip" label={t('Heads on the other side')} pressed={item.flip} onClick={() => onSet({ flip: !item.flip }, 'mflip')} />
        )}
        <button type="button" className="mini" onClick={() => onSet({ seed: Math.floor(Math.random() * 1_000_000_000) }, 'mseed')}>
          {t('Shuffle')}
        </button>
        <span className="note small">{t('{n} lipids', { n: count })}</span>
      </div>
      {item.pts && item.pts.length > 2 && (
        <div className="btn-row">
          <button type="button" className="mini" onClick={() => onSet({ pts: undefined, bend: 0 }, 'mstraight')}>
            {t('Straighten')}
          </button>
          <span className="note small">{t('Freehand brush stroke')}</span>
        </div>
      )}
      {meta && (
        <p className="note small">
          {t('By')}{' '}
          {meta.authorUrl ? (
            <a href={meta.authorUrl} target="_blank" rel="noreferrer">
              {meta.author}
            </a>
          ) : (
            meta.author
          )}
          ,{' '}
          <a href={meta.licenseUrl} target="_blank" rel="noreferrer">
            {meta.license}
          </a>
          {t('. Added to your credits automatically.')}
          {item.colors ? t(' Recoloured icons are credited as adapted.') : ''}
        </p>
      )}
      <p className="note small">{t('Drag across the board to paint a membrane; the lipids follow your stroke.')}</p>
      <p className="note small">{t('Drag the round handles to move the ends, and the diamond to bend it.')}</p>
    </Section>
  )
}

/** Where one end of an arrow is attached, and which side of the item it uses. */
function EndConnection({
  label,
  anchor,
  doc,
  onChange,
}: {
  label: string
  anchor?: Anchor
  doc: Doc
  onChange: (a: Anchor | undefined) => void
}) {
  const target = anchor ? doc.items.find((i) => i.id === anchor.id) : undefined
  if (!anchor || !target) {
    return (
      <p className="note small conn-free">
        <strong>{label}:</strong> {t('free')}
      </p>
    )
  }
  return (
    <div className="conn-row">
      <label className="field">
        <span>{t('{end}: attached to {name}', { end: label, name: nameOf(target, doc) })}</span>
        <select
          value={anchor.side ?? 'auto'}
          onChange={(e) => onChange(e.target.value === 'auto' ? { id: anchor.id } : { id: anchor.id, side: e.target.value as NonNullable<Anchor['side']> })}
        >
          <option value="auto">{t('Automatic side')}</option>
          <option value="n">{t('Top')}</option>
          <option value="e">{t('Right')}</option>
          <option value="s">{t('Bottom')}</option>
          <option value="w">{t('Left')}</option>
        </select>
      </label>
      <button type="button" className="mini" onClick={() => onChange(undefined)}>
        {t('Detach')}
      </button>
    </div>
  )
}

function StructureEditor({
  item,
  onApply,
}: {
  item: ImageItem
  onApply: (smiles: string, color: boolean) => Promise<boolean>
}) {
  const [text, setText] = useState(item.smiles ?? '')
  const [busy, setBusy] = useState(false)
  const color = item.smilesColor ?? true
  const apply = async (c = color) => {
    setBusy(true)
    try {
      await onApply(text, c)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <label className="field wide">
        <span>{t('SMILES')}</span>
        <textarea
          rows={2}
          spellCheck={false}
          className="mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void apply()
          }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={color} onChange={(e) => void apply(e.target.checked)} />
        <span>{t('Colour the heteroatoms')}</span>
      </label>
      <div className="btn-row">
        <button type="button" className="mini" disabled={busy || text.trim() === (item.smiles ?? '')} onClick={() => void apply()}>
          {busy ? t('Drawing…') : t('Redraw structure')}
        </button>
      </div>
    </>
  )
}

export function Inspector(props: Props) {
  const { doc, selected, patch, patchDoc, onReplaceIcon } = props
  const textRef = useRef<HTMLTextAreaElement>(null)
  useLang()
  useIconCacheVersion() // the colour list appears once the selected icon has loaded

  useEffect(() => {
    if (props.focusTextTick === 0) return
    // Wait a beat: the click that created the text would otherwise move focus away right after.
    const timer = window.setTimeout(() => {
      textRef.current?.focus()
      textRef.current?.select()
    }, 40)
    return () => window.clearTimeout(timer)
  }, [props.focusTextTick])

  const one = selected.length === 1 ? selected[0] : null
  const ids = selected.map((s) => s.id)
  const key = (f: string) => `${ids.join(',')}:${f}`
  const set = (p: Record<string, unknown>, f: string) => patch(ids, p, key(f))

  /** Wraps the selected text in _{ } (subscript) or ^{ } (superscript), or opens an empty pair at the caret. */
  const wrapScript = (mark: '_' | '^') => {
    const ta = textRef.current
    if (!ta || !one || one.type !== 'text') return
    const a = ta.selectionStart
    const b = ta.selectionEnd
    const chosen = one.text.slice(a, b)
    set({ text: `${one.text.slice(0, a)}${mark}{${chosen}}${one.text.slice(b)}` }, 'text')
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(a + 2, a + 2 + chosen.length)
    })
  }

  const arrange = (
    <>
    <Section title={t('Arrange')}>
      <div className="btn-row">
        <IconBtn icon="front" label={t('Bring to front')} onClick={() => props.onOrder('front')} />
        <IconBtn icon="forward" label={t('Bring forward')} onClick={() => props.onOrder('forward')} />
        <IconBtn icon="backward" label={t('Send backward')} onClick={() => props.onOrder('backward')} />
        <IconBtn icon="back" label={t('Send to back')} onClick={() => props.onOrder('back')} />
      </div>
      <div className="btn-row">
        <IconBtn icon="boardL" label={t('Align to the left edge of the board')} onClick={() => props.onArrange({ kind: 'board', to: 'left' })} />
        <IconBtn icon="boardC" label={t('Centre on the board')} onClick={() => props.onArrange({ kind: 'board', to: 'center' })} />
        <IconBtn icon="boardR" label={t('Align to the right edge of the board')} onClick={() => props.onArrange({ kind: 'board', to: 'right' })} />
        <IconBtn icon="boardT" label={t('Align to the top edge of the board')} onClick={() => props.onArrange({ kind: 'board', to: 'top' })} />
        <IconBtn icon="boardM" label={t('Centre vertically on the board')} onClick={() => props.onArrange({ kind: 'board', to: 'middle' })} />
        <IconBtn icon="boardB" label={t('Align to the bottom edge of the board')} onClick={() => props.onArrange({ kind: 'board', to: 'bottom' })} />
      </div>
      <div className="btn-row">
        <IconBtn icon="zoomSel" label={t('Zoom to the selection')} onClick={props.onZoomSelection} />
        <IconBtn icon="fit" label={t('Fit the whole board')} onClick={() => props.onFit()} />
      </div>
      <div className="btn-row">
        <IconBtn icon="group" label={t('Group (Ctrl+G)')} disabled={selected.length < 2} onClick={props.onGroup} />
        <IconBtn icon="ungroup" label={t('Ungroup (Ctrl+Shift+G)')} disabled={!selected.some((i) => i.group)} onClick={props.onUngroup} />
        <IconBtn icon="copy" label={t('Duplicate')} onClick={props.onDuplicate} />
        <IconBtn icon="trash" label={t('Delete')} onClick={props.onDelete} />
      </div>
    </Section>
    <RepeatSection onRepeat={props.onRepeat} />
    </>
  )

  let body: ReactNode
  if (selected.length === 0) {
    const preset = ARTBOARDS.find((a) => a.w === doc.width && a.h === doc.height)?.id ?? 'custom'
    body = (
      <Section title={t('Board')}>
        <label className="field wide">
          <span>{t('Size')}</span>
          <select
            value={preset}
            onChange={(e) => {
              const a = ARTBOARDS.find((x) => x.id === e.target.value)
              if (a) patchDoc({ width: a.w, height: a.h })
            }}
          >
            {preset === 'custom' && <option value="custom">{t('Custom')}</option>}
            {ARTBOARDS.map((a) => (
              <option key={a.id} value={a.id}>
                {t(a.label)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <Num label={t('Width')} value={doc.width} min={100} max={8000} onChange={(n) => patchDoc({ width: n }, 'bw')} />
          <Num label={t('Height')} value={doc.height} min={100} max={8000} onChange={(n) => patchDoc({ height: n }, 'bh')} />
        </div>
        <Color label={t('Background')} value={doc.background} onChange={(c) => patchDoc({ background: safeColor(c, doc.background) }, 'bg')} />
        <label className="check">
          <input type="checkbox" checked={doc.transparent} onChange={(e) => patchDoc({ transparent: e.target.checked })} />
          <span>{t('Transparent background when exporting')}</span>
        </label>
      </Section>
    )
  } else if (!one) {
    body = (
      <>
        <Section title={t('{n} items selected', { n: selected.length })}>
          <div className="btn-row">
            <IconBtn icon="alignL" label={t('Align left edges')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'left' })} />
            <IconBtn icon="alignC" label={t('Align horizontal centres')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'center' })} />
            <IconBtn icon="alignR" label={t('Align right edges')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'right' })} />
            <IconBtn icon="alignT" label={t('Align top edges')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'top' })} />
            <IconBtn icon="alignM" label={t('Align vertical centres')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'middle' })} />
            <IconBtn icon="alignB" label={t('Align bottom edges')} disabled={selected.length < 2} onClick={() => props.onArrange({ kind: 'align', to: 'bottom' })} />
          </div>
          <div className="btn-row">
            <IconBtn icon="distH" label={t('Distribute horizontally')} disabled={selected.length < 3} onClick={() => props.onArrange({ kind: 'distribute', axis: 'h' })} />
            <IconBtn icon="distV" label={t('Distribute vertically')} disabled={selected.length < 3} onClick={() => props.onArrange({ kind: 'distribute', axis: 'v' })} />
            <span className="note small">{t('Equal spacing')}</span>
          </div>
          <div className="btn-row">
            <IconBtn icon="minus" label={t('Make selection 10% smaller')} onClick={() => props.onScale(0.9)} />
            <IconBtn icon="plus" label={t('Make selection 10% larger')} onClick={() => props.onScale(1.1)} />
            <span className="note small">{t('Scale together')}</span>
          </div>
        </Section>
        <PaletteSection selected={selected} onPalette={props.onPalette} />
        {arrange}
      </>
    )
  } else {
    const iconId = one.type === 'icon' || one.type === 'membrane' ? one.iconId : undefined
    const meta = iconId ? ICON_BY_ID.get(iconId) : undefined
    const loaded = iconId ? getIcon(iconId) : undefined
    const palette = loaded?.status === 'ready' ? loaded.palette : []
    body = (
      <>
        <Section title={nameOf(one, doc)}>
          {one.type === 'arrow' || one.type === 'membrane' ? (
            <div className="grid2">
              <Num label={t('Start X')} value={one.x1} onChange={(n) => set({ x1: n }, 'x1')} />
              <Num label={t('Start Y')} value={one.y1} onChange={(n) => set({ y1: n }, 'y1')} />
              <Num label={t('End X')} value={one.x2} onChange={(n) => set({ x2: n }, 'x2')} />
              <Num label={t('End Y')} value={one.y2} onChange={(n) => set({ y2: n }, 'y2')} />
            </div>
          ) : (
            <div className="grid2">
              <Num label={t('X')} value={one.x} onChange={(n) => set({ x: n }, 'x')} />
              <Num label={t('Y')} value={one.y} onChange={(n) => set({ y: n }, 'y')} />
              {one.type === 'marker' ? (
                <Num label={t('Diameter')} value={one.size} min={8} onChange={(n) => set({ size: Math.max(8, n) }, 'sz')} />
              ) : (
                one.type !== 'text' && (
                  <>
                    <Num label={t('Width')} value={one.w} min={1} onChange={(n) => set({ w: Math.max(1, n) }, 'w')} />
                    <Num label={t('Height')} value={one.h} min={1} onChange={(n) => set({ h: Math.max(1, n) }, 'h')} />
                  </>
                )
              )}
              {one.type !== 'marker' && (
                <Num label={t('Rotation')} value={one.rotation} step={5} onChange={(n) => set({ rotation: n }, 'r')} />
              )}
            </div>
          )}
        </Section>

        {one.type === 'icon' && meta && (
          <Section title={t('Icon')}>
            <button type="button" className="btn wide" onClick={onReplaceIcon}>
              <Glyph name="swap" size={16} />
              {t('Replace icon…')}
            </button>
            <div className="btn-row">
              <IconBtn icon="flip" label={t('Flip horizontally')} pressed={one.flipX} onClick={() => set({ flipX: !one.flipX }, 'flip')} />
            </div>
            <label className="field wide">
              <span>{t('Opacity')}</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(one.opacity * 100)}
                onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, 'op')}
              />
            </label>
            <p className="note small">
              {t('By')}{' '}
              {meta.authorUrl ? (
                <a href={meta.authorUrl} target="_blank" rel="noreferrer">
                  {meta.author}
                </a>
              ) : (
                meta.author
              )}
              ,{' '}
              <a href={meta.licenseUrl} target="_blank" rel="noreferrer">
                {meta.license}
              </a>
              {meta.source && (
                <>
                  ,{' '}
                  <a href={meta.source} target="_blank" rel="noreferrer">
                    {hostOf(meta.source)}
                  </a>
                </>
              )}
              {t('. Added to your credits automatically.')}
              {one.colors ? t(' Recoloured icons are credited as adapted.') : ''}
            </p>
          </Section>
        )}

        {one.type === 'membrane' && (
          <MembraneSection item={one} meta={meta} onSet={set} />
        )}

        {(one.type === 'icon' || one.type === 'membrane') && palette.length > 0 && (
          <Section title={t('Colours')}>
            <div className="swatches">
              {palette.slice(0, 12).map((orig) => (
                <input
                  key={orig}
                  type="color"
                  aria-label={t('Recolour {hex}', { hex: orig })}
                  title={orig}
                  value={one.colors?.[orig] ?? orig}
                  onChange={(e) => {
                    const next = { ...(one.colors ?? {}), [orig]: e.target.value }
                    if (e.target.value.toLowerCase() === orig) delete next[orig]
                    set({ colors: Object.keys(next).length ? next : undefined }, `col:${orig}`)
                  }}
                />
              ))}
            </div>
            {palette.length > 12 && <MoreColours palette={palette} colors={one.colors} set={set} />}
            <button type="button" className="mini" disabled={!one.colors} onClick={() => set({ colors: undefined }, 'colreset')}>
              {t('Reset colours')}
            </button>
          </Section>
        )}

        {one.type === 'image' && (
          <Section title={one.smiles ? t('Structure') : t('Image')}>
            <div className="btn-row">
              <IconBtn icon="flip" label={t('Flip horizontally')} pressed={one.flipX} onClick={() => set({ flipX: !one.flipX }, 'flip')} />
            </div>
            <label className="field wide">
              <span>{t('Opacity')}</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(one.opacity * 100)}
                onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, 'op')}
              />
            </label>
            {one.smiles !== undefined ? (
              <StructureEditor key={one.id} item={one} onApply={(smiles, color) => props.onRedrawStructure(one.id, smiles, color)} />
            ) : (
              <>
                <p className="note small">{t('Your own image. Fill in who made it and under what license, and it is added to the credit line. Its license is yours to check.')}</p>
                <label className="field wide">
                  <span>{t('Name')}</span>
                  <input type="text" value={one.name ?? ''} maxLength={120} onChange={(e) => set({ name: e.target.value || undefined }, 'iname')} />
                </label>
                <label className="field wide">
                  <span>{t('Author or source')}</span>
                  <input type="text" value={one.author ?? ''} maxLength={200} onChange={(e) => set({ author: e.target.value || undefined }, 'iauthor')} />
                </label>
                <label className="field wide">
                  <span>{t('License')}</span>
                  <input
                    type="text"
                    list="image-licenses"
                    placeholder={t('e.g. CC BY 4.0')}
                    value={one.license ?? ''}
                    maxLength={120}
                    onChange={(e) => set({ license: e.target.value || undefined }, 'ilicense')}
                  />
                  <datalist id="image-licenses">
                    {['CC0 1.0', 'CC BY 4.0', 'CC BY 3.0', 'Public Domain', 'Own work'].map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </label>
                <label className="field wide">
                  <span>{t('Link')}</span>
                  <input type="text" inputMode="url" placeholder="https://" value={one.source ?? ''} maxLength={500} onChange={(e) => set({ source: e.target.value || undefined }, 'isource')} />
                </label>
              </>
            )}
          </Section>
        )}

        {one.type === 'shape' && (
          <Section title={t('Style')}>
            {(one.shape === 'rect' || one.shape === 'ellipse' || one.shape === 'callout' || one.shape === 'poly') && (
              <Color label={t('Fill')} value={one.fill} allowNone onChange={(c) => set({ fill: c }, 'fill')} />
            )}
            <Color label={t('Outline')} value={one.stroke} onChange={(c) => set({ stroke: c }, 'stroke')} />
            <div className="grid2">
              <Num label={t('Outline width')} value={one.strokeWidth} min={0} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0, n) }, 'sw')} />
              {(one.shape === 'rect' || one.shape === 'callout') && (
                <Num label={t('Corner radius')} value={one.radius} min={0} onChange={(n) => set({ radius: Math.max(0, n) }, 'rad')} />
              )}
            </div>
            {(one.shape === 'bracket' || one.shape === 'brace' || one.shape === 'callout') && (
              <div className="btn-row">
                <IconBtn
                  icon="flip"
                  label={one.flipX ? t('Face the other way') : t('Flip horizontally')}
                  pressed={one.flipX}
                  onClick={() => set({ flipX: !one.flipX }, 'ffx')}
                />
                <span className="note small">{t('Direction')}</span>
              </div>
            )}
            {one.shape === 'path' && (
              <label className="check">
                <input type="checkbox" checked={!!one.smooth} onChange={(e) => set({ smooth: e.target.checked }, 'sm')} />
                <span>{t('Smooth curve')}</span>
              </label>
            )}
            {(one.shape === 'poly' || one.shape === 'path') && one.points && (
              <p className="note small">
                {t('{n} corners. Drag the handles to move the shape; the corners keep their proportions.', {
                  n: one.points.length,
                })}
              </p>
            )}
            <label className="field wide">
              <span>{t('Opacity')}</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(one.opacity * 100)}
                onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, 'op')}
              />
            </label>
          </Section>
        )}

        {one.type === 'chart' && <ChartSection item={one} onSet={set} />}

        {one.type === 'marker' && (
          <Section title={t('Marker')}>
            <label className="field wide">
              <span>{t('Number')}</span>
              <input value={markerNumber(doc, one.id)} readOnly aria-label={t('Number')} />
            </label>
            <p className="note small">
              {t('Markers are numbered in reading order, top to bottom and then left to right, so moving one renumbers the rest to match.')}
            </p>
            <label className="field wide">
              <span>{t('What this points at')}</span>
              <input
                value={one.label}
                placeholder={t('Apoptosis')}
                aria-label={t('What this points at')}
                onChange={(e) => set({ label: e.target.value }, 'mlabel')}
              />
            </label>
            <Color label={t('Fill')} value={one.fill} onChange={(c) => set({ fill: c }, 'mfill')} />
            <Color label={t('Text')} value={one.textFill} onChange={(c) => set({ textFill: c }, 'mtext')} />
            <Color label={t('Outline')} value={one.stroke} onChange={(c) => set({ stroke: c }, 'mstroke')} />
            <div className="grid2">
              <Num label={t('Outline width')} value={one.strokeWidth} min={0} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0, n) }, 'msw')} />
              <Num label={t('Text size')} value={one.fontSize} min={4} onChange={(n) => set({ fontSize: Math.max(4, n) }, 'mfs')} />
            </div>
          </Section>
        )}

        {one.type === 'text' && (
          <Section title={t('Text')}>
            <label className="field wide">
              <span className="sr-only">{t('Text')}</span>
              <textarea
                ref={textRef}
                rows={3}
                value={one.text}
                onChange={(e) => set({ text: e.target.value }, 'text')}
              />
            </label>
            <p className="note small script-hint">{t('Subscript and superscript: type H_{2}O or Ca^{2+}, or select text and use the x₂ and x² buttons.')}</p>
            <label className="field wide">
              <span>{t('Font')}</span>
              <select value={one.font ?? 'sans'} onChange={(e) => set({ font: e.target.value as FontId }, 'font')}>
                {(Object.keys(FONTS) as FontId[]).map((f) => (
                  <option key={f} value={f}>
                    {t(FONTS[f].label)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid2">
              <Num label={t('Size')} value={one.fontSize} min={4} onChange={(n) => set({ fontSize: Math.max(4, n) }, 'fs')} />
              <Color label={t('Colour')} value={one.fill} onChange={(c) => set({ fill: c }, 'fill')} />
            </div>
            <div className="btn-row">
              <IconBtn icon="bold" label={t('Bold')} pressed={one.bold} onClick={() => set({ bold: !one.bold }, 'b')} />
              <IconBtn icon="italic" label={t('Italic')} pressed={one.italic} onClick={() => set({ italic: !one.italic }, 'i')} />
              <button type="button" className="icon-btn script-btn" title={t('Subscript')} aria-label={t('Subscript')} onClick={() => wrapScript('_')}>
                x<sub>2</sub>
              </button>
              <button type="button" className="icon-btn script-btn" title={t('Superscript')} aria-label={t('Superscript')} onClick={() => wrapScript('^')}>
                x<sup>2</sup>
              </button>
              <span className="spacer" />
              <IconBtn icon="textLeft" label={t('Align text left')} pressed={one.align === 'left'} onClick={() => set({ align: 'left' }, 'al')} />
              <IconBtn icon="textCenter" label={t('Centre text')} pressed={one.align === 'center'} onClick={() => set({ align: 'center' }, 'al')} />
              <IconBtn icon="textRight" label={t('Align text right')} pressed={one.align === 'right'} onClick={() => set({ align: 'right' }, 'al')} />
            </div>
          </Section>
        )}

        {one.type === 'arrow' && (
          <Section title={t('Style')}>
            <div className="btn-row kinds" role="group" aria-label={t('Arrow shape')}>
              <IconBtn icon="kindStraight" label={t('Straight arrow')} pressed={one.kind === 'straight'} onClick={() => set({ kind: 'straight' }, 'kind')} />
              <IconBtn
                icon="kindElbow"
                label={t('Elbow arrow')}
                pressed={one.kind === 'elbow'}
                onClick={() => set({ kind: 'elbow', bend: defaultBend('elbow') }, 'kind')}
              />
              <IconBtn
                icon="kindCurve"
                label={t('Curved arrow')}
                pressed={one.kind === 'curve'}
                onClick={() => set({ kind: 'curve', bend: defaultBend('curve') }, 'kind')}
              />
            </div>
            {one.kind === 'curve' && (
              <label className="field wide">
                <span>{t('Bend')}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={Math.round(one.bend * 100)}
                  onChange={(e) => set({ bend: Number(e.target.value) / 100 }, 'bend')}
                />
              </label>
            )}
            {one.kind === 'elbow' && (
              <>
                <label className="field wide">
                  <span>{t('Bend position')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(one.bend * 100)}
                    onChange={(e) => set({ bend: Number(e.target.value) / 100 }, 'bend')}
                  />
                </label>
                <label className="field wide">
                  <span>{t('Leaves the start')}</span>
                  <select value={one.axis} disabled={!!(one.from || one.to)} onChange={(e) => set({ axis: e.target.value }, 'axis')}>
                    <option value="h">{t('Sideways first')}</option>
                    <option value="v">{t('Up or down first')}</option>
                  </select>
                </label>
              </>
            )}
            <Color label={t('Colour')} value={one.stroke} onChange={(c) => set({ stroke: c }, 'stroke')} />
            <div className="grid2">
              <Num label={t('Width')} value={one.strokeWidth} min={0.5} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0.5, n) }, 'sw')} />
              <label className="field">
                <span>{t('Arrowheads')}</span>
                <select value={one.head} onChange={(e) => set({ head: e.target.value }, 'head')}>
                  <option value="end">{t('At the end')}</option>
                  <option value="both">{t('At both ends')}</option>
                  <option value="none">{t('None (plain line)')}</option>
                  <option value="inhibit">{t('Inhibition (⊣)')}</option>
                </select>
              </label>
            </div>
            <div className="btn-row">
              <IconBtn icon="dashed" label={t('Dashed line')} pressed={one.dashed} onClick={() => set({ dashed: !one.dashed }, 'dash')} />
            </div>
          </Section>
        )}

        {one.type === 'arrow' && (
          <Section title={t('Connections')}>
            <EndConnection label={t('Start')} anchor={one.from} doc={doc} onChange={(a) => set({ from: a }, 'from')} />
            <EndConnection label={t('End')} anchor={one.to} doc={doc} onChange={(a) => set({ to: a }, 'to')} />
            {!one.from && !one.to && (
              <p className="note small">{t('Drag a round handle of the arrow onto an icon, shape or label to attach it, and the arrow follows when you move that item. Hold Alt to keep an end free.')}</p>
            )}
          </Section>
        )}

        {arrange}
      </>
    )
  }

  return (
    <aside className="inspector" aria-label={t('Properties')}>
      {body}
      <Layers doc={doc} selected={selected} onSelect={props.onSelect} onToggle={props.onToggle} />
    </aside>
  )
}
