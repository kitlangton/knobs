// Decoded frames kept as ImageBitmaps, so a drag or a step shows a frame at once while the
// <video> seeks (raw screen recordings can have one keyframe in 18 s, and a seek decodes from it).
// One cache per source and frame rate, shared by every viewer and strip on the page:
// - a grid of small frames across the whole video (the strip's thumbnails, a drag's preview),
// - full-size frames around the playhead of the viewer last used (instant steps),
// - frames the viewer already showed exactly, and frames the strip asks for,
// - and, once those are in, every frame as a small JPEG (a scrub proxy, within a byte budget), so
//   a drag shows the frame under the hand: the one asked for decodes in a few ms, with the next
//   one the hand is heading for, and a handful stay decoded.
// Frames are decoded with WebCodecs where the file demuxes (compare-mp4.ts), else by a hidden
// <video> of its own: a fast play-through for the grid, a seek and a play for the frames around
// the playhead. One decode runs at a time across the page, for caches whose viewer is on screen,
// the active one first, and a cache whose viewers have all gone frees everything.
import { frameOf } from "./compare-model.js"
import { decodeRuns, demuxMp4, type Mp4Track } from "./compare-mp4.js"

export interface CachedFrame {
  readonly frame: number
  readonly bitmap: ImageBitmap
  /** Full size (else a small grid frame). */
  readonly full: boolean
}

export interface FramePoint {
  readonly frame: number
  /** Any cached frame this close (frames) will do. */
  readonly tolerance: number
}

export interface FrameCache {
  readonly src: string
  /** How it decodes, once it knows. */
  readonly backend: "webcodecs" | "video" | "pending"
  /** Frames held now. */
  readonly size: number
  /** Scrub proxies held now, and every how many frames they are. */
  readonly proxies: { readonly count: number; readonly stride: number; readonly bytes: number }
  /**
   * The cached frame nearest `frame`, no further than `within` frames. `decode`: a nearer scrub
   * proxy that's stored but not decoded starts decoding (listeners hear when it's in).
   */
  nearest(frame: number, within?: number, decode?: boolean): CachedFrame | null
  /** Whether a frame this close to `frame` is held, decoded or as a proxy (within its stride). */
  covers(frame: number): boolean
  /** The playhead of the viewer being used: full-size frames around it decode first. */
  focus(frame: number): void
  /** The playhead of a viewer being scrubbed: this cache goes first, nothing full-size is asked. */
  follow(frame: number): void
  /** Frames a strip shows (small, with a tolerance each). */
  want(points: readonly FramePoint[]): void
  /** A frame the viewer has decoded exactly (paused on it). */
  keep(frame: number, source: CanvasImageSource, width: number, height: number): void
  /** Whether a viewer of it is near the screen: only then does it decode. */
  visible(on: boolean): void
  /** New frames arrived. */
  listen(f: () => void): () => void
  release(): void
}

/** Frames either side of the focus decoded at full size. */
export const FOCUS_RADIUS = 6
const GRID = 48
const SEEN = 12
const WANTED = 48
const PREVIEW = 384
const FULL = 1280
/** A scrub proxy's longest side, JPEG quality, the bytes a source's proxies may hold, how many stay decoded. */
export const PROXY = {
  size: 960,
  quality: 0.8,
  budget: 48 * 2 ** 20,
  decoded: 8,
  /** Proxies a unit makes before another cache takes its turn. */
  turn: 90,
} as const

/** The stride a set of proxies needs to stay in `budget`: the smallest power of two that does. */
export function proxyStride(bytes: number, count: number, total: number, budget: number): number {
  if (count <= 0 || total <= 0) return 1
  const each = bytes / count
  let stride = 1
  while ((total / stride) * each > budget && stride < total) stride *= 2
  return stride
}

/** Where a hand moving from `last` to `frame` is likely to be next (within 0 and `total`). */
export const aheadOf = (frame: number, last: number | null, total: number) =>
  last === null || last === frame
    ? null
    : Math.min(Math.max(0, total - 1), Math.max(0, frame + (frame - last)))

/** The grid's frames: `count` evenly across `total`, as points with half a step's tolerance. */
export function gridPoints(total: number, count = GRID): FramePoint[] {
  if (total <= 0) return []
  const n = Math.min(count, total)
  const step = total / n
  return Array.from({ length: n }, (_, i) => ({
    frame: Math.min(total - 1, Math.round(i * step + step / 2 - 0.5)),
    tolerance: Math.max(0, Math.floor(step / 2)),
  }))
}

