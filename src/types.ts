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
  /** Collection the artwork was published in (NIH BioArt Source only). */
  collection?: string
  /** Submission date as the collection lists it, e.g. 10/7/2024 (NIH BioArt Source only). */
  date?: string
  /** DOI the collection links to, for the entries that have one. */
  doi?: string
  /** Where the drawing was found, when that is not the author to credit. */
  via?: string
  /** Extra words to search, when the source ships its own keywords. */
  tags?: string[]
}

export type FontId = 'sans' | 'serif' | 'mono'

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
    /** Credit for a picture the user brought: what ends up in the credit line. */
    author?: string
    license?: string
    source?: string
  }

export type ShapeKind = 'rect' | 'ellipse' | 'bracket' | 'brace' | 'callout' | 'poly' | 'path'

export type ShapeItem = Flags &
  Box & {
    type: 'shape'
    id: string
    shape: ShapeKind
    fill: string
    stroke: string
    strokeWidth: number
    opacity: number
    radius: number
    /** bracket, brace and callout: which way it faces. */
    flipX?: boolean
    /** poly and path: corners as fractions of the box, so resizing and rotating carry them along. */
    points?: [number, number][]
    /** path only: a smooth curve through the points rather than straight segments. */
    smooth?: boolean
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
  /** Missing means sans-serif (Arial), so older figures keep working. */
  font?: FontId
  /** A legend is written for you from the markers on the board, so its text is not yours to edit. */
  legend?: boolean
}

/** Where one end of an arrow is attached: an item on the board, and optionally a fixed side of it. */
export type Anchor = { id: string; side?: 'n' | 'e' | 's' | 'w' }

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
  /**
   * Attached ends. The end then follows the item (x1/y1 or x2/y2 are kept up to date with it, so
   * everything that only reads coordinates, such as export, keeps working). No side means automatic.
   */
  from?: Anchor
  to?: Anchor
}

/**
 * A membrane: one library icon (a lipid) repeated along a straight or curved line, as a bilayer or a
 * single layer. The lipids are worked out from these settings, so the membrane stays editable.
 */
export type MembraneItem = Flags & {
  type: 'membrane'
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  /** Sideways bulge as a fraction of the length, as for a curved arrow. 0 is a straight line. */
  bend: number
  iconId: string
  /** Width of one lipid, along the membrane. Its height follows the icon's proportions. */
  size: number
  layers: 1 | 2
  /** Bilayer: room left between the tails of the two layers. */
  gap: number
  /** Distance between lipids as a multiple of their width. */
  spacing: number
  /** 0 to 1: how much each lipid's position, angle and size varies. */
  jitter: number
  /** Seed of that variation, so the membrane looks the same every time it is drawn. */
  seed: number
  opacity: number
  /** Single layer: put the heads on the other side. */
  flip: boolean
  colors?: Record<string, string>
}

export type ChartKind = 'bar' | 'line' | 'scatter'

export type ChartSeries = {
  name: string
  color: string
  /** One value per category. */
  values: number[]
  /** Optional error bars, same length as values. */
  errors?: number[]
}

export type ChartItem = Flags &
  Box & {
    type: 'chart'
    id: string
    opacity: number
    title: string
    yLabel: string
    xLabel: string
    /** Category names under the bars or along the x axis. */
    xNames: string[]
    series: ChartSeries[]
    kind: ChartKind
    /** Optional fixed top of the y axis; 0 or missing means fit the data. */
    yMax: number
    showGrid: boolean
  }

export type Item = IconItem | ImageItem | ShapeItem | TextItem | ArrowItem | MembraneItem | MarkerItem | ChartItem

/**
 * A numbered marker on the figure, for a caption that refers back to "1", "2", "3". The number is
 * not stored: it follows the marker's place in reading order, so the legend always matches.
 */
export type MarkerItem = Flags & {
  type: 'marker'
  id: string
  x: number
  y: number
  /** Diameter of the circle. */
  size: number
  /** What this marker points at. The legend is built from these. */
  label: string
  fill: string
  stroke: string
  strokeWidth: number
  textFill: string
  fontSize: number
}

export type Doc = {
  title: string
  width: number
  height: number
  background: string
  transparent: boolean
  items: Item[]
}

/** View-only colour filters, for checking a figure the way a colourblind reader sees it. */
export type ColorVision = 'normal' | 'deuteranopia' | 'protanopia'

export type Tool =
  | 'select'
  | 'text'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'membrane'
  | 'line'
  | 'bracket'
  | 'brace'
  | 'callout'
  | 'poly'
  | 'path'
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type Rect = { x: number; y: number; w: number; h: number }
