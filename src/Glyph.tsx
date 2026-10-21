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
  membrane: (
    <>
      <circle cx="5.5" cy="5.5" r="1.8" />
      <circle cx="12" cy="5.5" r="1.8" />
      <circle cx="18.5" cy="5.5" r="1.8" />
      <path d="M5.5 7.5v4M12 7.5v4M18.5 7.5v4M5.5 16.5v-4M12 16.5v-4M18.5 16.5v-4" />
      <circle cx="5.5" cy="18.5" r="1.8" />
      <circle cx="12" cy="18.5" r="1.8" />
      <circle cx="18.5" cy="18.5" r="1.8" />
    </>
  ),
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
  group: (
    <>
      <rect x="4" y="4" width="9" height="9" rx="1" />
      <rect x="11" y="11" width="9" height="9" rx="1" />
      <path d="M2.5 2.5h19v19h-19z" strokeDasharray="2 3" />
    </>
  ),
  ungroup: (
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1" />
    </>
  ),
  kindStraight: <path d="M5 19L19 5" />,
  kindElbow: <path d="M4 18h8V6h8" />,
  kindCurve: <path d="M4 19C4 9 10 5 20 5" />,
  structure: <path d="M12 3l7 4v8l-7 4-7-4V7zM12 3v8M5 7l7 4 7-4" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5L20 16" />
    </>
  ),
  insert: <path d="M12 5v14M5 12h14" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5z" />
    </>
  ),
  credit: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.5a3 3 0 100 5" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </>
  ),
  distH: (
    <>
      <path d="M4 4v16M20 4v16" />
      <rect x="10" y="9" width="4" height="6" rx="1" />
    </>
  ),
  distV: (
    <>
      <path d="M4 4h16M4 20h16" />
      <rect x="9" y="10" width="6" height="4" rx="1" />
    </>
  ),
  boardL: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M7 8v8" />
      <rect x="9" y="9.5" width="7" height="5" rx="1" />
    </>
  ),
  boardC: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M12 7v10" />
      <rect x="8.5" y="9" width="7" height="6" rx="1" />
    </>
  ),
  boardR: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M17 8v8" />
      <rect x="8" y="9.5" width="7" height="5" rx="1" />
    </>
  ),
  boardT: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M8 7h8" />
      <rect x="9.5" y="9" width="5" height="7" rx="1" />
    </>
  ),
  boardM: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M7 12h10" />
      <rect x="9" y="8.5" width="6" height="7" rx="1" />
    </>
  ),
  boardB: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M8 17h8" />
      <rect x="9.5" y="8" width="5" height="7" rx="1" />
    </>
  ),
  zoomSel: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <circle cx="14" cy="11" r="3.4" />
      <path d="M16.6 13.6L20 17" />
    </>
  ),
  line: <path d="M4.5 19.5L19.5 4.5" />,
  bracket: <path d="M10 4H6.5v16H10M6.5 12H4" />,
  brace: <path d="M10 4H7c-1.5 2.5-1.5 4 0 8-1.5 4-1.5 5.5 0 8h3" />,
  callout: (
    <>
      <path d="M4 5.5h16v10H10l-4.5 4v-4H4z" />
    </>
  ),
  poly: <path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10z" />,
  path: <path d="M3.5 18c4.5 0 5-12 8.5-12s4 12 8.5 12" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 100 18h1.5a2 2 0 001.3-3.5c-.8-.7-.3-1.9.8-1.9H18a3 3 0 003-3A9 9 0 0012 3z" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  eyedropper: (
    <>
      <path d="M14.5 4.5l5 5M13 6l5 5M4 20l1.2-4.2L14 7l3 3-8.8 8.8z" />
    </>
  ),
  ruler: (
    <>
      <path d="M3 17L17 3l4 4L7 21z" />
      <path d="M7 15l2 2M10 12l2 2M13 9l2 2" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
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
