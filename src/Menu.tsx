import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function Menu({
  label,
  icon,
  children,
  align = 'left',
  primary = false,
  'aria-label': ariaLabel,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  primary?: boolean
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={primary ? 'btn btn-primary' : 'btn'}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span>{label}</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu" data-align={align} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
  hint,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  hint?: string
  disabled?: boolean
}) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  )
}
