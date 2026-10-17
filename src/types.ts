export type Pt = { x: number; y: number }

export type IconMeta = {
  id: string
  label: string
  category: string
  file: string
  inline: boolean
  viewBox: number[]
  license: string
  licenseUrl: string
  author: string
  authorUrl: string
  source: string
}

type Flags = { hidden?: boolean; locked?: boolean; group?: string }
type Box = { x: number; y: number; w: number; h: number; rotation: number }

export type IconItem = Flags &
  Box & {
    type: 'icon'
    id: string
    iconId: string
    flipX: boolean
    opacity: number
    /** Recolouring: original colour (#rrggbb, as found in the icon) to replacement colour. */
    colors?: Record<string, string>
  }

/** A picture the user brought: an imported SVG/PNG/JPG, or a structure drawn from a SMILES string. */
export type ImageItem = Flags &
  Box & {
    type: 'image'
    id: string
    src: string
    flipX: boolean
    opacity: number
    name?: string
    smiles?: string
    /** Structure drawings only: colour the heteroatoms. */
    smilesColor?: boolean
  }

export type ShapeItem = Flags &
  Box & {
    type: 'shape'
    id: string
    shape: 'rect' | 'ellipse'
    fill: string
    stroke: string
    strokeWidth: number
    opacity: number
    radius: number
  }

export type TextItem = Flags & {
  type: 'text'
  id: string
  x: number
  y: number
  rotation: number
  text: string
  fontSize: number
  fill: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
}

export type ArrowItem = Flags & {
  type: 'arrow'
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  head: 'end' | 'both' | 'none'
  dashed: boolean
  kind: 'straight' | 'elbow' | 'curve'
  /** Curve: sideways bulge as a fraction of the length. Elbow: where the bend sits along the arrow (0 to 1). */
  bend: number
  /** Elbow only: which direction the arrow leaves its start in. */
  axis: 'h' | 'v'
}

export type Item = IconItem | ImageItem | ShapeItem | TextItem | ArrowItem

export type Doc = {
  title: string
  width: number
  height: number
  background: string
  transparent: boolean
  items: Item[]
}

export type Tool = 'select' | 'text' | 'arrow' | 'rect' | 'ellipse'
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type Rect = { x: number; y: number; w: number; h: number }
