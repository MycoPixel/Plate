import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ARTBOARDS, defaultBend } from './defaults'
import { Glyph } from './Glyph'
import type { GlyphName } from './Glyph'
import { iconLabel, t, useLang } from './i18n'
import { getIcon, ICON_BY_ID, iconUrl, useIconCacheVersion } from './icons'
import type { Doc, ImageItem, Item } from './types'
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
  onGroup: () => void
  onUngroup: () => void
  onScale: (factor: number) => void
  onRedrawStructure: (id: string, smiles: string, color: boolean) => Promise<boolean>
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

const nameOf = (it: Item) => {
  switch (it.type) {
    case 'icon':
      { const m = ICON_BY_ID.get(it.iconId); return m ? iconLabel(m) : t('Icon') }
    case 'text':
      return it.text.split('\n')[0].slice(0, 28) || t('Text')
    case 'image':
      return it.smiles ? t('Structure') : (it.name ?? t('Image'))
    case 'arrow':
      return it.kind === 'elbow' ? t('Elbow arrow') : it.kind === 'curve' ? t('Curved arrow') : t('Arrow')
    case 'shape':
      return it.shape === 'rect' ? t('Rectangle') : t('Ellipse')
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
            const glyph: GlyphName = it.type === 'image' ? 'image' : it.type === 'text' ? 'text' : it.type === 'arrow' ? 'arrow' : it.type === 'shape' ? (it.shape === 'rect' ? 'rect' : 'ellipse') : 'file'
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
                  <span>{nameOf(it)}</span>
                  {it.group && <Glyph name="group" size={13} />}
                </button>
                <IconBtn
                  icon={it.hidden ? 'eyeOff' : 'eye'}
                  label={t(it.hidden ? 'Show {name}' : 'Hide {name}', { name: nameOf(it) })}
                  onClick={() => onToggle(it.id, 'hidden')}
                />
                <IconBtn
                  icon={it.locked ? 'lock' : 'unlock'}
                  label={t(it.locked ? 'Unlock {name}' : 'Lock {name}', { name: nameOf(it) })}
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
  const { doc, selected, patch, patchDoc } = props
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

  const arrange = (
    <Section title={t('Arrange')}>
      <div className="btn-row">
        <IconBtn icon="front" label={t('Bring to front')} onClick={() => props.onOrder('front')} />
        <IconBtn icon="forward" label={t('Bring forward')} onClick={() => props.onOrder('forward')} />
        <IconBtn icon="backward" label={t('Send backward')} onClick={() => props.onOrder('backward')} />
        <IconBtn icon="back" label={t('Send to back')} onClick={() => props.onOrder('back')} />
        <span className="spacer" />
        <IconBtn icon="group" label={t('Group (Ctrl+G)')} disabled={selected.length < 2} onClick={props.onGroup} />
        <IconBtn icon="ungroup" label={t('Ungroup (Ctrl+Shift+G)')} disabled={!selected.some((i) => i.group)} onClick={props.onUngroup} />
        <IconBtn icon="copy" label={t('Duplicate')} onClick={props.onDuplicate} />
        <IconBtn icon="trash" label={t('Delete')} onClick={props.onDelete} />
      </div>
    </Section>
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
        <Color label={t('Background')} value={doc.background} onChange={(c) => patchDoc({ background: c }, 'bg')} />
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
            <IconBtn icon="alignL" label={t('Align left edges')} onClick={() => props.onAlign('left')} />
            <IconBtn icon="alignC" label={t('Align horizontal centres')} onClick={() => props.onAlign('center')} />
            <IconBtn icon="alignR" label={t('Align right edges')} onClick={() => props.onAlign('right')} />
            <IconBtn icon="alignT" label={t('Align top edges')} onClick={() => props.onAlign('top')} />
            <IconBtn icon="alignM" label={t('Align vertical centres')} onClick={() => props.onAlign('middle')} />
            <IconBtn icon="alignB" label={t('Align bottom edges')} onClick={() => props.onAlign('bottom')} />
          </div>
          <div className="btn-row">
            <IconBtn icon="minus" label={t('Make selection 10% smaller')} onClick={() => props.onScale(0.9)} />
            <IconBtn icon="plus" label={t('Make selection 10% larger')} onClick={() => props.onScale(1.1)} />
            <span className="note small">{t('Scale together')}</span>
          </div>
        </Section>
        {arrange}
      </>
    )
  } else {
    const meta = one.type === 'icon' ? ICON_BY_ID.get(one.iconId) : undefined
    const loaded = one.type === 'icon' ? getIcon(one.iconId) : undefined
    const palette = loaded?.status === 'ready' ? loaded.palette : []
    body = (
      <>
        <Section title={nameOf(one)}>
          {one.type === 'arrow' ? (
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
              {one.type !== 'text' && (
                <>
                  <Num label={t('Width')} value={one.w} min={1} onChange={(n) => set({ w: Math.max(1, n) }, 'w')} />
                  <Num label={t('Height')} value={one.h} min={1} onChange={(n) => set({ h: Math.max(1, n) }, 'h')} />
                </>
              )}
              <Num label={t('Rotation')} value={one.rotation} step={5} onChange={(n) => set({ rotation: n }, 'r')} />
            </div>
          )}
        </Section>

        {one.type === 'icon' && meta && (
          <Section title={t('Icon')}>
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
              ,{' '}
              <a href={meta.source} target="_blank" rel="noreferrer">
                {new URL(meta.source).hostname}
              </a>
              {t('. Added to your credits automatically.')}
              {one.colors ? t(' Recoloured icons are credited as adapted.') : ''}
            </p>
          </Section>
        )}

        {one.type === 'icon' && palette.length > 0 && (
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
            {palette.length > 12 && (
              <p className="note small">{t('Showing the 12 most used of {n} colours.', { n: palette.length })}</p>
            )}
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
              <p className="note small">{t('Your own image. Its license is yours to check; it is not part of the icon credits.')}</p>
            )}
          </Section>
        )}

        {one.type === 'shape' && (
          <Section title={t('Style')}>
            <Color label={t('Fill')} value={one.fill} allowNone onChange={(c) => set({ fill: c }, 'fill')} />
            <Color label={t('Outline')} value={one.stroke} onChange={(c) => set({ stroke: c }, 'stroke')} />
            <div className="grid2">
              <Num label={t('Outline width')} value={one.strokeWidth} min={0} step={0.5} onChange={(n) => set({ strokeWidth: Math.max(0, n) }, 'sw')} />
              {one.shape === 'rect' && (
                <Num label={t('Corner radius')} value={one.radius} min={0} onChange={(n) => set({ radius: Math.max(0, n) }, 'rad')} />
              )}
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
            <div className="grid2">
              <Num label={t('Size')} value={one.fontSize} min={4} onChange={(n) => set({ fontSize: Math.max(4, n) }, 'fs')} />
              <Color label={t('Colour')} value={one.fill} onChange={(c) => set({ fill: c }, 'fill')} />
            </div>
            <div className="btn-row">
              <IconBtn icon="bold" label={t('Bold')} pressed={one.bold} onClick={() => set({ bold: !one.bold }, 'b')} />
              <IconBtn icon="italic" label={t('Italic')} pressed={one.italic} onClick={() => set({ italic: !one.italic }, 'i')} />
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
                <span>{t('Curve')}</span>
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
                  <select value={one.axis} onChange={(e) => set({ axis: e.target.value }, 'axis')}>
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
                </select>
              </label>
            </div>
            <div className="btn-row">
              <IconBtn icon="dashed" label={t('Dashed line')} pressed={one.dashed} onClick={() => set({ dashed: !one.dashed }, 'dash')} />
            </div>
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
