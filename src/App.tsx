import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from './Canvas'
import { usedIcons } from './credits'
import { CreditsDialog } from './CreditsDialog'
import { emptyDoc, exampleDoc, INK, newIcon, newImage, newShape, newText, uid } from './defaults'
import { buildSvg, download, fileSlug, renderPng } from './export'
import { aabbOf, measureText, scaleItem, translateItem, unionAabb } from './geometry'
import { Glyph } from './Glyph'
import type { GlyphName } from './Glyph'
import { useHistory } from './history'
import { ensureIcons, ICON_BY_ID } from './icons'
import { importImageFile } from './images'
import { Inspector } from './Inspector'
import type { Align, Order } from './Inspector'
import { Menu, MenuItem } from './Menu'
import { Palette } from './Palette'
import { renderSmiles } from './structure'
import type { StructureImage } from './structure'
import { StructureDialog } from './StructureDialog'
import { loadAutosave, parseProject, saveAutosave, serializeProject } from './project'
import type { Doc, Item, Pt, Tool } from './types'
import { clamp, isTextEntry } from './util'
import './App.css'

function reorder(items: Item[], ids: string[], mode: Order): Item[] {
  const chosen = new Set(ids)
  if (mode === 'front') return [...items.filter((i) => !chosen.has(i.id)), ...items.filter((i) => chosen.has(i.id))]
  if (mode === 'back') return [...items.filter((i) => chosen.has(i.id)), ...items.filter((i) => !chosen.has(i.id))]
  const out = items.slice()
  if (mode === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) {
      if (chosen.has(out[i].id) && !chosen.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (chosen.has(out[i].id) && !chosen.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]
    }
  }
  return out
}

const TOOLS: { id: Tool; icon: GlyphName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
  { id: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'E' },
]

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

function Logo() {
  return (
    <svg className="logo" width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
      <circle cx="9" cy="11" r="8" className="logo-a" />
      <circle cx="17" cy="11" r="8" className="logo-b" />
    </svg>
  )
}

