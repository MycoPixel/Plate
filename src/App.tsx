import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from './Canvas'
import { creditedImages, usedIcons } from './credits'
import { CreditsDialog } from './CreditsDialog'
import { FigureDialog } from './FigureDialog'
import { emptyDoc, exampleDoc, INK, newChart, newIcon, newImage, newMarker, newShape, newText, uid } from './defaults'
import { canPaste, copyItems, pasteCopies, setClipboardVerified } from './clipboard'
import { ChartDialog } from './ChartDialog'
import { remapAnchors, syncConnectors } from './connectors'
import { buildSvg, copyPng, download, exportLayout, fileSlug, printPdf, renderPng, thumbOf } from './export'
import { ExportDialog } from './ExportDialog'
import type { ExportRequest } from './ExportDialog'
import { aabbOf, distributeBoxes, measureText, scaleItem, translateItem, unionAabb } from './geometry'
import { GeneratorDialog } from './GeneratorDialog'
import type { GeneratorRequest } from './GeneratorDialog'
import { gelLanes, panelGrid, petriDish, wellPlate, PLATE_PRESETS } from './generators'
import { SequenceDialog } from './SequenceDialog'
import { decodeShare, encodeShare } from './share'
import { sequenceItems } from './sequences'
import type { FastaRecord, SequenceOptions } from './sequences'
import { Glyph } from './Glyph'
import { HistoryDialog } from './HistoryDialog'
import type { GlyphName } from './Glyph'
import { useHistory } from './history'
import { ensureIcons, ICON_BY_ID, iconIdOf } from './icons'
import { getLang, LANGS, setLang, t, useLang } from './i18n'
import { importImageFile } from './images'
import { pushRecent } from './library'
import { hasMarkers, newLegend, syncMarkers } from './markers'
import { Inspector } from './Inspector'
import type { ArrangeOp, Order } from './Inspector'
import { Menu, MenuItem } from './Menu'
import { Palette } from './Palette'
import { ReplaceIconDialog } from './ReplaceIconDialog'
import { renderSmiles } from './structure'
import type { StructureImage } from './structure'
import { StructureDialog } from './StructureDialog'
import { TemplateDialog } from './TemplateDialog'
import type { Template } from './templates'
import { parseProject, serializeProject } from './project'
import { dropVersions, saveVersion } from './versions'
import type { VersionMeta } from './versions'
import { getFigure, hasLocalFigure, latestFigure, markLocalFigureMigrated, putFigure, readLocalFigure, updateFigure } from './store'
import type { ChartKind, ChartSeries, ColorVision, Doc, Item, Pt, Tool } from './types'
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
  { id: 'membrane', icon: 'membrane', label: 'Membrane', key: 'M' },
  { id: 'line', icon: 'line', label: 'Line', key: 'L' },
  { id: 'bracket', icon: 'bracket', label: 'Bracket', key: 'B' },
  { id: 'brace', icon: 'brace', label: 'Brace', key: 'C' },
  { id: 'callout', icon: 'callout', label: 'Callout', key: 'O' },
  { id: 'poly', icon: 'poly', label: 'Polygon', key: 'P' },
  { id: 'path', icon: 'path', label: 'Curve', key: 'N' },
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
  const lang = useLang()
  const initial = useMemo(() => emptyDoc(), [])
  const { doc, set: setHistory, reset, checkpoint, undo, redo, canUndo, canRedo } = useHistory<Doc>(initial)
  const [figId, setFigId] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // Every change goes through here, so arrows attached to items always follow them.
  const set = useCallback(
    (fn: (d: Doc) => Doc, record?: boolean, key?: string) => setHistory((d) => syncConnectors(syncMarkers(fn(d))), record, key),
    [setHistory],
  )
  const [selection, setSelection] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [showMoreTools, setShowMoreTools] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fitTick, setFitTick] = useState(0)
  const [zoomSelTick, setZoomSelTick] = useState(0)
  const [snap, setSnap] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [withCredits, setWithCredits] = useState(true)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [panel, setPanel] = useState<'left' | 'right' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusTextTick, setFocusTextTick] = useState(0)
  const [structureOpen, setStructureOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [sequenceOpen, setSequenceOpen] = useState(false)
  const [generatorOpen, setGeneratorOpen] = useState<'plate' | 'gel' | 'petri' | 'panels' | null>(null)
  const [colorVision, setColorVision] = useState<ColorVision>('normal')
  const [exportOpen, setExportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const saveWarned = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const snapRef = useRef<{ figId: string; at: number; sig: string } | null>(null)

  // Move an old localStorage figure into the store, then open the most recent one.
  const booting = useRef(false)
  useEffect(() => {
    if (booting.current) return // StrictMode runs effects twice; migrate only once
    booting.current = true
    void (async () => {
      try {
        const shared = await decodeShare(window.location.hash)
        if (shared) {
          reset(shared)
          setFigId(null)
          say(t('Opened the shared figure. It is yours to edit, and it is saved like any other.'))
          return
        }
        if (hasLocalFigure()) {
          const local = readLocalFigure()
          if (local) await putFigure(local)
          markLocalFigureMigrated()
        }
        const latest = await latestFigure()
        if (latest) {
          reset(latest.doc)
          setFigId(latest.id)
          snapRef.current = { figId: latest.id, at: Date.now(), sig: JSON.stringify(latest.doc) }
        } else {
          reset(readLocalFigure() ?? emptyDoc())
          setFigId(null)
        }
      } catch {
        reset(readLocalFigure() ?? emptyDoc())
        setFigId(null)
      } finally {
        setBooted(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedItems = useMemo(() => doc.items.filter((i) => selection.includes(i.id)), [doc.items, selection])
  const sel = useMemo(() => selectedItems.map((i) => i.id), [selectedItems])

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  // Keep icon files loading for whatever is on the board, and autosave the figure.
  useEffect(() => {
    void ensureIcons(doc.items.flatMap((i) => iconIdOf(i) ?? []))
  }, [doc.items])
  // Writes the current figure to the store, with a thumbnail for the gallery. Serialized, so a
  // second save cannot start while the first is still fetching icons for its thumbnail.
  const saving = useRef(false)
  const flush = useCallback(async () => {
    if (!booted || saving.current) return
    saving.current = true
    try {
      let thumb = ''
      try {
        thumb = await thumbOf(doc)
      } catch {
        thumb = ''
      }
      if (figId) await updateFigure(figId, doc, thumb)
      else setFigId(await putFigure(doc, thumb))
    } catch {
      if (!saveWarned.current) {
        saveWarned.current = true
        say(t('This browser refused to save the figure. Use File, Save project so you do not lose it.'))
      }
    } finally {
      saving.current = false
    }
  }, [doc, figId, booted, say])

  useEffect(() => {
    if (!booted) return
    const timer = window.setTimeout(() => void flush(), 1500)
    return () => window.clearTimeout(timer)
  }, [doc, figId, booted, flush])

  // Snapshots are the undo history of a whole session: at most one every few minutes.
  const snapshot = useCallback(async () => {
    if (!figId) return
    snapRef.current = { figId, at: Date.now(), sig: JSON.stringify(doc) }
    try {
      await saveVersion(figId, doc)
    } catch {
      /* version history is a convenience; the figure itself is still saved */
    }
  }, [doc, figId])

  useEffect(() => {
    if (!booted || !figId) return
    const sig = JSON.stringify(doc)
    // A figure full of photos can be many megabytes; snapshots would fill the browser's storage.
    if (sig.length > 3_000_000) return
    const prev = snapRef.current
    if (prev && prev.figId === figId && prev.sig === sig) return
    const wait = prev && prev.figId === figId ? Math.max(0, 3 * 60 * 1000 - (Date.now() - prev.at)) : 0
    const timer = window.setTimeout(() => {
      if (snapRef.current?.figId === figId && snapRef.current.sig === sig) return
      void snapshot()
    }, wait + 3000)
    return () => window.clearTimeout(timer)
  }, [doc, figId, booted, snapshot])

  // Closing or hiding the tab saves at once instead of waiting for the debounce.
  useEffect(() => {
    if (!booted) return
    const onHide = () => {
      if (document.visibilityState === 'visible') return
      void flush()
    }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', () => void flush())
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', () => void flush())
    }
  }, [booted, flush])
  useEffect(() => {
    document.title = `${doc.title || t('Untitled figure')} – EnlacePlot`
  }, [doc.title, lang])

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
      pushRecent(iconId)
    },
    [doc.items.length, doc.width, doc.height, set],
  )

  const openReplace = useCallback(() => {
    if (!selectedItems.some((i) => i.type === 'icon')) return
    setReplaceOpen(true)
  }, [selectedItems])

  // Swap the drawing on every selected icon, leaving box, flip, opacity and colours alone.
  const replaceIcon = useCallback(
    (iconId: string) => {
      const ids = selectedItems.filter((i) => i.type === 'icon').map((i) => i.id)
      if (ids.length === 0) return
      patchItems(ids, { iconId })
      pushRecent(iconId)
      setReplaceOpen(false)
      say(t('Icon replaced. It kept its position, size and colours.'))
    },
    [selectedItems, patchItems, say],
  )

  const createText = useCallback(
    (at: Pt) => {
      const item = newText(at)
      set((d) => ({ ...d, items: [...d.items, item] }))
      setSelection([item.id])
      setTool('select')
      setPanel('right')
      setFocusTextTick((n) => n + 1)
    },
    [set],
  )

  const duplicate = useCallback(() => {
    if (!selectedItems.length) return
    const groups = new Map<string, string>() // copies of a group form a new group of their own
    const ids = new Map<string, string>() // old id to the copy's id, so copied arrows follow the copied items
    const moved = selectedItems.map((it) => {
      const c = { ...translateItem(it, 16, 16), id: uid() } as Item
      ids.set(it.id, c.id)
      if (it.group) {
        if (!groups.has(it.group)) groups.set(it.group, uid())
        c.group = groups.get(it.group)
      }
      return c
    })
    const clones = remapAnchors(moved, ids)
    set((d) => ({ ...d, items: [...d.items, ...clones] }))
    setSelection(clones.map((c) => c.id))
  }, [selectedItems, set])

  const repeatSelection = useCallback(
    (count: number, dx: number, dy: number) => {
      if (!selectedItems.length) return
      const made: Item[] = []
      for (let k = 1; k <= count; k++) {
        const groups = new Map<string, string>()
        const ids = new Map<string, string>()
        const moved = selectedItems.map((it) => {
          const c = { ...translateItem(it, dx * k, dy * k), id: uid() } as Item
          ids.set(it.id, c.id)
          if (it.group) {
            const key = `${k}:${it.group}`
            if (!groups.has(key)) groups.set(key, uid())
            c.group = groups.get(key)
          }
          return c
        })
        made.push(...remapAnchors(moved, ids))
      }
      set((d) => ({ ...d, items: [...d.items, ...made] }))
      setSelection(made.map((c) => c.id))
    },
    [selectedItems, set],
  )

  const remove = useCallback(() => {
    if (!sel.length) return
    set((d) => ({ ...d, items: d.items.filter((i) => !sel.includes(i.id)) }))
    setSelection([])
  }, [sel, set])

  const copySel = useCallback(() => {
    if (!selectedItems.length) return
    const marker = copyItems(selectedItems)
    // The marker goes on the system clipboard too, so a later paste can tell the items are still what was copied.
    setClipboardVerified(true)
    void (navigator.clipboard?.writeText(marker) ?? Promise.reject(new Error('no clipboard'))).catch(() => setClipboardVerified(false))
    say(t('Copied. Paste with {key}V.', { key: MOD }))
  }, [selectedItems, say])

  const cutSel = useCallback(() => {
    copySel()
    remove()
  }, [copySel, remove])

  const order = useCallback(
    (mode: Order) => {
      if (sel.length) set((d) => ({ ...d, items: reorder(d.items, sel, mode) }))
    },
    [sel, set],
  )

  const align = useCallback(
    (a: ArrangeOp) => {
      const items = selectedItems.filter((i) => !i.locked)
      if (items.length === 0) return
      if (a.kind === 'distribute') {
        if (items.length < 3) return
        const boxes = new Map(items.map((it) => [it.id, aabbOf(it)]))
        const moves = distributeBoxes(boxes, a.axis)
        set((d) => ({
          ...d,
          items: d.items.map((it) => {
            const m = moves.get(it.id)
            return m ? translateItem(it, m.x, m.y) : it
          }),
        }))
        return
      }
      // Aligning to the board works on a single item; aligning items to each other needs two.
      if (a.kind === 'align' && items.length < 2) return
      const boxes = new Map(items.map((it) => [it.id, aabbOf(it)]))
      const all = [...boxes.values()]
      const left = a.kind === 'board' ? 0 : Math.min(...all.map((b) => b.x))
      const right = a.kind === 'board' ? doc.width : Math.max(...all.map((b) => b.x + b.w))
      const top = a.kind === 'board' ? 0 : Math.min(...all.map((b) => b.y))
      const bottom = a.kind === 'board' ? doc.height : Math.max(...all.map((b) => b.y + b.h))
      const to = a.to
      set((d) => ({
        ...d,
        items: d.items.map((it) => {
          const b = boxes.get(it.id)
          if (!b) return it
          const dx = to === 'left' ? left - b.x : to === 'right' ? right - (b.x + b.w) : to === 'center' ? (left + right) / 2 - (b.x + b.w / 2) : 0
          const dy = to === 'top' ? top - b.y : to === 'bottom' ? bottom - (b.y + b.h) : to === 'middle' ? (top + bottom) / 2 - (b.y + b.h / 2) : 0
          return translateItem(it, dx, dy)
        }),
      }))
    },
    [selectedItems, doc.width, doc.height, set],
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

  const addMarker = useCallback(() => {
    // Drop it just above the selection, or in the middle of the board, and let the reader
    // decide where it really belongs.
    const u = selectedItems.length ? unionAabb(selectedItems) : null
    const at = u ? { x: u.x + u.w / 2, y: Math.max(24, u.y - 30) } : { x: doc.width / 2, y: doc.height / 2 }
    const item = newMarker(at)
    set((d) => ({ ...d, items: [...d.items, item] }))
    setSelection([item.id])
    setTool('select')
    setPanel('right')
    say(t('Marker added. Give it a label and the legend writes itself.'))
  }, [selectedItems, doc.width, doc.height, set, say])

  const addLegend = useCallback(() => {
    if (!hasMarkers(doc)) return say(t('Add a numbered marker first.'))
    const u = selectedItems.length ? unionAabb(selectedItems) : null
    const at = { x: u ? u.x : 24, y: u ? Math.min(doc.height - 200, u.y + u.h + 40) : 24 }
    const item = newLegend(at)
    set((d) => ({ ...d, items: [...d.items, item] }))
    setSelection([item.id])
    setTool('select')
    say(t('Legend added. It follows the markers as you move them.'))
  }, [doc, selectedItems, set, say])

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
    say(t('Scale bar added. Edit its label (Alt-click the text) and resize the bar so it matches your image’s scale.'))
  }, [doc.height, set, say])

  const importFiles = useCallback(
    async (files: File[], at?: Pt) => {
      const images = files.filter((f) => /^image\//.test(f.type) || /\.svg$/i.test(f.name))
      if (images.length === 0) {
        say(t('Drop an SVG, PNG, JPG, WebP or GIF image.'))
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
          failed.push(`${f.name}: ${err instanceof Error ? err.message : t('could not be imported.')}`)
        }
      }
      if (added.length) {
        set((d) => ({ ...d, items: [...d.items, ...added] }))
        setSelection(added.map((i) => i.id))
        setTool('select')
        setPanel(null)
      }
      if (failed.length) say(failed.length > 1 ? t('{first} (and {n} more)', { first: failed[0], n: failed.length - 1 }) : failed[0])
    },
    [doc.width, doc.height, set, say],
  )

  const addStructure = useCallback(
    (smiles: string, color: boolean, image: StructureImage) => {
      const item = newImage(image.src, image.w, image.h, { x: doc.width / 2, y: doc.height / 2 }, { smiles, smilesColor: color, name: t('Structure') }, 220)
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
        say(err instanceof Error ? err.message : t('Could not draw that structure.'))
        return false
      }
    },
    [set, say],
  )

  // Pasting puts a copied picture, or items copied inside EnlacePlot, on the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEntry(e.target) || document.querySelector('dialog[open]')) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void importFiles(files)
        return
      }
      if (canPaste(e.clipboardData?.getData('text/plain') ?? '')) {
        const copies = pasteCopies()
        if (copies.length) {
          e.preventDefault()
          set((d) => ({ ...d, items: [...d.items, ...copies] }))
          setSelection(copies.map((c) => c.id))
          setTool('select')
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importFiles, set])

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
    const fresh = emptyDoc()
    reset(fresh)
    setFigId(null)
    setSelection([])
    setFitTick((n) => n + 1)
    say(t('Started a new figure. Find it later under File, My figures.'))
  }, [reset, say])

  const openFigure = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await flush()
          const next = await getFigure(id)
          if (!next) {
            say(t('That figure could not be opened.'))
            return
          }
          reset(next)
          setFigId(id)
          snapRef.current = { figId: id, at: Date.now(), sig: JSON.stringify(next) }
          setSelection([])
          setGalleryOpen(false)
          setFitTick((n) => n + 1)
          say(t('“{name}” opened.', { name: next.title }))
        } catch {
          say(t('That figure could not be opened.'))
        }
      })()
    },
    [flush, reset, say],
  )

  const restoreVersion = useCallback(
    (version: Doc, meta: VersionMeta) => {
      void (async () => {
        if (figId) {
          try {
            await saveVersion(figId, doc)
          } catch {
            /* the current state is already autosaved, so nothing is lost either way */
          }
        }
        reset(version)
        setSelection([])
        setHistoryOpen(false)
        setFitTick((n) => n + 1)
        say(
          t('Restored the version from {when}. The state it replaced is still in the history.', {
            when: new Date(meta.at).toLocaleString(getLang() === 'es' ? 'es' : 'en', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          }),
        )
      })()
    },
    [doc, figId, reset, say],
  )

  const deleteFigure = useCallback(
    (id: string) => {
      void dropVersions(id)
      if (id === figId) {
        const fresh = emptyDoc()
        reset(fresh)
        setFigId(null)
        setSelection([])
      }
    },
    [figId, reset],
  )

  const loadExample = useCallback(() => {
    set(() => exampleDoc())
    setSelection([])
    setFitTick((n) => n + 1)
  }, [set])

  const applyTemplate = useCallback(
    (tpl: Template) => {
      set(() => tpl.build())
      setSelection([])
      setTemplateOpen(false)
      setFitTick((n) => n + 1)
      say(t('“{name}” added. Change anything in it.', { name: tpl.label }))
    },
    [set, say],
  )

  const insertGenerated = useCallback(
    (req: GeneratorRequest) => {
      const items =
        req.kind === 'plate'
          ? wellPlate(PLATE_PRESETS.find((p) => p.id === req.preset) ?? PLATE_PRESETS[4], doc)
          : req.kind === 'gel'
            ? gelLanes(req.options, doc)
            : req.kind === 'petri'
              ? petriDish(req.pattern, doc)
              : panelGrid(req.options, doc)
      set((d) => ({ ...d, items: [...d.items, ...items] }))
      setSelection(items.map((i) => i.id))
      setGeneratorOpen(null)
      say(t('Added {n} items. Everything in it can be moved, repainted or deleted.', { n: items.length }))
    },
    [doc, set, setSelection, say],
  )

  const addChart = useCallback(
    (series: ChartSeries[], xNames: string[], kind: ChartKind) => {
      const c = { x: doc.width / 2, y: doc.height / 2 }
      const item = newChart(c)
      item.series = series
      item.xNames = xNames
      item.kind = kind
      const maxV = series.flatMap((s) => s.values).reduce((m, v) => Math.max(m, v), 0)
      if (maxV > 0) item.yMax = 0
      set((d) => ({ ...d, items: [...d.items, item] }))
      setSelection([item.id])
      setChartOpen(false)
      say(t('Chart added. Change its data in Properties.'))
    },
    [doc, set, setSelection, say],
  )

  const addSequences = useCallback(
    (records: FastaRecord[], options: SequenceOptions) => {
      const items = sequenceItems(records, options, doc)
      set((d) => ({ ...d, items: [...d.items, ...items] }))
      setSelection(items.map((i) => i.id))
      setSequenceOpen(false)
      say(t('Sequence added as text. Change its font, size or colour in Properties.'))
    },
    [doc, set, setSelection, say],
  )

  const shareLink = useCallback(async () => {
    const hash = await encodeShare(doc)
    if (!hash) {
      say(t('This figure is too big to share as a link. Save the project file instead.'))
      return
    }
    const url = window.location.origin + window.location.pathname + hash
    try {
      await navigator.clipboard.writeText(url)
      say(t('Link copied. Anyone who opens it sees this figure.'))
    } catch {
      window.prompt(t('Copy this link'), url)
    }
  }, [doc, say])

  const saveProject = useCallback(() => {
    download(new Blob([serializeProject(doc)], { type: 'application/json' }), `${fileSlug(doc.title)}.enlaceplot.json`)
    say(t('Project saved. Open it again from File, then Open project.'))
  }, [doc, say])

  const openProject = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseProject(await file.text())
    if (!parsed) {
      say(t('That file is not an EnlacePlot project. Choose a .enlaceplot.json file you saved from here.'))
      return
    }
    try {
      const id = await putFigure(parsed)
      setFigId(id)
      snapRef.current = { figId: id, at: Date.now(), sig: JSON.stringify(parsed) }
    } catch {
      /* keep it in memory even if the store is unavailable */
    }
    reset(parsed)
    setSelection([])
    setFitTick((n) => n + 1)
    say(t('Opened “{title}”.', { title: parsed.title }))
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
      exportToast()
    } catch (err) {
      say(t('Export failed. {msg}', { msg: err instanceof Error ? err.message : t('Try again.') }))
    } finally {
      setBusy(false)
    }
  }

  const exportToast = () => {
    const needsCredit = usedIcons(doc).some((m) => !m.license.startsWith('CC0')) || creditedImages(doc).length > 0
    say(
      needsCredit && !withCredits
        ? t('Exported. Some icons need credit, so add the credit line from the Credits button.')
        : t('Exported.'),
    )
  }

  const runDialogExport = async (req: ExportRequest) => {
    setBusy(true)
    try {
      const opts = { onlyIds: req.onlyIds }
      const base = `${fileSlug(doc.title)}${req.onlyIds ? '-selection' : ''}`
      if (req.format === 'svg') {
        const { svg } = await buildSvg(doc, withCredits, opts)
        download(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`)
      } else if (req.format === 'png') {
        const scale = ((req.widthMm / 25.4) * req.dpi) / exportLayout(doc, withCredits, opts).width
        download(await renderPng(doc, scale, withCredits, { ...opts, dpi: req.dpi }), `${base}-${req.dpi}dpi.png`)
      } else {
        await printPdf(doc, withCredits, req.widthMm, opts)
        say(t('The print window was opened. Choose “Save as PDF” to get the file.'))
        setExportOpen(false)
        return
      }
      setExportOpen(false)
      exportToast()
    } catch (err) {
      say(t('Export failed. {msg}', { msg: err instanceof Error ? err.message : t('Try again.') }))
    } finally {
      setBusy(false)
    }
  }

  const quickPdf = () =>
    void runDialogExport({ format: 'pdf', widthMm: Math.round(((doc.width * 25.4) / 96) * 10) / 10, dpi: 96 })

  const copyImage = async () => {
    setBusy(true)
    try {
      await copyPng(renderPng(doc, 2, withCredits, { onlyIds: sel.length ? sel : undefined }))
      say(t('Image copied. Paste it into a slide or a document.'))
    } catch {
      say(t('Could not copy the image. Your browser may not allow it; use Export instead.'))
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
        // Shift+2 zooms to the selection and Shift+1 to the whole board, as in other editors.
        if (e.shiftKey && k === '2') return run(() => setZoomSelTick((n) => n + 1))
        if (e.shiftKey && k === '1') return run(() => setFitTick((n) => n + 1))
        switch (k) {
          case 'z':
            return run(e.shiftKey ? redo : undo)
          case 'y':
            return run(redo)
          case 'd':
            return run(duplicate)
          case 'c':
            if (!sel.length) return
            return run(copySel)
          case 'x':
            if (!sel.length) return
            return run(cutSel)
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
            return run(() => setFitTick((n) => n + 1))
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
          return setFitTick((n) => n + 1)
      }
      const tl = TOOLS.find((x) => x.key.toLowerCase() === k)
      if (tl) setTool(tl.id)
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const creditCount = usedIcons(doc).length + creditedImages(doc).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>EnlacePlot</span>
        </div>
        <input
          className="title"
          value={doc.title}
          aria-label={t('Figure title')}
          maxLength={120}
          onChange={(e) => patchDoc({ title: e.target.value }, 'title')}
        />
        <Menu label={t('File')} icon={<Glyph name="file" size={16} />}>
          <MenuItem onClick={newFigure}>{t('New figure')}</MenuItem>
          <MenuItem onClick={() => setGalleryOpen(true)}>{t('My figures…')}</MenuItem>
          <MenuItem onClick={() => fileRef.current?.click()}>{t('Open project…')}</MenuItem>
          <MenuItem onClick={saveProject} hint={`${MOD}S`}>
            {t('Save project')}
          </MenuItem>
          <MenuItem onClick={() => void shareLink()}>{t('Copy link to this figure')}</MenuItem>
          <MenuItem onClick={() => setHistoryOpen(true)}>{t('Version history…')}</MenuItem>
          <MenuItem onClick={() => setTemplateOpen(true)}>{t('Start from a template…')}</MenuItem>
          <MenuItem onClick={loadExample}>{t('Load example figure')}</MenuItem>
        </Menu>

        <Menu label={t('Insert')} icon={<Glyph name="insert" size={16} />}>
          <MenuItem onClick={addPanelLabel}>{t('Panel label (A, B, C…)')}</MenuItem>
          <MenuItem onClick={addScaleBar}>{t('Scale bar')}</MenuItem>
          <MenuItem onClick={addMarker}>{t('Numbered marker')}</MenuItem>
          <MenuItem onClick={addLegend} disabled={!hasMarkers(doc)}>
            {t('Marker legend')}
          </MenuItem>
          <MenuItem onClick={() => setGeneratorOpen('plate')}>{t('Well plate…')}</MenuItem>
          <MenuItem onClick={() => setGeneratorOpen('gel')}>{t('Gel or blot…')}</MenuItem>
          <MenuItem onClick={() => setGeneratorOpen('petri')}>{t('Petri dish…')}</MenuItem>
          <MenuItem onClick={() => setGeneratorOpen('panels')}>{t('Panel grid…')}</MenuItem>
          <MenuItem onClick={() => setChartOpen(true)}>{t('Chart from a table…')}</MenuItem>
          <MenuItem onClick={() => setStructureOpen(true)}>{t('Chemical structure from SMILES…')}</MenuItem>
          <MenuItem onClick={() => setSequenceOpen(true)}>{t('Sequence from FASTA…')}</MenuItem>
          <MenuItem onClick={() => imageRef.current?.click()}>{t('Image or SVG…')}</MenuItem>
        </Menu>

        <div className="cluster tools" role="toolbar" aria-label={t('Tools')}>
          {TOOLS.slice(0, 6).map((tl) => (
            <button
              key={tl.id}
              type="button"
              className="icon-btn"
              aria-pressed={tool === tl.id}
              title={`${t(tl.label)} (${tl.key})`}
              aria-label={t(tl.label)}
              onClick={() => setTool(tl.id)}
            >
              <Glyph name={tl.icon} />
            </button>
          ))}
          <span className="tools-split" aria-hidden="true" />
          <button
            type="button"
            className="icon-btn"
            aria-pressed={showMoreTools}
            title={t('More shapes')}
            aria-label={t('More shapes')}
            onClick={() => setShowMoreTools((v) => !v)}
          >
            <Glyph name="more" />
          </button>
        </div>

        {showMoreTools && (
          <div className="more-tools" role="toolbar" aria-label={t('More shapes')}>
            {TOOLS.slice(6).map((tl) => (
              <button
                key={tl.id}
                type="button"
                className="icon-btn"
                aria-pressed={tool === tl.id}
                title={`${t(tl.label)} (${tl.key})`}
                aria-label={t(tl.label)}
                onClick={() => {
                  setTool(tl.id)
                  setShowMoreTools(false)
                }}
              >
                <Glyph name={tl.icon} />
              </button>
            ))}
            <span className="note small">
              {t('Drag a line, bracket, brace or callout across the board. Click to drop the corners of a polygon or a curve, then double-click or press Enter to finish.')}
            </span>
          </div>
        )}

        <div className="cluster" role="group" aria-label={t('History')}>
          <button type="button" className="icon-btn" title={`${t('Undo')} (${MOD}Z)`} aria-label={t('Undo')} disabled={!canUndo} onClick={undo}>
            <Glyph name="undo" />
          </button>
          <button type="button" className="icon-btn" title={`${t('Redo')} (${MOD}⇧Z)`} aria-label={t('Redo')} disabled={!canRedo} onClick={redo}>
            <Glyph name="redo" />
          </button>
        </div>

        <div className="cluster zoom" role="group" aria-label={t('View')}>
          <button type="button" className="icon-btn" aria-label={t('Zoom out')} title={`${t('Zoom out')} (−)`} onClick={() => zoomBy(0.8)}>
            <Glyph name="minus" />
          </button>
          <button type="button" className="zoom-readout" title={t('Reset to 100%')} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="icon-btn" aria-label={t('Zoom in')} title={`${t('Zoom in')} (+)`} onClick={() => zoomBy(1.25)}>
            <Glyph name="plus" />
          </button>
          <button type="button" className="icon-btn" aria-label={t('Fit board to window')} title={`${t('Fit to window')} (${MOD}0)`} onClick={() => setFitTick((n) => n + 1)}>
            <Glyph name="fit" />
          </button>
          <button type="button" className="icon-btn" aria-label={t('Show grid')} aria-pressed={showGrid} title={t('Show grid')} onClick={() => setShowGrid((v) => !v)}>
            <Glyph name="grid" />
          </button>
          <label className="cvd" title={t('Preview the figure the way a colourblind reader sees it. Exports are not affected.')}>
            <Glyph name="eye" size={16} />
            <select
              aria-label={t('Colourblind preview')}
              value={colorVision}
              onChange={(e) => setColorVision(e.target.value as ColorVision)}
            >
              <option value="normal">{t('Normal vision')}</option>
              <option value="deuteranopia">{t('Deuteranopia')}</option>
              <option value="protanopia">{t('Protanopia')}</option>
            </select>
          </label>
          <button type="button" className="icon-btn" aria-label={t('Snap to grid')} aria-pressed={snap} title={t('Snap to grid')} onClick={() => setSnap((v) => !v)}>
            <Glyph name="snap" />
          </button>
        </div>

        <Menu label={lang.toUpperCase()} icon={<Glyph name="globe" size={16} />} aria-label={t('Language')}>
          {LANGS.map((l) => (
            <MenuItem key={l.id} onClick={() => setLang(l.id)} hint={getLang() === l.id ? '✓' : undefined}>
              {l.name}
            </MenuItem>
          ))}
        </Menu>

        <button type="button" className="btn" onClick={() => setCreditsOpen(true)}>
          <Glyph name="credit" size={16} />
          <span>{t('Credits')}{creditCount ? ` (${creditCount})` : ''}</span>
        </button>

        <Menu label={busy ? t('Exporting…') : t('Export')} icon={<Glyph name="download" size={16} />} align="right" primary>
          <MenuItem onClick={() => void runExport('svg')} disabled={busy}>
            {t('SVG, editable vectors')}
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 1)} disabled={busy}>
            {t('PNG, 1× size')}
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 2)} disabled={busy}>
            {t('PNG, 2× (screens)')}
          </MenuItem>
          <MenuItem onClick={() => void runExport('png', 4)} disabled={busy}>
            {t('PNG, 4× (print)')}
          </MenuItem>
          <MenuItem onClick={quickPdf} disabled={busy}>
            {t('PDF, vector (print window)')}
          </MenuItem>
          <MenuItem onClick={() => void copyImage()} disabled={busy}>
            {sel.length ? t('Copy selection as image') : t('Copy figure as image')}
          </MenuItem>
          <MenuItem onClick={() => setExportOpen(true)} disabled={busy}>
            {t('More export options…')}
          </MenuItem>
        </Menu>

        <div className="cluster panel-toggles" role="group" aria-label={t('Panels')}>
          <button type="button" className="icon-btn" aria-label={t('Icon library')} aria-pressed={panel === 'left'} onClick={() => setPanel((p) => (p === 'left' ? null : 'left'))}>
            <Glyph name="panelLeft" />
          </button>
          <button type="button" className="icon-btn" aria-label={t('Properties')} aria-pressed={panel === 'right'} onClick={() => setPanel((p) => (p === 'right' ? null : 'right'))}>
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
            zoomSelTick={zoomSelTick}
            colorVision={colorVision}
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
            onRepeat={repeatSelection}
            onDelete={remove}
            onOrder={order}
            onArrange={align}
            onZoomSelection={() => setZoomSelTick((n) => n + 1)}
            onFit={() => setFitTick((n) => n + 1)}
            onSelect={selectFromLayers}
            onToggle={toggleFlag}
            onGroup={groupSel}
            onUngroup={ungroupSel}
            onScale={scaleSel}
            onRedrawStructure={redrawStructure}
            onReplaceIcon={openReplace}
          />
        </div>
      </div>

      <CreditsDialog
        doc={doc}
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        withCredits={withCredits}
        setWithCredits={setWithCredits}
        onCopied={(ok) => say(ok ? t('Credit line copied.') : t('Could not copy. Select the text and copy it by hand.'))}
      />

      <ExportDialog
        doc={doc}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        selectionIds={sel}
        withCredits={withCredits}
        setWithCredits={setWithCredits}
        busy={busy}
        onRun={(req) => void runDialogExport(req)}
      />

      <StructureDialog open={structureOpen} onClose={() => setStructureOpen(false)} onAdd={addStructure} />

      <FigureDialog
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onOpen={openFigure}
        onNew={() => {
          setGalleryOpen(false)
          void flush()
          newFigure()
        }}
        onDelete={deleteFigure}
      />

      <ChartDialog open={chartOpen} onClose={() => setChartOpen(false)} onAdd={addChart} />

      <SequenceDialog open={sequenceOpen} onClose={() => setSequenceOpen(false)} onAdd={addSequences} />

      <HistoryDialog
        open={historyOpen}
        figId={figId}
        onClose={() => setHistoryOpen(false)}
        onSnapshot={snapshot}
        onRestore={restoreVersion}
      />

      <GeneratorDialog
        open={generatorOpen !== null}
        kind={generatorOpen ?? 'plate'}
        onClose={() => setGeneratorOpen(null)}
        onInsert={insertGenerated}
      />

      <TemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onPick={applyTemplate}
        dirty={doc.items.length > 0}
      />

      <ReplaceIconDialog
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onPick={(meta) => void replaceIcon(meta.id)}
      />

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