/** The full-size frames wanted around `focus`, nearest first. */
export function focusWindow(focus: number, total: number, radius = FOCUS_RADIUS): number[] {
  const out: number[] = []
  for (let d = 0; d <= radius; d++)
    for (const f of d === 0 ? [focus] : [focus + d, focus - d]) if (f >= 0 && f < total) out.push(f)
  return out
}

/** The key in `keys` nearest `frame` within `within` (ties go to the later frame). */
export function nearestKey(
  keys: Iterable<number>,
  frame: number,
  within = Infinity,
): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (const k of keys) {
    const d = Math.abs(k - frame)
    if (d < bestD || (d === bestD && best !== null && k > best)) {
      best = k
      bestD = d
    }
  }
  return best !== null && bestD <= within ? best : null
}

interface Entry {
  readonly bitmap: ImageBitmap
  readonly full: boolean
  used: number
  readonly kind: "focus" | "seen" | "grid" | "want"
}

interface Core {
  readonly key: string
  readonly cache: FrameCache
  refs: number
  shown: number
  active: boolean
  /** When it last ran a unit (the pump's turn). */
  ran: number
  /** One unit of decoding, or null when there's nothing to do. */
  work(): Promise<void> | null
  dropFull(): void
  dispose(): void
}

const cores = new Map<string, Core>()
/** The caches of the viewer used last: every one it asked for in the same task (both its sides). */
let actives = new Set<Core>()
let round: Set<Core> | null = null
let running = false
let turns = 0

/** `core` is in use: it and the others asked for in this task go first; the rest drop full frames. */
function claim(core: Core) {
  if (!round) {
    const r = new Set<Core>()
    round = r
    queueMicrotask(() => {
      for (const c of actives)
        if (!r.has(c)) {
          c.active = false
          c.dropFull()
        }
      actives = r
      round = null
    })
  }
  round.add(core)
  actives.add(core)
  core.active = true
}

/** The page's one decode loop: a unit at a time, the active cache first, idle between units. */
function pump(win: Window) {
  if (running) return
  running = true
  void (async () => {
    try {
      for (;;) {
        // Active caches first, taking turns (a compare's two sides fill together).
        const order = [...cores.values()]
          .filter((c) => c.shown > 0 || c.active)
          .sort((a, b) => Number(b.active) - Number(a.active) || a.ran - b.ran)
        let unit: Promise<void> | null = null
        for (const c of order) {
          unit = c.work()
          if (unit) {
            c.ran = ++turns
            break
          }
        }
        if (!unit) break
        await unit.catch(() => {})
        await idle(win)
      }
    } finally {
      running = false
    }
  })()
}

const idle = (win: Window) =>
  new Promise<void>((done) => {
    const ric = (win as { requestIdleCallback?: (f: () => void, o?: object) => number })
      .requestIdleCallback
    if (ric) ric(() => done(), { timeout: 60 })
    else win.setTimeout(done, 4)
  })

const sleep = (win: Window, ms: number) => new Promise<void>((done) => win.setTimeout(done, ms))

async function toBitmap(
  doc: Document,
  source: CanvasImageSource,
  w: number,
  h: number,
  cap: number,
): Promise<ImageBitmap> {
  const k = Math.min(1, cap / Math.max(w, h, 1))
  const rw = Math.max(1, Math.round(w * k))
  const rh = Math.max(1, Math.round(h * k))
  try {
    return await createImageBitmap(source as ImageBitmapSource, {
      resizeWidth: rw,
      resizeHeight: rh,
      resizeQuality: "medium",
    })
  } catch {
    const c = doc.createElement("canvas")
    c.width = rw
    c.height = rh
    c.getContext("2d")!.drawImage(source, 0, 0, rw, rh)
    return createImageBitmap(c)
  }
}

// JPEGs are encoded off the main thread where it can (a page's canvas encodes in its idle time,
// slowly, and never while something animates): two workers made from a blob URL, shared by every
// cache; a page whose policy forbids them encodes on the main thread.
const ENCODER = `onmessage=async(e)=>{const{id,bitmap,quality}=e.data;try{const c=new OffscreenCanvas(bitmap.width,bitmap.height);c.getContext("2d").drawImage(bitmap,0,0);bitmap.close();postMessage({id,blob:await c.convertToBlob({type:"image/jpeg",quality})})}catch(err){postMessage({id,error:String(err)})}}`
interface Encoders {
  readonly workers: Worker[]
  readonly waiting: Map<number, { done(b: Blob): void; fail(e: unknown): void }>
  next: number
}
let encoders: Encoders | null | undefined

