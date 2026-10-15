// What the page is doing, for the Readouts scene to watch: the shared animation loop's frames,
// how many previews are moving, each WebGPU view's renders and GPU time, the lamp's output, and a
// log of things that happened in the scenes. Plain numbers written where they happen; nothing
// here runs on its own.

export type LiveLevel = "debug" | "info" | "warn" | "error"

export const live = {
  /** Frames the shared loop has stepped, and the last frame's length (ms). */
  frames: 0,
  frameMs: 0,
  /** Previews moving in the last frame. */
  moving: 0,
  /** Per WebGPU view: renders, and the last render's time to finish on the GPU (ms). */
  views: new Map<string, { renders: number; ms: number }>(),
  /** GPU ms finished since the readouts last looked. */
  gpuMs: 0,
  /** The lamp's light right now, lumens. */
  lumens: 0,
  events: [] as { level: LiveLevel; text: string }[],
  log(text: string, level: LiveLevel = "info") {
    this.events.push({ level, text })
    if (this.events.length > 50) this.events.shift()
  },
}
