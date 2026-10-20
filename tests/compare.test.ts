import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { focusWindow, gridPoints, nearestKey } from "../src/ui/compare-frames"
import { decodeRuns, demuxMp4 } from "../src/ui/compare-mp4"
import {
  clampZoom,
  compareLayout,
  compareModes,
  frameMidpoint,
  frameOf,
  gripTop,
  lastFrame,
  letterbox,
  loopAround,
  meanAbsDiff,
  mediaKind,
  modeForKey,
  panBy,
  requestSeek,
  sameFrame,
  seamLabels,
  SEEK_IDLE,
  seeked,
  seekTime,
  splitHeight,
  stripColumns,
  stripPeaks,
  syncAction,
  wipeAt,
  wipeGrab,
  wipeKey,
  wipeX,
  ZOOM_FIT,
  zoomAbout,
  zoomedRect,
} from "../src/ui/compare-model"

describe("sources", () => {
  test("kind from the extension, query and hash ignored; given kinds win", () => {
    expect(mediaKind("/a/before.mp4")).toBe("video")
    expect(mediaKind("clip.WEBM?v=2#t=1")).toBe("video")
    expect(mediaKind("shot.png")).toBe("image")
    expect(mediaKind("/api/media/42")).toBe("image")
    expect(mediaKind("/api/media/42", "video")).toBe("video")
  })
})

describe("frames", () => {
  const fps = 30
  test("the frame a time falls in, and its midpoint", () => {
    expect(frameOf(0, fps)).toBe(0)
    expect(frameOf(1 / 30, fps)).toBe(1)
    // A frame boundary computed in floating point still counts as that frame.
    expect(frameOf(0.1, fps)).toBe(3)
    expect(frameOf(-1, fps)).toBe(0)
    expect(frameMidpoint(0, fps)).toBeCloseTo(1 / 60)
    expect(frameMidpoint(3, fps)).toBeCloseTo(3.5 / 30)
  })
  test("midpoints never pass the last frame", () => {
    expect(lastFrame(4, fps)).toBe(119)
    expect(frameMidpoint(500, fps, 4)).toBeCloseTo(119.5 / 30)
    expect(seekTime(4, fps, 4)).toBeCloseTo(119.5 / 30)
  })
  test("seekTime is the midpoint of the frame showing", () => {
    expect(seekTime(1, fps)).toBeCloseTo(30.5 / 30)
    expect(seekTime(1.02, fps)).toBeCloseTo(30.5 / 30)
    expect(sameFrame(1.001, 1.03, fps)).toBe(true)
    expect(sameFrame(1.001, 1.034, fps)).toBe(false)
  })
})

describe("sync while playing", () => {
  test("in step, the base rate", () => {
    expect(syncAction(2, 2.004)).toEqual({ seekTo: null, rate: 1 })
  })
  test("behind leans faster, ahead slower, proportionally", () => {
    const behind = syncAction(2, 1.96)
    const ahead = syncAction(2, 2.04)
    expect(behind.seekTo).toBeNull()
    expect(behind.rate).toBeGreaterThan(1)
    expect(ahead.rate).toBeLessThan(1)
    expect(behind.rate - 1).toBeCloseTo(1 - ahead.rate, 4)
    expect(syncAction(2, 1.98).rate - 1).toBeLessThan(behind.rate - 1)
  })
  test("by at most 25%", () => {
    expect(syncAction(2, 1.915).rate).toBe(1.25)
    expect(syncAction(2, 2.085).rate).toBe(0.75)
    expect(syncAction(2, 1.915, { rate: 2 }).rate).toBe(2.5)
  })
  test("past 90 ms it seeks to the master", () => {
    expect(syncAction(2, 1.8)).toEqual({ seekTo: 2, rate: 1 })
    expect(syncAction(2, 2.2, { rate: 0.5 })).toEqual({ seekTo: 2, rate: 0.5 })
  })
})