function encodersOf(win: Window): Encoders | null {
  if (encoders !== undefined) return encoders
  encoders = null
  const W = (win as { Worker?: typeof Worker }).Worker
  if (!W || !("OffscreenCanvas" in win)) return null
  try {
    const url = URL.createObjectURL(new Blob([ENCODER], { type: "text/javascript" }))
    const waiting: Encoders["waiting"] = new Map()
    const workers = [new W(url), new W(url)]
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
        const job = waiting.get(e.data.id)
        waiting.delete(e.data.id)
        if (e.data.blob) job?.done(e.data.blob)
        else job?.fail(new Error(e.data.error))
      }
      // Refused (a CSP without blob: workers): the main thread encodes from here on.
      w.onerror = () => {
        encoders = null
        for (const j of waiting.values()) j.fail(new Error("encoder"))
        waiting.clear()
      }
    }
    encoders = { workers, waiting, next: 0 }
  } catch {
    encoders = null
  }
  return encoders
}

/** A frame as a small JPEG: a scrub proxy. */
async function toProxy(doc: Document, source: CanvasImageSource, w: number, h: number) {
  const bm = await toBitmap(doc, source, w, h, PROXY.size)
  const pool = encodersOf(doc.defaultView!)
  if (pool) {
    const id = pool.next++
    const worker = pool.workers[id % pool.workers.length]!
    return new Promise<Blob>((done, fail) => {
      pool.waiting.set(id, { done, fail })
      worker.postMessage({ id, bitmap: bm, quality: PROXY.quality }, [bm])
    })
  }
  try {
    const Off = (doc.defaultView as { OffscreenCanvas?: typeof OffscreenCanvas } | null)
      ?.OffscreenCanvas
    if (Off) {
      const c = new Off(bm.width, bm.height)
      c.getContext("2d")!.drawImage(bm, 0, 0)
      return await c.convertToBlob({ type: "image/jpeg", quality: PROXY.quality })
    }
    const c = doc.createElement("canvas")
    c.width = bm.width
    c.height = bm.height
    c.getContext("2d")!.drawImage(bm, 0, 0)
    return await new Promise<Blob>((done, fail) =>
      c.toBlob((b) => (b ? done(b) : fail(new Error("toBlob"))), "image/jpeg", PROXY.quality),
    )
  } finally {
    bm.close()
  }
}

/** The shared cache for `src` at `fps`; `release()` it when done. */
export function acquireFrames(doc: Document, src: string, fps: number): FrameCache {
  const key = `${fps}|${src}`
  let core = cores.get(key)
  if (!core) {
    core = makeCore(doc, key, src, fps)
    cores.set(key, core)
  }
  core.refs++
  return core.cache
}

