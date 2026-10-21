export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** True when the user is typing into a field, so single-key shortcuts must stay out of the way. */
export function isTextEntry(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable
}

/** Same, plus buttons: Space must keep activating a focused button instead of starting a pan. */
export function isFormTarget(t: EventTarget | null) {
  return isTextEntry(t) || (t instanceof HTMLElement && ['BUTTON', 'SUMMARY'].includes(t.tagName))
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Keeps colours to plain hex (or "none"), so a url(...) value cannot make the board fetch anything. */
export const isColor = (c: string) => c === 'none' || /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)