export default function App() {
  const initial = useMemo(() => loadAutosave() ?? emptyDoc(), [])
  const { doc, set, checkpoint, undo, redo, canUndo, canRedo } = useHistory<Doc>(initial)
  const [selection, setSelection] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState(1)
  const [fitTick, setFitTick] = useState(0)
  const [snap, setSnap] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [withCredits, setWithCredits] = useState(true)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [panel, setPanel] = useState<'left' | 'right' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusTextTick, setFocusTextTick] = useState(0)
  const [structureOpen, setStructureOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const saveWarned = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)

  const selectedItems = useMemo(() => doc.items.filter((i) => selection.includes(i.id)), [doc.items, selection])
  const sel = useMemo(() => selectedItems.map((i) => i.id), [selectedItems])

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  // Keep icon files loading for whatever is on the board, and autosave the figure.
  useEffect(() => {
    void ensureIcons(doc.items.flatMap((i) => (i.type === 'icon' ? [i.iconId] : [])))
  }, [doc.items])
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (saveAutosave(doc)) saveWarned.current = false
      else if (!saveWarned.current) {
        saveWarned.current = true
        say('This figure is too big for the browser to keep automatically. Use File, Save project so you do not lose it.')
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [doc, say])
  useEffect(() => {
    document.title = `${doc.title || 'Untitled figure'} – Plate`
  }, [doc.title])

  const patchItems = useCallback(
    (ids: string[], p: Record<string, unknown>, key?: string) =>
      set((d) => ({ ...d, items: d.items.map((i) => (ids.includes(i.id) ? ({ ...i, ...p } as Item) : i)) }), true, key),
    [set],
  )
  const patchDoc = useCallback((p: Partial<Doc>, key?: string) => set((d) => ({ ...d, ...p }), true, key), [set])

  const addIcon = useCallback(
    (iconId: string, at?: Pt) => {
      const meta = ICON_BY_ID.get(iconId)
      if (!meta) return
      const n = doc.items.length % 6
      const where = at ?? { x: doc.width / 2 + n * 28 - 70, y: doc.height / 2 + n * 28 - 70 }
      const item = newIcon(meta, where)
      set((d) => ({ ...d, items: [...d.items, item] }))
      setSelection([item.id])
      setTool('select')
      setPanel(null)
    },
    [doc.items.length, doc.width, doc.height, set],
  )

  const createText = useCallback(
    (at: Pt) => {
      const item = newText(at)
      set((d) => ({ ...d, items: [...d.items, item] }))
      setSelection([item.id])
      setTool('select')
      setPanel('right')
      setFocusTextTick((t) => t + 1)
    },
    [set],
  )

  const duplicate = useCallback(() => {
    if (!selectedItems.length) return
    const groups = new Map<string, string>() // copies of a group form a new group of their own
    const clones = selectedItems.map((it) => {
      const c = { ...translateItem(it, 16, 16), id: uid() } as Item
      if (it.group) {
        if (!groups.has(it.group)) groups.set(it.group, uid())
        c.group = groups.get(it.group)
      }
      return c
    })
    set((d) => ({ ...d, items: [...d.items, ...clones] }))
    setSelection(clones.map((c) => c.id))
  }, [selectedItems, set])

  const remove = useCallback(() => {
    if (!sel.length) return
    set((d) => ({ ...d, items: d.items.filter((i) => !sel.includes(i.id)) }))
    setSelection([])
  }, [sel, set])

  const order = useCallback(
    (mode: Order) => {
      if (sel.length) set((d) => ({ ...d, items: reorder(d.items, sel, mode) }))
    },
    [sel, set],
  )

  const align = useCallback(
    (a: Align) => {
      if (selectedItems.length < 2) return
      const boxes = new Map(selectedItems.map((it) => [it.id, aabbOf(it)]))
      const all = [...boxes.values()]
      const left = Math.min(...all.map((b) => b.x))
      const right = Math.max(...all.map((b) => b.x + b.w))
      const top = Math.min(...all.map((b) => b.y))
      const bottom = Math.max(...all.map((b) => b.y + b.h))
      set((d) => ({
        ...d,
        items: d.items.map((it) => {
          const b = boxes.get(it.id)
          if (!b) return it
          const dx = a === 'left' ? left - b.x : a === 'right' ? right - (b.x + b.w) : a === 'center' ? (left + right) / 2 - (b.x + b.w / 2) : 0
          const dy = a === 'top' ? top - b.y : a === 'bottom' ? bottom - (b.y + b.h) : a === 'middle' ? (top + bottom) / 2 - (b.y + b.h / 2) : 0
          return translateItem(it, dx, dy)
        }),
      }))
    },
    [selectedItems, set],
  )

  const groupSel = useCallback(() => {
    if (sel.length < 2) return
    const g = uid()
    set((d) => ({ ...d, items: d.items.map((i) => (sel.includes(i.id) ? { ...i, group: g } : i)) }))
  }, [sel, set])

  const ungroupSel = useCallback(() => {
    const gs = new Set(selectedItems.flatMap((i) => (i.group ? [i.group] : [])))
    if (!gs.size) return
    set((d) => ({ ...d, items: d.items.map((i) => (i.group && gs.has(i.group) ? { ...i, group: undefined } : i)) }))
  }, [selectedItems, set])

  const scaleSel = useCallback(
    (f: number) => {
      const items = selectedItems.filter((i) => !i.locked)
      if (items.length === 0) return
      const u = unionAabb(items)
      const o = { x: u.x + u.w / 2, y: u.y + u.h / 2 }
      const ids = new Set(items.map((i) => i.id))
      set((d) => ({ ...d, items: d.items.map((i) => (ids.has(i.id) ? scaleItem(i, f, o) : i)) }))
    },
    [selectedItems, set],
  )

  const addPanelLabel = useCallback(() => {
    const used = new Set(doc.items.flatMap((i) => (i.type === 'text' && /^[A-Z]$/.test(i.text.trim()) ? [i.text.trim()] : [])))
    let letter = 'A'
    for (let c = 65; c < 91; c++) {
      if (!used.has(String.fromCharCode(c))) {
        letter = String.fromCharCode(c)
        break
      }
    }
    const u = selectedItems.length ? unionAabb(selectedItems) : null
    const at = u ? { x: Math.max(8, u.x), y: Math.max(8, u.y - 52) } : { x: 24, y: 24 }
    const item: Item = { ...newText(at, letter, 40), bold: true }
    set((d) => ({ ...d, items: [...d.items, item] }))
    setSelection([item.id])
    setTool('select')
  }, [doc.items, selectedItems, set])

  const addScaleBar = useCallback(() => {
    const g = uid()
    const x = 48
    const y = doc.height - 80
    const bar: Item = { ...newShape('rect', { x, y }), w: 160, h: 8, fill: INK, strokeWidth: 0, group: g }
    const label: Item = { ...newText({ x: 0, y: y + 16 }, '10 µm', 20), align: 'center', group: g }
    label.x = x + 80 - measureText(label).w / 2
    set((d) => ({ ...d, items: [...d.items, bar, label] }))
    setSelection([bar.id, label.id])
    setTool('select')
    say('Scale bar added. Edit its label (Alt-click the text) and resize the bar so it matches your image’s scale.')
  }, [doc.height, set, say])

  const importFiles = useCallback(
    async (files: File[], at?: Pt) => {
      const images = files.filter((f) => /^image\//.test(f.type) || /\.svg$/i.test(f.name))
      if (images.length === 0) {
        say('Drop an SVG, PNG, JPG, WebP or GIF image.')
        return
      }
      const added: Item[] = []
      const failed: string[] = []
      for (const f of images) {
        try {
          const img = await importImageFile(f)
          const n = added.length
          const c = at ?? { x: doc.width / 2, y: doc.height / 2 }
          added.push(newImage(img.src, img.w, img.h, { x: c.x + n * 24, y: c.y + n * 24 }, { name: img.name }))
        } catch (err) {
          failed.push(`${f.name}: ${err instanceof Error ? err.message : 'could not be imported.'}`)
        }
      }
      if (added.length) {
        set((d) => ({ ...d, items: [...d.items, ...added] }))
        setSelection(added.map((i) => i.id))
        setTool('select')
        setPanel(null)
      }
      if (failed.length) say(failed[0] + (failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''))
    },
    [doc.width, doc.height, set, say],
  )

  const addStructure = useCallback(
    (smiles: string, color: boolean, image: StructureImage) => {
      const item = newImage(image.src, image.w, image.h, { x: doc.width / 2, y: doc.height / 2 }, { smiles, smilesColor: color, name: 'Structure' }, 220)
      set((d) => ({ ...d, items: [...d.items, item] }))
      setSelection([item.id])
      setTool('select')
      setStructureOpen(false)
      setPanel(null)
    },
    [doc.width, doc.height, set],
  )

  const redrawStructure = useCallback(
    async (id: string, smiles: string, color: boolean) => {
      try {
        const img = await renderSmiles(smiles, color)
        set((d) => ({
          ...d,
          items: d.items.map((i) => {
            if (i.id !== id || i.type !== 'image') return i
            const s = Math.max(i.w, i.h) / Math.max(img.w, img.h)
            const w = img.w * s
            const h = img.h * s
            return { ...i, src: img.src, smiles: smiles.trim(), smilesColor: color, x: i.x + (i.w - w) / 2, y: i.y + (i.h - h) / 2, w, h }
          }),
        }))
        return true
      } catch (err) {
        say(err instanceof Error ? err.message : 'Could not draw that structure.')
        return false
      }
    },
    [set, say],
  )

  // Pasting a copied picture puts it on the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEntry(e.target) || document.querySelector('dialog[open]')) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void importFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importFiles])

  const toggleFlag = useCallback(
    (id: string, flag: 'hidden' | 'locked') =>
      set((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, [flag]: !i[flag] } : i)) })),
    [set],
  )

  const selectFromLayers = useCallback(
    (ids: string[], additive: boolean) =>
      setSelection((cur) => (additive ? (cur.includes(ids[0]) ? cur.filter((c) => c !== ids[0]) : [...cur, ids[0]]) : ids)),
    [],
  )

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!sel.length) return
      set((d) => ({ ...d, items: d.items.map((i) => (sel.includes(i.id) && !i.locked ? translateItem(i, dx, dy) : i)) }), true, `nudge:${sel.join(',')}`)
    },
    [sel, set],
  )

  const zoomBy = useCallback((f: number) => setZoom((z) => clamp(z * f, 0.1, 4)), [])

  const newFigure = useCallback(() => {
    set(() => emptyDoc())
    setSelection([])
    setFitTick((t) => t + 1)
    say('Started a new figure. Undo brings the previous one back.')
  }, [set, say])

  const loadExample = useCallback(() => {
    set(() => exampleDoc())
    setSelection([])
    setFitTick((t) => t + 1)
  }, [set])

  const saveProject = useCallback(() => {
    download(new Blob([serializeProject(doc)], { type: 'application/json' }), `${fileSlug(doc.title)}.plate.json`)
    say('Project saved. Open it again from File, then Open project.')
  }, [doc, say])

  const openProject = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseProject(await file.text())
    if (!parsed) {
      say('That file is not a Plate project. Choose a .plate.json file you saved from here.')
      return
    }
    set(() => parsed)
    setSelection([])
    setFitTick((t) => t + 1)
    say(`Opened “${parsed.title}”.`)
  }

  const runExport = async (kind: 'svg' | 'png', scale = 2) => {
    setBusy(true)
    try {
      if (kind === 'svg') {
        const { svg } = await buildSvg(doc, withCredits)
        download(new Blob([svg], { type: 'image/svg+xml' }), `${fileSlug(doc.title)}.svg`)
      } else {
        download(await renderPng(doc, scale, withCredits), `${fileSlug(doc.title)}${scale > 1 ? `@${scale}x` : ''}.png`)
      }
      const needsCredit = usedIcons(doc).some((m) => !m.license.startsWith('CC0'))
      say(
        needsCredit && !withCredits
          ? 'Exported. Some icons need credit, so add the credit line from the Credits button.'
          : 'Exported.',
      )
    } catch (err) {
      say(`Export failed. ${err instanceof Error ? err.message : 'Try again.'}`)
    } finally {
      setBusy(false)
    }
  }

  // Keyboard shortcuts. The handler always sees the latest state through the ref.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onKey.current = (e) => {
      if (isTextEntry(e.target) || document.querySelector('dialog[open]')) return
      if (e.key === 'Escape' && document.querySelector('.menu-pop')) return // the open menu closes itself
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()

      if (mod) {
        const run = (fn: () => void) => {
          e.preventDefault()
          fn()
        }
        switch (k) {
          case 'z':
            return run(e.shiftKey ? redo : undo)
          case 'y':
            return run(redo)
          case 'd':
            return run(duplicate)
          case 'g':
            return run(e.shiftKey ? ungroupSel : groupSel)
          case 'a':
            return run(() => setSelection(doc.items.filter((i) => !i.hidden && !i.locked).map((i) => i.id)))
          case 's':
            return run(saveProject)
          case ']':
            return run(() => order('front'))
          case '[':
            return run(() => order('back'))
          case '0':
            return run(() => setFitTick((t) => t + 1))
        }
        return
      }
      if (e.altKey) return

      const step = e.shiftKey ? 10 : 1
      const nudgeKey = (dx: number, dy: number) => {
        e.preventDefault()
        nudge(dx * step, dy * step)
      }
      switch (k) {
        case 'delete':
        case 'backspace':
          e.preventDefault()
          return remove()
        case 'escape':
          setSelection([])
          return setTool('select')
        case 'arrowleft':
          return nudgeKey(-1, 0)
        case 'arrowright':
          return nudgeKey(1, 0)
        case 'arrowup':
          return nudgeKey(0, -1)
        case 'arrowdown':
          return nudgeKey(0, 1)
        case ']':
          return order('forward')
        case '[':
          return order('backward')
        case '=':
        case '+':
          return zoomBy(1.25)
        case '-':
          return zoomBy(0.8)
        case '0':
          return setFitTick((t) => t + 1)
      }
      const t = TOOLS.find((x) => x.key.toLowerCase() === k)
      if (t) setTool(t.id)
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const creditCount = usedIcons(doc).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Plate</span>
        </div>
        <input
          className="title"
          value={doc.title}
          aria-label="Figure title"
          maxLength={120}
          onChange={(e) => patchDoc({ title: e.target.value }, 'title')}
        />
        <Menu label="File" icon={<Glyph name="file" size={16} />}>
          <MenuItem onClick={newFigure}>New figure</MenuItem>
          <MenuItem onClick={() => fileRef.current?.click()}>Open project…</MenuItem>
          <MenuItem onClick={saveProject} hint={`${MOD}S`}>
            Save project
          </MenuItem>
          <MenuItem onClick={loadExample}>Load example figure</MenuItem>
        </Menu>

        <Menu label="Insert" icon={<Glyph name="insert" size={16} />}>
          <MenuItem onClick={addPanelLabel}>Panel label (A, B, C…)</MenuItem>
          <MenuItem onClick={addScaleBar}>Scale bar</MenuItem>
          <MenuItem onClick={() => setStructureOpen(true)}>Chemical structure from SMILES…</MenuItem>
          <MenuItem onClick={() => imageRef.current?.click()}>Image or SVG…</MenuItem>
        </Menu>

        <div className="cluster tools" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="icon-btn"
              aria-pressed={tool === t.id}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              onClick={() => setTool(t.id)}
            >
              <Glyph name={t.icon} />
            </button>
          ))}
        </div>

        <div className="cluster" role="group" aria-label="History">
          <button type="button" className="icon-btn" title={`Undo (${MOD}Z)`} aria-label="Undo" disabled={!canUndo} onClick={undo}>
            <Glyph name="undo" />
          </button>
          <button type="button" className="icon-btn" title={`Redo (${MOD}⇧Z)`} aria-label="Redo" disabled={!canRedo} onClick={redo}>
            <Glyph name="redo" />
          </button>
        </div>

        <div className="cluster zoom" role="group" aria-label="View">
          <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(0.8)}>
            <Glyph name="minus" />
          </button>
          <button type="button" className="zoom-readout" title="Reset to 100%" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.25)}>
            <Glyph name="plus" />
          </button>
          <button type="button" className="icon-btn" aria-label="Fit board to window" title={`Fit to window (${MOD}0)`} onClick={() => setFitTick((t) => t + 1)}>
            <Glyph name="fit" />
          </button>
          <button type="button" className="icon-btn" aria-label="Show grid" aria-pressed={showGrid} title="Show grid" onClick={() => setShowGrid((v) => !v)}>
            <Glyph name="grid" />
          </button>
          <button type="button" className="icon-btn" aria-label="Snap to grid" aria-pressed={snap} title="Snap to grid" onClick={() => setSnap((v) => !v)}>
            <Glyph name="snap" />
          </button>
        </div>

        <button type="button" className="btn" onClick={() => setCreditsOpen(true)}>
          <Glyph name="credit" size={16} />
          <span>Credits{creditCount ? ` (${creditCount})` : ''}</span>
        </button>

        <Menu label={busy ? 'Exporting…' : 'Export'} icon={<Glyph name="download" size={16} />} align="right" primary>
          <MenuItem onClick={() => void runExport('svg')} disabled={busy}>
            SVG, editable vectors
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 1)} disabled={busy}>
            PNG, 1× size
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 2)} disabled={busy}>
            PNG, 2× (screens)
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 4)} disabled={busy}>
            PNG, 4× (print)
          </MenuItem>
        </Menu>

        <div className="cluster panel-toggles" role="group" aria-label="Panels">
          <button type="button" className="icon-btn" aria-label="Icon library" aria-pressed={panel === 'left'} onClick={() => setPanel((p) => (p === 'left' ? null : 'left'))}>
            <Glyph name="panelLeft" />
          </button>
          <button type="button" className="icon-btn" aria-label="Properties" aria-pressed={panel === 'right'} onClick={() => setPanel((p) => (p === 'right' ? null : 'right'))}>
            <Glyph name="panelRight" />
          </button>
        </div>
      </header>

      <div className="workspace" data-panel={panel ?? undefined}>
        <div className="side side-left">
          <Palette onAdd={(id) => addIcon(id)} />
        </div>
        <main className="canvas-area">
          <Canvas
            doc={doc}
            selection={sel}
            tool={tool}
            zoom={zoom}
            setZoom={setZoom}
            fitTick={fitTick}
            snap={snap}
            showGrid={showGrid}
            setSelection={setSelection}
            setDoc={set}
            checkpoint={checkpoint}
            onToolDone={() => setTool('select')}
            onAddIcon={addIcon}
            onCreateText={createText}
            onExample={loadExample}
            onImportFiles={(files, at) => void importFiles(files, at)}
          />
        </main>
        <div className="side side-right">
          <Inspector
            doc={doc}
            selected={selectedItems}
            focusTextTick={focusTextTick}
            patch={patchItems}
            patchDoc={patchDoc}
            onDuplicate={duplicate}
            onDelete={remove}
            onOrder={order}
            onAlign={align}
            onSelect={selectFromLayers}
            onToggle={toggleFlag}
            onGroup={groupSel}
            onUngroup={ungroupSel}
            onScale={scaleSel}
            onRedrawStructure={redrawStructure}
          />
        </div>
      </div>

      <CreditsDialog
        doc={doc}
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        withCredits={withCredits}
        setWithCredits={setWithCredits}
        onCopied={(ok) => say(ok ? 'Credit line copied.' : 'Could not copy. Select the text and copy it by hand.')}
      />

      <StructureDialog open={structureOpen} onClose={() => setStructureOpen(false)} onAdd={addStructure} />

      <input
        ref={imageRef}
        type="file"
        accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif,.svg"
        multiple
        hidden
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void openProject(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