describe("seek coalescing", () => {
  const fps = 30
  test("a seek applies at once when none is in flight", () => {
    const s = requestSeek(SEEK_IDLE, seekTime(1, fps), 0, fps)
    expect(s.apply).toBeCloseTo(30.5 / 30)
    expect(s.state.seeking).toBe(true)
  })
  test("the frame already showing: no seek, settled (no frame callback will come)", () => {
    const s = requestSeek(SEEK_IDLE, seekTime(1, fps), 30.5 / 30, fps)
    expect(s).toEqual({ state: SEEK_IDLE, apply: null, settled: true })
  })
  test("while one is in flight only the latest is kept, applied when it lands", () => {
    let s = requestSeek(SEEK_IDLE, 1.5 / 30, 0, fps)
    for (const f of [2, 3, 4, 5]) {
      const step = requestSeek(s.state, (f + 0.5) / fps, 1.5 / 30, fps)
      expect(step.apply).toBeNull()
      s = step
    }
    expect(s.state.pending).toBeCloseTo(5.5 / 30)
    const landed = seeked(s.state, 1.5 / 30, fps)
    expect(landed.apply).toBeCloseTo(5.5 / 30)
    expect(landed.state).toEqual({ seeking: true, pending: null })
    const done = seeked(landed.state, 5.5 / 30, fps)
    expect(done).toEqual({ state: SEEK_IDLE, apply: null, settled: true })
  })
  test("a pending target on the frame it landed on is dropped", () => {
    const s = requestSeek(requestSeek(SEEK_IDLE, 1.5 / 30, 0, fps).state, 1.6 / 30, 0, fps)
    expect(seeked(s.state, 1.5 / 30, fps)).toEqual({ state: SEEK_IDLE, apply: null, settled: true })
  })
})

describe("layout and the wipe", () => {
  const box = { x: 0, y: 0, w: 1000, h: 400 }
  test("letterboxed: whole, centred, never cropped", () => {
    expect(letterbox({ w: 16, h: 9 }, box)).toEqual({
      x: 144.44444444444446,
      y: 0,
      w: 711.1111111111111,
      h: 400,
    })
    const tall = letterbox({ w: 9, h: 16 }, box)
    expect(tall.h).toBe(400)
    expect(tall.x + tall.w / 2).toBeCloseTo(500)
  })
  test("side by side in halves a gap apart; overlaid in the same place", () => {
    const L = compareLayout(box, { w: 16, h: 9 }, { w: 16, h: 9 })
    // Edge to edge down the middle, the pair fitted as a whole.
    expect(L.side.before.x + L.side.before.w).toBeCloseTo(L.side.split)
    expect(L.side.after.x).toBeCloseTo(L.side.split)
    expect(L.side.before.h).toBeCloseTo(L.side.before.w * (9 / 16))
    expect(L.overlay.before).toEqual(L.overlay.after)
  })
  test("the line, and where a pointer puts it", () => {
    const r = { x: 100, y: 0, w: 400, h: 200 }
    expect(wipeX(r, 0.5)).toBe(300)
    expect(wipeAt(300, r)).toBe(0.5)
    expect(wipeAt(0, r)).toBe(0)
    expect(wipeAt(900, r)).toBe(1)
    // With a grab offset, the line stays under the hand where it was taken.
    expect(wipeAt(306, r, 6)).toBe(0.5)
  })
  test("a press on the line takes hold where it is; elsewhere the line comes to it", () => {
    const r = { x: 100, y: 0, w: 400, h: 200 }
    expect(wipeGrab(305, r, 0.5)).toEqual({ onLine: true, offset: 5 })
    expect(wipeGrab(400, r, 0.5)).toEqual({ onLine: false, offset: 0 })
  })
  test("keys move it 1%, 10% with Shift, within 0–1", () => {
    expect(wipeKey(0.5, 1)).toBe(0.51)
    expect(wipeKey(0.5, -1, true)).toBe(0.4)
    expect(wipeKey(0.995, 1)).toBe(1)
    expect(wipeKey(0.05, -1, true)).toBe(0)
  })
})

