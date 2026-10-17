import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ARTBOARDS } from './defaults'
import { Glyph } from './Glyph'
import type { GlyphName } from './Glyph'
import { ICON_BY_ID, iconUrl } from './icons'
import type { Doc, Item } from './types'
import { round2 } from './util'

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type Order = 'front' | 'forward' | 'backward' | 'back'

type Props = {
  doc: Doc
  selected: Item[]
  focusTextTick: number
  patch: (ids: string[], p: Record<string, unknown>, key?: string) => void
  patchDoc: (p: Partial<Doc>, key?: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onOrder: (o: Order) => void
  onAlign: (a: Align) => void
  onSelect: (ids: string[], additive: boolean) => void
  onToggle: (id: string, flag: 'hidden' | 'locked') => void
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
          onChange={(e) => onChange(e.target.value)}
        />
        {allowNone && (
          <button type="button" className="mini" aria-pressed={none} onClick={() => onChange(none ? '#DCE7EE' : 'none')}>
            None
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

const nameOf = (it: Item) => {
  switch (it.type) {
    case 'icon':
      return ICON_BY_ID.get(it.iconId)?.label ?? 'Icon'
    case 'text':
      return it.text.split('\n')[0].slice(0, 28) || 'Text'
    case 'arrow':
      return 'Arrow'
    case 'shape':
      return it.shape === 'rect' ? 'Rectangle' : 'Ellipse'
  }
}

function Layers({ doc, selected, onSelect, onToggle }: Pick<Props, 'doc' | 'selected' | 'onSelect' | 'onToggle'>) {
  const ids = new Set(selected.map((s) => s.id))
  const rows = [...doc.items].reverse()
  return (
    <Section title="Layers">
      {rows.length === 0 ? (
        <p className="note">Nothing here yet.</p>
      ) : (
        <ul className="layers">
          {rows.map((it) => {
            const meta = it.type === 'icon' ? ICON_BY_ID.get(it.iconId) : undefined
            const glyph: GlyphName = it.type === 'text' ? 'text' : it.type === 'arrow' ? 'arrow' : it.type === 'shape' ? (it.shape === 'rect' ? 'rect' : 'ellipse') : 'file'
            return (
              <li key={it.id} data-hidden={it.hidden || undefined}>
                <button
                  type="button"
                  className="layer"
                  aria-pressed={ids.has(it.id)}
                  onClick={(e) => onSelect([it.id], e.shiftKey)}
                >
                  {meta ? <img src={iconUrl(meta)} alt="" draggable={false} /> : <Glyph name={glyph} size={16} />}
                  <span>{nameOf(it)}</span>
                </button>
                <IconBtn
                  icon={it.hidden ? 'eyeOff' : 'eye'}
                  label={it.hidden ? `Show ${nameOf(it)}` : `Hide ${nameOf(it)}`}
                  onClick={() => onToggle(it.id, 'hidden')}
                />
                <IconBtn
                  icon={it.locked ? 'lock' : 'unlock'}
                  label={it.locked ? `Unlock ${nameOf(it)}` : `Lock ${nameOf(it)}`}
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

export function Inspector(props: Props) {
  const { doc, selected, patch, patchDoc } = props
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (props.focusTextTick === 0) return
    // Wait a beat: the click that created the text would otherwise move focus away right after.
    const t = window.setTimeout(() => {
      textRef.current?.focus()
      textRef.current?.select()
    }, 40)
    return () => window.clearTimeout(t)
  }, [props.focusTextTick])

  const one = selected.length === 1 ? selected[0] : null
  const ids = selected.map((s) => s.id)
  const key = (f: string) => `${ids.join(',')}:${f}`
  const set = (p: Record<string, unknown>, f: string) => patch(ids, p, key(f))

  const arrange = (
    <Section title="Arrange">
      <div className="btn-row">
        <IconBtn icon="front" label="Bring to front" onClick={() => props.onOrder('front')} />
        <IconBtn icon="forward" label="Bring forward" onClick={() => props.onOrder('forward')} />
        <IconBtn icon="backward" label="Send backward" onClick={() => props.onOrder('backward')} />
        <IconBtn icon="back" label="Send to back" onClick={() => props.onOrder('back')} />
        <span className="spacer" />
        <IconBtn icon="copy" label="Duplicate" onClick={props.onDuplicate} />
        <IconBtn icon="trash" label="Delete" onClick={props.onDelete} />
      </div>
    </Section>
  )

  let body: ReactNode
  if (selected.length === 0) {
    const preset = ARTBOARDS.find((a) => a.w === doc.width && a.h === doc.height)?.id ?? 'custom'
    body = (
      <Section title="Board">
        <label className="field wide">
          <span>Size</span>
          <select
            value={preset}
            onChange={(e) => {
              const a = ARTBOARDS.find((x) => x.id === e.target.value)
              if (a) patchDoc({ width: a.w, height: a.h })
            }}
          >
            {preset === 'custom' && <option value="custom">Custom</option>}
            {ARTBOARDS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <Num label="Width" value={doc.width} min={100} max={8000} onChange={(n) => patchDoc({ width: n }, 'bw')} />
          <Num label="Height" value={doc.height} min={100} max={8000} onChange={(n) => patchDoc({ height: n }, 'bh')} />
        </div>
        <Color label="Background" value={doc.background} onChange={(c) => patchDoc({ background: c }, 'bg')} />
        <label className="check">
          <input type="checkbox" checked={doc.transparent} onChange={(e) => patchDoc({ transparent: e.target.checked })} />
          <span>Transparent background when exporting</span>
        </label>
      </Section>
    )
  } else if (!one) {
    body = (
      <>
        <Section title={`${selected.length} items selected`}>
          <div className="btn-row">
            <IconBtn icon="alignL" label="Align left edges" onClick={() => props.onAlign('left')} />
            <IconBtn icon="alignC" label="Align horizontal centres" onClick={() => props.onAlign('center')} />
            <IconBtn icon="alignR" label="Align right edges" onClick={() => props.onAlign('right')} />
            <IconBtn icon="alignT" label="Align top edges" onClick={() => props.onAlign('top')} />
            <IconBtn icon="alignM" label="Align vertical centres" onClick={() => props.onAlign('middle')} />
            <IconBtn icon="alignB" label="Align bottom edges" onClick={() => props.onAlign('bottom')} />
          </div>
        </Section>
        {arrange}
      </>
    )
  } else {
    const meta = one.type === 'icon' ? ICON_BY_ID.get(one.iconId) : undefined
    body = (
      <>
        <Section title={nameOf(one)}>
          {one.type === 'arrow' ? (
            <div className="grid2">
              <Num label="Start X" value={one.x1} onChange={(n) => set({ x1: n }, 'x1')} />
              <Num label="Start Y" value={one.y1} onChange={(n) => set({ y1: n }, 'y1')} />
              <Num label="End X" value={one.x2} onChange={(n) => set({ x2: n }, 'x2')} />
              <Num label="End Y" value={one.y2} onChange={(n) => set({ y2: n }, 'y2')} />
            </div>
          ) : (
            <div className="grid2">
              <Num label="X" value={one.x} onChange={(n) => set({ x: n }, 'x')} />
              <Num label="Y" value={one.y} onChange={(n) => set({ y: n }, 'y')} />
              {one.type !== 'text' && (
                <>
                  <Num label="Width" value={one.w} min={1} onChange={(n) => set({ w: Math.max(1, n) }, 'w')} />
                  <Num label="Height" value={one.h} min={1} onChange={(n) => set({ h: Math.max(1, n) }, 'h')} />
                </>
              )}
              <Num label="Rotation" value={one.rotation} step={5} onChange={(n) => set({ rotation: n }, 'r')} />
            </div>
          )}
        </Section>

        {one.type === 'icon' && meta && (
          <Section title="Icon">
            <div className="btn-row">
              <IconBtn icon="flip" label="Flip horizontally" pressed={one.flipX} onClick={() => set({ flipX: !one.flipX }, 'flip')} />
            </div>
            <label className="field wide">
              <span>Opacity</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(one.opacity * 100)}
                onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, 'op')}
              />
            </label>
            <p className="note small">
              By{' '}
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
              . Added to your credits automatically.
            </p>
          </Section>
        )}

        {one.type === 'shape' && (
          <Section title="Style">
            <Color label="Fill" value={one.fill} allowNone onChange={(c) => set({ fill: c }, 'fill')} />
            <Color label="Outline" value={one.stroke} onChange={(c) => set({ stroke: c }, 'stroke')} />
            <div className="grid2">
              <Num label="Outline width" value={one.strokeWidth} min={0} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0, n) }, 'sw')} />
              {one.shape === 'rect' && (
                <Num label="Corner radius" value={one.radius} min={0} onChange={(n) => set({ radius: Math.max(0, n) }, 'rad')} />
              )}
            </div>
            <label className="field wide">
              <span>Opacity</span>
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

        {one.type === 'text' && (
          <Section title="Text">
            <label className="field wide">
              <span className="sr-only">Text</span>
              <textarea
                ref={textRef}
                rows={3}
                value={one.text}
                onChange={(e) => set({ text: e.target.value }, 'text')}
              />
            </label>
            <div className="grid2">
              <Num label="Size" value={one.fontSize} min={4} onChange={(n) => set({ fontSize: Math.max(4, n) }, 'fs')} />
              <Color label="Colour" value={one.fill} onChange={(c) => set({ fill: c }, 'fill')} />
            </div>
            <div className="btn-row">
              <IconBtn icon="bold" label="Bold" pressed={one.bold} onClick={() => set({ bold: !one.bold }, 'b')} />
              <IconBtn icon="italic" label="Italic" pressed={one.italic} onClick={() => set({ italic: !one.italic }, 'i')} />
              <span className="spacer" />
              <IconBtn icon="textLeft" label="Align text left" pressed={one.align === 'left'} onClick={() => set({ align: 'left' }, 'al')} />
              <IconBtn icon="textCenter" label="Centre text" pressed={one.align === 'center'} onClick={() => set({ align: 'center' }, 'al')} />
              <IconBtn icon="textRight" label="Align text right" pressed={one.align === 'right'} onClick={() => set({ align: 'right' }, 'al')} />
            </div>
          </Section>
        )}

        {one.type === 'arrow' && (
          <Section title="Style">
            <Color label="Colour" value={one.stroke} onChange={(c) => set({ stroke: c }, 'stroke')} />
            <div className="grid2">
              <Num label="Width" value={one.strokeWidth} min={0.5} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0.5, n) }, 'sw')} />
              <label className="field">
                <span>Arrowheads</span>
                <select value={one.head} onChange={(e) => set({ head: e.target.value }, 'head')}>
                  <option value="end">At the end</option>
                  <option value="both">At both ends</option>
                  <option value="none">None (plain line)</option>
                </select>
              </label>
            </div>
            <div className="btn-row">
              <IconBtn icon="dashed" label="Dashed line" pressed={one.dashed} onClick={() => set({ dashed: !one.dashed }, 'dash')} />
            </div>
          </Section>
        )}

        {arrange}
      </>
    )
  }

  return (
    <aside className="inspector" aria-label="Properties">
      {body}
      <Layers doc={doc} selected={selected} onSelect={props.onSelect} onToggle={props.onToggle} />
    </aside>
  )
}
