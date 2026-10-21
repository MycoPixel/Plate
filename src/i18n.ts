import { useSyncExternalStore } from 'react'
import { ES } from './es'
import type { IconMeta } from './types'

export type Lang = 'en' | 'es'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
]

const KEY = 'plate:lang'
const listeners = new Set<() => void>()
let iconNames: Record<string, string> = {}
let namesRequested = false

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'es') return saved
  } catch {
    /* storage can be unavailable; fall through to the browser language */
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

let lang: Lang = detect()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

/** The Spanish icon names are a separate file that only Spanish users download. */
function loadIconNames() {
  if (namesRequested) return
  namesRequested = true
  void import('./icons.es.json').then((m) => {
    iconNames = m.default as Record<string, string>
    emit()
  })
}

if (typeof document !== 'undefined') document.documentElement.lang = lang
if (lang === 'es') loadIconNames()

export const getLang = () => lang

export function setLang(next: Lang) {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* the choice just will not be remembered */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (next === 'es') loadIconNames()
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Re-renders the component whenever the language (or the loaded icon names) changes. */
export const useLang = () => {
  useSyncExternalStore(subscribe, () => version)
  return lang
}

/** Translates an English UI string. The English text is the key, so a missing translation shows English. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = lang === 'es' ? (ES[key] ?? key) : key
  return vars ? s.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? '')) : s
}

/** An icon's name in the current language. Credits always use the original name. */
export const iconLabel = (m: IconMeta) => (lang === 'es' ? (iconNames[m.id] ?? m.label) : m.label)
export const categoryLabel = (c: string) => t(c)
export const iconNameEs = (id: string) => iconNames[id]