describe("the frame strip", () => {
  const fps = 30
  test("power-of-two columns at least minWidth wide, sampling their first frame", () => {
    const cols = stripColumns({ start: 0, span: 4 }, 800, { duration: 4, fps, minWidth: 60 })
    // 60 px at 200 px/s is 9 frames: 16-frame columns.
    expect(cols[0]!.to - cols[0]!.from).toBe(16)
    expect(cols[0]!.w).toBeGreaterThanOrEqual(60)
    expect(cols[1]!.frame).toBe(16)
    expect(cols[1]!.time).toBeCloseTo(16.5 / 30)
    expect(cols.at(-1)!.to).toBe(120)
  })
  test("columns sit on a grid fixed to frame 0, so a pan keeps their frames", () => {
    const a = stripColumns({ start: 0, span: 2 }, 600, { duration: 4, fps, minWidth: 40 })
    const b = stripColumns({ start: 0.5, span: 2 }, 600, { duration: 4, fps, minWidth: 40 })
    const shared = b.filter((c) => a.some((x) => x.frame === c.frame))
    expect(shared.length).toBeGreaterThan(a.length / 2)
    expect(b[0]!.x).toBeLessThanOrEqual(0)
  })
  test("zooming in by two keeps half the frames sampled", () => {
    const out = stripColumns({ start: 0, span: 4 }, 800, { duration: 4, fps, minWidth: 60 })
    const zin = stripColumns({ start: 0, span: 2 }, 800, { duration: 4, fps, minWidth: 60 })
    expect(zin[0]!.to - zin[0]!.from).toBe(8)
    const reused = zin.filter((c) => out.some((o) => o.frame === c.frame))
    expect(reused.length).toBe(Math.ceil(zin.length / 2))
  })
  test("mean absolute difference over colour, alpha ignored", () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 0])
    const b = new Uint8ClampedArray([255, 255, 255, 0, 255, 255, 255, 255])
    expect(meanAbsDiff(a, a)).toBe(0)
    expect(meanAbsDiff(a, b)).toBe(0.5)
  })
  test("peaks: local maxima above the threshold and half the largest", () => {
    expect(stripPeaks([0, 0.01, 0.2, 0.05, 0.12, 0.13, 0.02, undefined])).toEqual([2, 5])
    expect(stripPeaks([0.001, 0.002, 0.001])).toEqual([])
  })
})