function makeCore(doc: Document, key: string, src: string, fps: number): Core {
  const win = doc.defaultView!
  const entries = new Map<number, Entry>()
  const listeners = new Set<() => void>()
  let total = 0
  let focusAt: number | null = null
  let wants: readonly FramePoint[] = []
  let backend: FrameCache["backend"] = "pending"
  let track: Mp4Track | null = null
  let buf: Uint8Array | null = null
  let sampler: HTMLVideoElement | null = null
  let started = false
  let disposed = false
  let generation = 0
  let tick = 0
  let notifyRaf = 0
  // Scrub proxies: every `stride`th frame as a JPEG, a few of them decoded.
  const proxies = new Map<number, Blob>()
  let proxyBytes = 0
  let stride = 1
  const decoded = new Map<number, { bitmap: ImageBitmap; used: number }>()
  const decoding = new Set<number>()
  /** Where a scrub is (the proxies nearest it come first), and the frame asked for before. */
  let aim: number | null = null
  let lastAsked: number | null = null

  const storeProxy = (frame: number, blob: Blob) => {
    if (disposed || frame % stride || proxies.has(frame)) return
    proxies.set(frame, blob)
    proxyBytes += blob.size
    const next = proxyStride(proxyBytes, proxies.size, total, PROXY.budget)
    if (next <= stride) return
    stride = next
    for (const [f, b] of proxies)
      if (f % stride) {
        proxies.delete(f)
        proxyBytes -= b.size
      }
  }
  /** The stored proxy nearest `frame`, if any. */
  const proxyNear = (frame: number) => {
    const at = Math.round(frame / stride) * stride
    let best: number | null = null
    for (const f of [at, at - stride, at + stride])
      if (proxies.has(f) && (best === null || Math.abs(f - frame) < Math.abs(best - frame)))
        best = f
    return best
  }
  const proxyTodo = () => {
    const out: number[] = []
    for (let f = 0; f < total; f += stride) if (!proxies.has(f)) out.push(f)
    return out
  }
  /** Decodes a proxy; listeners hear at once, as a scrub waits on it. */
  const decodeProxy = (frame: number | null) => {
    if (frame === null || decoded.has(frame) || decoding.has(frame) || disposed) return
    const blob = proxies.get(frame)
    if (!blob) return
    decoding.add(frame)
    createImageBitmap(blob).then(
      (bitmap) => {
        decoding.delete(frame)
        if (disposed) return bitmap.close()
        decoded.set(frame, { bitmap, used: ++tick })
        if (decoded.size > PROXY.decoded) {
          const [oldest] = [...decoded].sort((a, b) => a[1].used - b[1].used)
          if (oldest && oldest[0] !== frame) {
            oldest[1].bitmap.close()
            decoded.delete(oldest[0])
          }
        }
        for (const f of listeners) f()
      },
      () => decoding.delete(frame),
    )
  }
  const dropDecoded = () => {
    for (const d of decoded.values()) d.bitmap.close()
    decoded.clear()
  }

  const notify = () => {
    if (notifyRaf) return
    notifyRaf = win.requestAnimationFrame(() => {
      notifyRaf = 0
      for (const f of listeners) f()
    })
  }
  const store = (frame: number, bitmap: ImageBitmap, full: boolean, kind: Entry["kind"]) => {
    if (disposed) return bitmap.close()
    const old = entries.get(frame)
    if (old && old.full && !full) return bitmap.close()
    old?.bitmap.close()
    entries.set(frame, { bitmap, full, used: ++tick, kind })
    evict()
    notify()
  }
  const evict = () => {
    const near = new Set(focusAt === null ? [] : focusWindow(focusAt, total))
    const limit = (kind: Entry["kind"], max: number) => {
      const of = [...entries].filter(([f, e]) => e.kind === kind && !near.has(f))
      if (of.length <= max) return
      of.sort((a, b) => a[1].used - b[1].used)
      for (const [f, e] of of.slice(0, of.length - max)) {
        e.bitmap.close()
        entries.delete(f)
      }
    }
    limit("focus", 0)
    limit("seen", SEEN)
    limit("want", WANTED)
    limit("grid", GRID)
  }
  const covered = (p: FramePoint) => {
    for (const f of entries.keys()) if (Math.abs(f - p.frame) <= p.tolerance) return true
    return false
  }
  /** What's still to decode, in order: the focus window, the strip's frames, the grid. */
  const missing = (): {
    frame: number
    full: boolean
    tolerance: number
    kind: Entry["kind"]
  }[] => {
    if (total <= 0) return []
    const out: { frame: number; full: boolean; tolerance: number; kind: Entry["kind"] }[] = []
    if (focusAt !== null && core.active)
      for (const f of focusWindow(focusAt, total))
        if (!entries.get(f)?.full) out.push({ frame: f, full: true, tolerance: 0, kind: "focus" })
    for (const p of wants)
      if (p.frame >= 0 && p.frame < total && !covered(p))
        out.push({ ...p, full: false, kind: "want" })
    const at = focusAt ?? 0
    for (const p of gridPoints(total).sort(
      (a, b) => Math.abs(a.frame - at) - Math.abs(b.frame - at),
    ))
      if (!covered(p)) out.push({ ...p, full: false, kind: "grid" })
    return out
  }

  // ——— WebCodecs ———
  const start = async () => {
    if (started) return
    started = true
    const Decoder = (win as unknown as { VideoDecoder?: typeof VideoDecoder }).VideoDecoder
    if (Decoder) {
      try {
        const res = await fetch(src, { mode: "cors" })
        if (res.ok) {
          const ab = await res.arrayBuffer()
          const t = demuxMp4(ab)
          if (t) {
            const ok = await Decoder.isConfigSupported(config(t))
            if (ok.supported) {
              track = t
              buf = new Uint8Array(ab)
              const last = Math.max(...t.samples.map((s) => s.pts + s.duration))
              total = Math.max(1, Math.round(last * fps))
              backend = "webcodecs"
            }
          }
        }
      } catch {}
    }
    if (disposed) return
    if (!track) await startSampler()
    notify()
    pump(win)
  }
  const startSampler = async () => {
    backend = "video"
    const v = doc.createElement("video")
    sampler = v
    v.muted = true
    v.playsInline = true
    v.preload = "auto"
    v.crossOrigin = "anonymous"
    await new Promise<void>((done) => {
      v.addEventListener("loadeddata", () => done(), { once: true })
      v.addEventListener("error", () => done(), { once: true })
      v.src = src
    })
    if (v.videoWidth && Number.isFinite(v.duration))
      total = Math.max(1, Math.round(v.duration * fps))
  }
  const config = (t: Mp4Track): VideoDecoderConfig => ({
    codec: t.codec,
    ...(t.description ? { description: t.description } : {}),
    codedWidth: t.width,
    codedHeight: t.height,
  })

  const decodeUnit = async () => {
    const todo = missing()
    if (!todo.length || !track || !buf) return
    const t = track
    const data = buf
    const plan = new Map<number, { full: boolean; kind: Entry["kind"] }>()
    for (const m of todo) if (!plan.has(m.frame)) plan.set(m.frame, m)
    const runs = decodeRuns(t.samples, new Set(plan.keys()), (pts) => frameOf(pts, fps))
    const run = runs.find((r) => r.frames.includes(todo[0]!.frame)) ?? runs[0]
    if (!run) return
    // Only a run for the focus stops when the focus moves on; the grid's carries on.
    const forFocus = todo[0]!.kind === "focus"
    const gen = generation
    await decodeRun(t, data, run, forFocus ? () => gen !== generation : () => false, (vf, f) => {
      const want = plan.get(f)
      if (!want) return null
      plan.delete(f)
      return toBitmap(doc, vf, vf.displayWidth, vf.displayHeight, want.full ? FULL : PREVIEW).then(
        (bm) => store(f, bm, want.full, want.kind),
      )
    })
  }
  /** Scrub proxies for one run of frames: the run nearest the scrub (or the focus) first. */
  const proxyUnit = async () => {
    const todo = proxyTodo()
    if (!todo.length || !track || !buf) return
    const runs = decodeRuns(track.samples, new Set(todo), (pts) => frameOf(pts, fps))
    const at = aim ?? focusAt ?? 0
    let run = runs[0]
    let best = Number.POSITIVE_INFINITY
    for (const r of runs) {
      const d = Math.min(...r.frames.map((f) => Math.abs(f - at)))
      if (d < best) {
        best = d
        run = r
      }
    }
    if (!run) return
    // A new focus (the hand let go) stops it: those full-size frames come first. So does a turn's
    // worth of frames, so another cache (a compare's other side) fills alongside.
    const gen = generation
    let made = 0
    await decodeRun(
      track,
      buf,
      run,
      () => gen !== generation || made >= PROXY.turn,
      (vf, f) => {
        if (f % stride || proxies.has(f) || f >= total) return null
        made++
        return toProxy(doc, vf, vf.displayWidth, vf.displayHeight).then((b) => storeProxy(f, b))
      },
    )
  }
  /**
   * Decodes the samples of `run`, handing each frame to `take`: a promise to wait on before the
   * frame is closed, or null to close it now. Stops early when `stale()`; on a decoder error the
   * <video> takes over.
   */
  const decodeRun = async (
    t: Mp4Track,
    data: Uint8Array,
    run: { readonly from: number; readonly to: number },
    stale: () => boolean,
    take: (vf: VideoFrame, frame: number) => Promise<unknown> | null,
  ) => {
    let pending = 0
    let failed = false
    const decoder = new VideoDecoder({
      output: (vf) => {
        const work = stale() || disposed ? null : take(vf, frameOf(vf.timestamp / 1e6, fps))
        if (!work) return vf.close()
        pending++
        void work
          .catch(() => {})
          .finally(() => {
            vf.close()
            pending--
          })
      },
      error: () => {
        failed = true
      },
    })
    decoder.configure(config(t))
    try {
      for (let k = run.from; k < run.to; k++) {
        // A new focus elsewhere stops this group; what it decoded stays.
        if (stale() || disposed || failed) break
        while (decoder.decodeQueueSize > 12 || pending > 3) await sleep(win, 1)
        const s = t.samples[k]!
        decoder.decode(
          new EncodedVideoChunk({
            type: s.key ? "key" : "delta",
            timestamp: Math.round(s.pts * 1e6),
            duration: Math.round(s.duration * 1e6),
            data: data.subarray(s.offset, s.offset + s.size),
          }),
        )
      }
      if (!stale() && !failed) await decoder.flush()
    } catch {
    } finally {
      while (pending > 0) await sleep(win, 2)
      if (decoder.state !== "closed") decoder.close()
    }
    if (failed) {
      // A decoder that can't decode this file: the <video> takes over.
      track = null
      buf = null
      backend = "pending"
      void startSampler().then(() => pump(win))
    }
  }

  // ——— the <video> fallback ———
  const seekTo = (v: HTMLVideoElement, t: number) =>
    new Promise<void>((done) => {
      const finish = () => {
        win.clearTimeout(timer)
        v.removeEventListener("seeked", finish)
        done()
      }
      const timer = win.setTimeout(finish, 4000)
      v.addEventListener("seeked", finish)
      v.currentTime = t
    })
  /** Plays `v` at `rate`, handing each presented frame to `take`, until it says stop. */
  const playThrough = (
    v: HTMLVideoElement,
    rate: number,
    take: (f: number) => boolean | Promise<boolean>,
    ms: number,
    focused: boolean,
  ) =>
    new Promise<void>((done) => {
      const fv = v as HTMLVideoElement & {
        requestVideoFrameCallback?(cb: (n: number, m: { mediaTime: number }) => void): number
      }
      let stopped = false
      const stop = () => {
        if (stopped) return
        stopped = true
        v.pause()
        v.playbackRate = 1
        win.clearTimeout(timer)
        done()
      }
      const timer = win.setTimeout(stop, ms)
      const gen = generation
      const each = async (time: number) => {
        if (stopped) return
        if ((focused && gen !== generation) || disposed || v.ended) return stop()
        if (!(await take(frameOf(time, fps)))) return stop()
        next()
      }
      const next = () => {
        if (fv.requestVideoFrameCallback)
          fv.requestVideoFrameCallback((_n, m) => void each(m.mediaTime))
        else win.setTimeout(() => void each(v.currentTime), 16)
      }
      v.playbackRate = rate
      next()
      void v.play().catch(stop)
    })
  const videoUnit = async () => {
    const v = sampler
    const todo = missing()
    if (!v || !todo.length || !v.videoWidth) return
    const first = todo[0]!
    const grab = async (f: number, full: boolean, kind: Entry["kind"]) =>
      store(
        f,
        await toBitmap(doc, v, v.videoWidth, v.videoHeight, full ? FULL : PREVIEW),
        full,
        kind,
      )
    if (first.tolerance === 0) {
      // Exact frames around the focus: seek to the lowest, then play through the rest.
      const exact = todo
        .filter((m) => m.tolerance === 0)
        .map((m) => m.frame)
        .sort((a, b) => a - b)
      const want = new Set(exact)
      await seekTo(v, (exact[0]! + 0.5) / fps)
      const at = frameOf(v.currentTime, fps)
      if (want.delete(at)) await grab(at, true, "focus")
      if (want.size)
        await playThrough(
          v,
          1,
          async (f) => {
            if (want.delete(f)) await grab(f, true, "focus")
            return want.size > 0 && f <= exact.at(-1)!
          },
          2000,
          true,
        )
      return
    }
    // Small frames: a fast play-through from the first, keeping what lands near each point.
    const points = todo.filter((m) => m.tolerance > 0).sort((a, b) => a.frame - b.frame)
    const from = points[0]!
    await seekTo(v, Math.max(0, (from.frame - from.tolerance + 0.5) / fps))
    await playThrough(
      v,
      8,
      async (f) => {
        const hit = points.find((p) => Math.abs(p.frame - f) <= p.tolerance && !covered(p))
        if (hit) await grab(f, false, hit.kind)
        return points.some((p) => p.frame + p.tolerance >= f && !covered(p))
      },
      6000,
      false,
    )
  }
  /** Scrub proxies by playing through from the first one missing at or after the scrub. */
  const videoProxyUnit = async () => {
    const v = sampler
    const todo = proxyTodo()
    if (!v || !todo.length || !v.videoWidth) return
    const at = aim ?? focusAt ?? 0
    const first = todo.find((f) => f >= at) ?? todo[0]!
    const grab = async (f: number) => {
      if (f % stride || proxies.has(f) || f >= total) return
      storeProxy(f, await toProxy(doc, v, v.videoWidth, v.videoHeight))
    }
    await seekTo(v, (first + 0.5) / fps)
    await grab(frameOf(v.currentTime, fps))
    await playThrough(
      v,
      1,
      async (f) => {
        await grab(f)
        return proxyTodo().length > 0
      },
      4000,
      true,
    )
  }

  const cache: FrameCache = {
    src,
    get backend() {
      return backend
    },
    get size() {
      return entries.size
    },
    get proxies() {
      return { count: proxies.size, stride, bytes: proxyBytes }
    },
    nearest(frame, within = Infinity, decode = false) {
      const k = nearestKey(entries.keys(), frame, within)
      const kd = nearestKey(decoded.keys(), frame, within)
      const dk = k === null ? Number.POSITIVE_INFINITY : Math.abs(k - frame)
      const dd = kd === null ? Number.POSITIVE_INFINITY : Math.abs(kd - frame)
      if (decode) {
        // The proxy nearer than anything decoded, and the one the hand is heading for.
        const p = proxyNear(frame)
        if (p !== null && Math.abs(p - frame) < Math.min(dk, dd)) decodeProxy(p)
        const ahead = aheadOf(frame, lastAsked, total)
        if (ahead !== null) decodeProxy(proxyNear(ahead))
        lastAsked = frame
      }
      // A decoded proxy beats a small grid frame as near, never a full-size one.
      if (kd !== null && (dd < dk || (dd === dk && !entries.get(k!)?.full))) {
        const d = decoded.get(kd)!
        d.used = ++tick
        return { frame: kd, bitmap: d.bitmap, full: false }
      }
      if (k === null) return null
      const e = entries.get(k)!
      e.used = ++tick
      return { frame: k, bitmap: e.bitmap, full: e.full }
    },
    covers(frame) {
      if (entries.has(frame) || decoded.has(frame)) return true
      const p = proxyNear(frame)
      return p !== null && Math.abs(p - frame) <= stride / 2
    },
    focus(frame) {
      claim(core)
      const moved = focusAt === null || Math.abs(frame - focusAt) > FOCUS_RADIUS
      focusAt = frame
      aim = null
      if (moved) generation++
      void start()
      pump(win)
    },
    follow(frame) {
      claim(core)
      aim = frame
      void start()
      pump(win)
    },
    want(points) {
      wants = points
      if (core.shown > 0) pump(win)
    },
    keep(frame, source, w, h) {
      if (!core.active) return
      const e = entries.get(frame)
      if (e?.full) return
      void toBitmap(doc, source, w, h, FULL)
        .then((bm) => store(frame, bm, true, "seen"))
        .catch(() => {})
    },
    visible(on) {
      core.shown = Math.max(0, core.shown + (on ? 1 : -1))
      if (core.shown > 0) {
        void start()
        pump(win)
      }
    },
    listen(f) {
      listeners.add(f)
      return () => void listeners.delete(f)
    },
    release() {
      core.refs--
      if (core.refs > 0) return
      core.dispose()
    },
  }
  const core: Core = {
    key,
    cache,
    refs: 0,
    shown: 0,
    active: false,
    ran: 0,
    work() {
      if (disposed || backend === "pending") return null
      if (missing().length) return backend === "webcodecs" ? decodeUnit() : videoUnit()
      if (proxyTodo().length) return backend === "webcodecs" ? proxyUnit() : videoProxyUnit()
      return null
    },
    dropFull() {
      for (const [f, e] of entries)
        if (e.full) {
          e.bitmap.close()
          entries.delete(f)
        }
      focusAt = null
      aim = null
      lastAsked = null
      dropDecoded()
    },
    dispose() {
      disposed = true
      generation++
      if (notifyRaf) win.cancelAnimationFrame(notifyRaf)
      for (const e of entries.values()) e.bitmap.close()
      entries.clear()
      dropDecoded()
      proxies.clear()
      listeners.clear()
      if (sampler) {
        sampler.removeAttribute("src")
        sampler.load()
      }
      buf = null
      track = null
      actives.delete(core)
      round?.delete(core)
      cores.delete(key)
    },
  }
  return core
}
