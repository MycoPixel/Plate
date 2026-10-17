import type { ReactNode } from 'react'

const eye = (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>
)

const PATHS = {
  select: <path d="M5 3l14 7.5-6.2 1.8L10.5 19z" />,
  text: <path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />,
  arrow: <path d="M5 19L19 5M9 5h10v10" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h9.5a6 6 0 010 12H11" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9h-9.5a6 6 0 000 12H13" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5.5A1.5 1.5 0 0013.5 4h-8A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15H9" />
    </>
  ),
  flip: (
    <>
      <path d="M12 3v18" />
      <path d="M8 7L3 12l5 5z" />
      <path d="M16 7l5 5-5 5z" />
    </>
  ),
  front: (
    <>
      <rect x="3.5" y="3.5" width="11" height="11" rx="1" />
      <rect x="9.5" y="9.5" width="11" height="11" rx="1" fill="currentColor" />
    </>
  ),
  back: (
    <>
      <rect x="3.5" y="3.5" width="11" height="11" rx="1" fill="currentColor" />
      <rect x="9.5" y="9.5" width="11" height="11" rx="1" />
    </>
  ),
  forward: <path d="M12 19V5M6 11l6-6 6 6" />,
  backward: <path d="M12 5v14M6 13l6 6 6-6" />,
  eye,
  eyeOff: (
    <>
      {eye}
      <path d="M4 4l16 16" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </>
  ),
  grid: <path d="M4 4h16v16H4zM4 12h16M12 4v16" />,
  snap: <path d="M5 4v7a7 7 0 0014 0V4M5 8h4M15 8h4" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  folder: <path d="M3 7a1 1 0 011-1h5l2 2h8a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1z" />,
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  panelLeft: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  alignL: (
    <>
      <path d="M4 3v18" />
      <rect x="7" y="6" width="12" height="4" rx="1" />
      <rect x="7" y="14" width="7" height="4" rx="1" />
    </>
  ),
  alignC: (
    <>
      <path d="M12 3v18" />
      <rect x="5" y="6" width="14" height="4" rx="1" />
      <rect x="8" y="14" width="8" height="4" rx="1" />
    </>
  ),
  alignR: (
    <>
      <path d="M20 3v18" />
      <rect x="5" y="6" width="12" height="4" rx="1" />
      <rect x="10" y="14" width="7" height="4" rx="1" />
    </>
  ),
  alignT: (
    <>
      <path d="M3 4h18" />
      <rect x="6" y="7" width="4" height="12" rx="1" />
      <rect x="14" y="7" width="4" height="7" rx="1" />
    </>
  ),
  alignM: (
    <>
      <path d="M3 12h18" />
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="8" width="4" height="8" rx="1" />
    </>
  ),
  alignB: (
    <>
      <path d="M3 20h18" />
      <rect x="6" y="5" width="4" height="12" rx="1" />
      <rect x="14" y="10" width="4" height="7" rx="1" />
    </>
  ),
  bold: <path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />,
  italic: <path d="M10 5h8M6 19h8M14 5l-4 14" />,
  textLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  textCenter: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  textRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  dashed: <path d="M3 12h4M10 12h4M17 12h4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  credit: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.5a3 3 0 100 5" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type GlyphName = keyof typeof PATHS

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
