import { useCallback, useRef, useState } from 'react'

type H<T> = { past: T[]; present: T; future: T[] }
const LIMIT = 100

/**
 * Undo/redo state.
 * - set(fn)                records a history step
 * - set(fn, false)         updates without recording (use inside drags, after checkpoint())
 * - set(fn, true, key)     steps with the same key within ~1s collapse into one (typing in a field)
 */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<H<T>>({ past: [], present: initial, future: [] })
  const last = useRef<{ key: string; t: number } | null>(null)

  const set = useCallback((fn: (d: T) => T, record = true, key?: string) => {
    let rec = record
    if (rec && key) {
      const now = Date.now()
      if (last.current && last.current.key === key && now - last.current.t < 900) rec = false
      last.current = { key, t: now }
    } else if (rec) {
      last.current = null
    }
    setH((s) => {
      const next = fn(s.present)
      if (next === s.present) return s
      return rec
        ? { past: [...s.past.slice(-LIMIT), s.present], present: next, future: [] }
        : { ...s, present: next }
    })
  }, [])

  const checkpoint = useCallback(() => {
    last.current = null
    setH((s) => ({ past: [...s.past.slice(-LIMIT), s.present], present: s.present, future: [] }))
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setH((s) =>
      s.past.length
        ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
        : s,
    )
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setH((s) =>
      s.future.length
        ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }
        : s,
    )
  }, [])

  return {
    doc: h.present,
    set,
    checkpoint,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  }
}