describe("the frame cache", () => {
  test("the grid spreads points across the video, each covering half a step either way", () => {
    const g = gridPoints(480, 48)
    expect(g).toHaveLength(48)
    expect(g[0]).toEqual({ frame: 5, tolerance: 5 })
    expect(g.at(-1)!.frame).toBe(475)
    expect(gridPoints(10, 48).map((p) => p.frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(gridPoints(0)).toEqual([])
  })
  test("the focus window is nearest first, inside the video", () => {
    expect(focusWindow(10, 100, 2)).toEqual([10, 11, 9, 12, 8])
    expect(focusWindow(0, 100, 2)).toEqual([0, 1, 2])
    expect(focusWindow(99, 100, 1)).toEqual([99, 98])
  })
  test("nearest cached frame, within a reach", () => {
    expect(nearestKey([0, 10, 20], 14)).toBe(10)
    expect(nearestKey([0, 10, 20], 15)).toBe(20)
    expect(nearestKey([0, 10, 20], 26, 5)).toBe(null)
    expect(nearestKey([], 3)).toBe(null)
  })
})

describe("mp4 demux", () => {
  const file = readFileSync(new URL("../examples/assets/compare/before.mp4", import.meta.url))
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
  const track = demuxMp4(buf)!
  test("reads the codec, size and every sample, with the edit list applied", () => {
    expect(track.codec).toBe("avc1.64001e")
    expect([track.width, track.height]).toEqual([640, 360])
    expect(track.samples).toHaveLength(180)
    const frames = track.samples.map((s) => frameOf(s.pts, 30)).sort((a, b) => a - b)
    expect(frames).toEqual(Array.from({ length: 180 }, (_, i) => i))
    expect(track.samples[0]!.key).toBe(true)
    expect(track.samples.filter((s) => s.key)).toHaveLength(12)
  })
  test("decode runs start at a keyframe and hold the frames wanted", () => {
    const runs = decodeRuns(track.samples, new Set([0, 20, 21, 100]), (t) => frameOf(t, 30))
    expect(runs.map((r) => r.frames)).toEqual([[0], [20, 21], [100]])
    for (const r of runs) expect(track.samples[r.from]!.key).toBe(true)
  })
  test("anything else is null", () => {
    expect(demuxMp4(new ArrayBuffer(64))).toBe(null)
  })
})

describe("split screen and zoom", () => {
  test("the split's height leaves no margins", () => {
    expect(splitHeight(1000, { w: 1600, h: 900 })).toBeCloseTo(281.25)
    const L = compareLayout({ x: 0, y: 0, w: 1000, h: 281.25 }, { w: 16, h: 9 }, { w: 16, h: 9 })
    expect(L.side.before).toEqual({ x: 0, y: 0, w: 500, h: 281.25 })
    expect(L.side.after).toEqual({ x: 500, y: 0, w: 500, h: 281.25 })
  })
  test("a fixed height too wide for the pair centres it as a whole", () => {
    const L = compareLayout({ x: 0, y: 0, w: 1200, h: 281.25 }, { w: 16, h: 9 }, { w: 16, h: 9 })
    expect(L.side.before.x).toBeCloseTo(100)
    expect(L.side.after.x).toBeCloseTo(600)
    expect(L.side.split).toBeCloseTo(600)
  })
  test("zooming about a point keeps that point under it", () => {
    const r = zoomAbout(ZOOM_FIT, 2, 0.25, 0.75)
    expect(r.w).toBe(0.5)
    expect(r.u + 0.25 * r.w).toBeCloseTo(0.25)
    expect(r.v + 0.75 * r.h).toBeCloseTo(0.75)
    expect(zoomAbout(r, 0.1, 0.5, 0.5)).toEqual(ZOOM_FIT)
    expect(zoomAbout(ZOOM_FIT, 100, 0.5, 0.5).w).toBe(1 / 16)
  })
  test("a pan follows the hand and stays inside the picture", () => {
    const base = { x: 0, y: 0, w: 400, h: 200 }
    const r = { u: 0.25, v: 0.25, w: 0.5, h: 0.5 }
    expect(panBy(r, 100, 0, base).u).toBeCloseTo(0.125)
    expect(panBy(r, -10000, 0, base).u).toBe(0.5)
  })
  test("the zoomed side's rect maps the region onto its base", () => {
    const base = { x: 10, y: 20, w: 400, h: 200 }
    const z = zoomedRect(base, { u: 0.25, v: 0.5, w: 0.5, h: 0.5 })
    expect(z).toEqual({ x: -190, y: -180, w: 800, h: 400 })
    expect(clampZoom({ u: -1, v: 2, w: 0.5 })).toEqual({ u: 0, v: 0.5, w: 0.5, h: 0.5 })
  })
  test("a loop's default window sits around the playhead", () => {
    expect(loopAround(10, 41)).toEqual({ start: 8, end: 12 })
    expect(loopAround(0.2, 6)).toEqual({ start: 0, end: 1.2 })
    expect(loopAround(5.9, 6)).toEqual({ start: 4.8, end: 6 })
  })
})

describe("modes", () => {
  test("Side and Wipe by default; difference only when asked for; unknown ones dropped", () => {
    expect(compareModes()).toEqual({ modes: ["side", "wipe"], mode: "side" })
    expect(compareModes(undefined, "difference")).toEqual({ modes: ["side", "wipe"], mode: "side" })
    expect(compareModes(["wipe", "difference"], "difference")).toEqual({
      modes: ["wipe", "difference"],
      mode: "difference",
    })
    expect(compareModes(["flicker" as never, "wipe"]).modes).toEqual(["wipe"])
    expect(compareModes([])).toEqual({ modes: ["side", "wipe"], mode: "side" })
  })
  test("digits pick by position; S, W and D only the modes offered", () => {
    expect(modeForKey("1", ["side", "wipe"])).toBe("side")
    expect(modeForKey("2", ["side", "wipe"])).toBe("wipe")
    expect(modeForKey("3", ["side", "wipe"])).toBeNull()
    expect(modeForKey("d", ["side", "wipe"])).toBeNull()
    expect(modeForKey("D", ["side", "wipe", "difference"])).toBe("difference")
    expect(modeForKey("x", ["side", "wipe"])).toBeNull()
  })
})

describe("the wipe's seam", () => {
  test("labels ride either side of the seam, a gap from it", () => {
    const at = seamLabels(300, 0, 600, 50, 40, 8)
    expect(at.before).toEqual({ x: 242, opacity: 1 })
    expect(at.after).toEqual({ x: 308, opacity: 1 })
  })
  test("a label fades as its side runs out of room, never crossing the seam", () => {
    expect(seamLabels(74, 0, 600, 50, 40, 8).before.opacity).toBe(1)
    expect(seamLabels(70, 0, 600, 50, 40, 8).before.opacity).toBeCloseTo(0.5, 9)
    expect(seamLabels(66, 0, 600, 50, 40, 8).before.opacity).toBe(0)
    expect(seamLabels(590, 0, 600, 50, 40, 8).after.opacity).toBe(0)
  })
  test("the grip rides at the pointer's height, kept inside the line", () => {
    const rect = { x: 0, y: 10, w: 400, h: 200 }
    expect(gripTop(110, rect, 28)).toBe(96)
    expect(gripTop(0, rect, 28)).toBe(18)
    expect(gripTop(999, rect, 28)).toBe(174)
    expect(gripTop(50, { x: 0, y: 0, w: 10, h: 30 }, 28)).toBe(1)
  })
})
