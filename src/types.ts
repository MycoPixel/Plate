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

type Flags = { hidden?: boolean; locked?: boolean }
type Box = { x: number; y: number; w: number; h: number; rotation: number }

export type IconItem = Flags &
  Box & { type: 'icon'; id: string; iconId: string; flipX: boolean; opacity: number }

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
}

export type Item = IconItem | ShapeItem | TextItem | ArrowItem

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
