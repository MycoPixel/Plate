import { newText } from './defaults'
import { measureText } from './geometry'
import type { Doc, Item } from './types'

export type FastaRecord = { name: string; seq: string }

export type SequenceOptions = {
  /** Characters per line; long sequences wrap at this width. */
  lineLength: number
  /** Put the FASTA header above each sequence. */
  headers: boolean
  fontSize: number
}

/** Reads one or more FASTA records. Text without a ">" line is taken as a single sequence. */
export function parseFasta(text: string): FastaRecord[] {
  const out: FastaRecord[] = []
  let name = ''
  let seq = ''
  const flush = () => {
    const clean = seq.replace(/\s+/g, '')
    if (clean) out.push({ name, seq: clean })
    name = ''
    seq = ''
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('>')) {
      flush()
      name = trimmed.slice(1).trim()
    } else if (trimmed) {
      seq += trimmed
    }
  }
  flush()
  return out
}

const wrap = (seq: string, n: number) => {
  const size = Math.max(10, Math.min(200, Math.round(n)))
  const lines: string[] = []
  for (let i = 0; i < seq.length; i += size) lines.push(seq.slice(i, i + size))
  return lines.join('\n')
}

/** Turns FASTA records into monospace text on the board, one block per sequence. */
export function sequenceItems(records: FastaRecord[], { lineLength, headers, fontSize }: SequenceOptions, doc: Doc): Item[] {
  const size = Math.max(6, Math.min(96, Math.round(fontSize)))
  const blocks = records.map((r) => ({
    header: headers && r.name ? `> ${r.name}` : '',
    body: wrap(r.seq, lineLength),
  }))
  const measure = (text: string, bold = false) =>
    measureText({ text, fontSize: bold ? size + 2 : size, bold, italic: false, font: 'mono' }, true).w
  const maxW = Math.max(...blocks.map((b) => Math.max(measure(b.body), b.header ? measure(b.header, true) : 0)), 100)
  const x = Math.max(24, (doc.width - maxW) / 2)
  let y = 48
  const out: Item[] = []
  const mono = (at: number, text: string, bold = false) => {
    const item = newText({ x, y: at }, text, bold ? size + 2 : size)
    item.font = 'mono'
    item.bold = bold
    return item
  }
  for (const b of blocks) {
    if (b.header) {
      out.push(mono(y, b.header, true))
      y += (size + 2) * 1.6
    }
    const body = mono(y, b.body)
    out.push(body)
    y += body.text.split('\n').length * size * 1.2 + 24
  }
  return out
}

export const residueCount = (records: FastaRecord[]) => records.reduce((n, r) => n + r.seq.length, 0)
