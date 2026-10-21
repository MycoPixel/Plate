import { sanitizeDoc } from './project'
import type { Doc } from './types'

const PREFIX = '#fig='
/** Links longer than this are awkward to paste and may be cut by chat apps. */
const LIMIT = 1_500_000

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64url = (value: string) => {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Deflates bytes when the browser can; returns null when it cannot. */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof CompressionStream !== 'function') return null
  try {
    const stream = new CompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    void writer.write(bytes)
    void writer.close()
    return new Uint8Array(await new Response(stream.readable).arrayBuffer())
  } catch {
    return null
  }
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function') return null
  try {
    const stream = new DecompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    void writer.write(bytes)
    void writer.close()
    return new Uint8Array(await new Response(stream.readable).arrayBuffer())
  } catch {
    return null
  }
}

/**
 * The figure as a URL fragment. The document is JSON, deflated when possible, then base64url.
 * A leading "z" marks a deflated body and "r" a plain one, so an older link still opens.
 */
export async function encodeShare(doc: Doc): Promise<string | null> {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, doc }))
  const packed = await deflate(json)
  const body = b64url(packed ?? json)
  if (body.length > LIMIT) return null
  return `${PREFIX}${packed ? 'z' : 'r'}${body}`
}

/** Reads a figure from a location hash. Anything malformed, or a different version, is ignored. */
export async function decodeShare(hash: string): Promise<Doc | null> {
  if (!hash.startsWith(PREFIX) || hash.length < PREFIX.length + 2) return null
  const flag = hash[PREFIX.length]
  const body = hash.slice(PREFIX.length + 1)
  try {
    const bytes = fromB64url(body)
    const json = flag === 'z' ? await inflate(bytes) : flag === 'r' ? bytes : null
    if (!json) return null
    const parsed: unknown = JSON.parse(new TextDecoder().decode(json))
    if (typeof parsed !== 'object' || parsed === null) return null
    const holder = parsed as { v?: unknown; doc?: unknown }
    if (holder.v !== 1) return null
    return sanitizeDoc(holder.doc)
  } catch {
    return null
  }
}
