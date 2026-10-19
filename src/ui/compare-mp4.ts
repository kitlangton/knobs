// The first video track of an MP4 or QuickTime file, enough for WebCodecs: its codec string and
// decoder description, and each sample's place in the file, decode and presentation times and
// whether it's a keyframe. Plain (non-fragmented) files only: screen recordings and ffmpeg's
// output. Anything else returns null and the viewer samples frames with a <video> instead.

export interface Mp4Sample {
  readonly offset: number
  readonly size: number
  /** Seconds, after the edit list: when it shows. */
  readonly pts: number
  readonly duration: number
  readonly key: boolean
}

export interface Mp4Track {
  /** A WebCodecs codec string (`avc1.64001f`, `hvc1.1.6.L93.B0`). */
  readonly codec: string
  readonly description: Uint8Array | undefined
  readonly width: number
  readonly height: number
  /** In decode order. */
  readonly samples: readonly Mp4Sample[]
}

interface Box {
  readonly type: string
  /** Payload start and end. */
  readonly start: number
  readonly end: number
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"])

function boxes(v: DataView, start: number, end: number): Box[] {
  const out: Box[] = []
  let at = start
  while (at + 8 <= end) {
    let size = v.getUint32(at)
    const type = String.fromCharCode(
      v.getUint8(at + 4),
      v.getUint8(at + 5),
      v.getUint8(at + 6),
      v.getUint8(at + 7),
    )
    let header = 8
    if (size === 1) {
      size = Number(v.getBigUint64(at + 8))
      header = 16
    } else if (size === 0) size = end - at
    if (size < header || at + size > end) break
    out.push({ type, start: at + header, end: at + size })
    at += size
  }
  return out
}

const child = (v: DataView, b: Box, type: string) =>
  boxes(v, b.start, b.end).find((c) => c.type === type)

const hex = (n: number) => n.toString(16).padStart(2, "0")

function avcCodec(c: Uint8Array) {
  return `avc1.${hex(c[1]!)}${hex(c[2]!)}${hex(c[3]!)}`
}

function hevcCodec(type: string, c: Uint8Array) {
  const space = ["", "A", "B", "C"][c[1]! >> 6]
  const tier = (c[1]! >> 5) & 1 ? "H" : "L"
  const profile = c[1]! & 31
  let compat = ((c[2]! << 24) | (c[3]! << 16) | (c[4]! << 8) | c[5]!) >>> 0
  let reversed = 0
  for (let i = 0; i < 32; i++) {
    reversed = ((reversed << 1) | (compat & 1)) >>> 0
    compat >>>= 1
  }
  const constraints = [...c.subarray(6, 12)]
  while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop()
  const tail = constraints.map((b) => b.toString(16).toUpperCase()).join(".")
  return `${type}.${space}${profile}.${reversed.toString(16).toUpperCase()}.${tier}${c[12]}${tail ? `.${tail}` : ""}`
}

/** Parses `buf` (a whole file); null when it isn't a plain MP4 with a video track it knows. */
export function demuxMp4(buf: ArrayBuffer): Mp4Track | null {
  try {
    return parse(new DataView(buf), new Uint8Array(buf))
  } catch {
    return null
  }
}

function parse(v: DataView, bytes: Uint8Array): Mp4Track | null {
  const top = boxes(v, 0, v.byteLength)
  const moov = top.find((b) => b.type === "moov")
  if (!moov) return null
  const mvhd = child(v, moov, "mvhd")
  const movieScale = mvhd ? v.getUint32(mvhd.start + (v.getUint8(mvhd.start) === 1 ? 20 : 12)) : 1
  for (const trak of boxes(v, moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(v, trak, "mdia")
    const hdlr = mdia && child(v, mdia, "hdlr")
    if (!mdia || !hdlr) continue
    const handler = String.fromCharCode(...bytes.subarray(hdlr.start + 8, hdlr.start + 12))
    if (handler !== "vide") continue
    const mdhd = child(v, mdia, "mdhd")!
    const scale = v.getUint32(mdhd.start + (v.getUint8(mdhd.start) === 1 ? 20 : 12))
    const minf = child(v, mdia, "minf")
    const st = minf && child(v, minf, "stbl")
    if (!st) return null
    const stsd = child(v, st, "stsd")!
    const entry = boxes(v, stsd.start + 8, stsd.end)[0]
    if (!entry) return null
    const width = v.getUint16(entry.start + 24)
    const height = v.getUint16(entry.start + 26)
    const configs = boxes(v, entry.start + 78, entry.end)
    let codec: string
    let config: Box | undefined
    if (entry.type === "avc1" || entry.type === "avc3") {
      config = configs.find((c) => c.type === "avcC")
      if (!config) return null
      codec = avcCodec(bytes.subarray(config.start, config.end))
    } else if (entry.type === "hvc1" || entry.type === "hev1") {
      config = configs.find((c) => c.type === "hvcC")
      if (!config) return null
      codec = hevcCodec(entry.type, bytes.subarray(config.start, config.end))
    } else return null
    const description = bytes.slice(config.start, config.end)

    // Sample tables.
    const table = (type: string) => child(v, st, type)
    const stts = table("stts")!
    const deltas: number[] = []
    for (let i = 0, n = v.getUint32(stts.start + 4); i < n; i++) {
      const count = v.getUint32(stts.start + 8 + i * 8)
      const delta = v.getUint32(stts.start + 12 + i * 8)
      for (let k = 0; k < count; k++) deltas.push(delta)
    }
    const count = deltas.length
    const offsetsCt = new Array<number>(count).fill(0)
    const ctts = table("ctts")
    if (ctts) {
      const signed = v.getUint8(ctts.start) === 1
      let s = 0
      for (let i = 0, n = v.getUint32(ctts.start + 4); i < n; i++) {
        const c = v.getUint32(ctts.start + 8 + i * 8)
        const o = signed
          ? v.getInt32(ctts.start + 12 + i * 8)
          : v.getUint32(ctts.start + 12 + i * 8)
        for (let k = 0; k < c && s < count; k++) offsetsCt[s++] = o
      }
    }
    const stsz = table("stsz")!
    const fixed = v.getUint32(stsz.start + 4)
    const sizes = Array.from(
      { length: count },
      (_, i) => fixed || v.getUint32(stsz.start + 12 + i * 4),
    )
    const stco = table("stco")
    const co64 = table("co64")
    const chunkOffsets: number[] = []
    if (stco)
      for (let i = 0, n = v.getUint32(stco.start + 4); i < n; i++)
        chunkOffsets.push(v.getUint32(stco.start + 8 + i * 4))
    else if (co64)
      for (let i = 0, n = v.getUint32(co64.start + 4); i < n; i++)
        chunkOffsets.push(Number(v.getBigUint64(co64.start + 8 + i * 8)))
    else return null
    const stsc = table("stsc")!
    const runs: { first: number; per: number }[] = []
    for (let i = 0, n = v.getUint32(stsc.start + 4); i < n; i++)
      runs.push({
        first: v.getUint32(stsc.start + 8 + i * 12),
        per: v.getUint32(stsc.start + 12 + i * 12),
      })
    const offsets: number[] = []
    for (let r = 0; r < runs.length && offsets.length < count; r++) {
      const last = r + 1 < runs.length ? runs[r + 1]!.first - 1 : chunkOffsets.length
      for (let chunk = runs[r]!.first; chunk <= last && offsets.length < count; chunk++) {
        let at = chunkOffsets[chunk - 1]!
        for (let k = 0; k < runs[r]!.per && offsets.length < count; k++) {
          offsets.push(at)
          at += sizes[offsets.length - 1]!
        }
      }
    }
    const stss = table("stss")
    const keys = new Set<number>()
    if (stss)
      for (let i = 0, n = v.getUint32(stss.start + 4); i < n; i++)
        keys.add(v.getUint32(stss.start + 8 + i * 4) - 1)

    // The edit list: a leading empty edit delays the track; the first media edit skips into it.
    let shift = 0
    const edts = child(v, trak, "edts")
    const elst = edts && child(v, edts, "elst")
    if (elst) {
      const v1 = v.getUint8(elst.start) === 1
      const n = v.getUint32(elst.start + 4)
      let at = elst.start + 8
      for (let i = 0; i < n; i++) {
        const dur = v1 ? Number(v.getBigUint64(at)) : v.getUint32(at)
        const media = v1 ? Number(v.getBigInt64(at + 8)) : v.getInt32(at + 4)
        at += v1 ? 20 : 12
        if (media === -1) shift += dur / movieScale
        else {
          shift -= media / scale
          break
        }
      }
    }

    const samples: Mp4Sample[] = []
    let dts = 0
    for (let i = 0; i < count; i++) {
      samples.push({
        offset: offsets[i]!,
        size: sizes[i]!,
        pts: (dts + offsetsCt[i]!) / scale + shift,
        duration: deltas[i]! / scale,
        key: stss ? keys.has(i) : true,
      })
      dts += deltas[i]!
    }
    if (samples.some((s) => s.offset + s.size > bytes.byteLength)) return null
    return { codec, description, width, height, samples }
  }
  return null
}

/**
 * The runs to decode for some frames: for each keyframe group (decode order, from a keyframe to
 * the next) holding a wanted presentation index, its sample range. `frameOf` maps a sample's
 * time to the frame it is.
 */
export function decodeRuns(
  samples: readonly Mp4Sample[],
  wanted: ReadonlySet<number>,
  frameOf: (pts: number) => number,
): { from: number; to: number; frames: number[] }[] {
  const out: { from: number; to: number; frames: number[] }[] = []
  let start = 0
  for (let i = 1; i <= samples.length; i++) {
    if (i < samples.length && !samples[i]!.key) continue
    const frames: number[] = []
    for (let k = start; k < i; k++) {
      const f = frameOf(samples[k]!.pts)
      if (wanted.has(f)) frames.push(f)
    }
    if (frames.length) out.push({ from: start, to: i, frames: frames.sort((a, b) => a - b) })
    start = i
  }
  return out
}
