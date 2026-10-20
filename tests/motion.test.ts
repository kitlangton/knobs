import { describe, expect, it } from "vitest"
import {
  DEFAULT_LINEAR,
  FADE,
  motionCss,
  reducedSpring,
  SPRING_TOKEN,
  SPRINGS,
} from "../src/core/motion.js"
import { FILL } from "../src/panel/motion.js"
import { springMotion } from "../src/core/spring.js"
import { injectStyles } from "../src/panel/styles.js"

function panelCss() {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text = style.textContent) },
  }
  injectStyles(doc as unknown as Document)
  return text
}

describe("named springs", () => {
  it("are the five, all without bounce", () => {
    expect(Object.fromEntries(Object.entries(SPRINGS).map(([k, v]) => [k, v.duration]))).toEqual({
      instant: 0.1,
      snappy: 0.25,
      default: 0.3,
      calm: 0.4,
      smooth: 0.45,
    })
    for (const s of Object.values(SPRINGS)) expect(s.bounce).toBe(0)
  })

  it("emit an easing and a settle time per spring, 0 ms under reduced motion", () => {
    for (const name of Object.keys(SPRINGS)) {
      expect(motionCss).toMatch(new RegExp(`--_k-motion-${name}:linear\\(`))
      expect(motionCss).toMatch(new RegExp(`--_k-motion-${name}-ms:\\d+`))
      expect(motionCss).toContain(`--_k-motion-${name}-ms:0`)
    }
  })

  // --k-spring (the GPU's and the slider's) and --k-fill-ease/ms (CSS) are one spring.
  it("ship --k-spring as the default spring, in sync with the fill", () => {
    const css = panelCss()
    expect(SPRING_TOKEN).toBe("0.3 0")
    expect(css).toContain(`--k-spring:${SPRING_TOKEN};`)
    expect(css).toContain(`--k-fill-ms:${DEFAULT_LINEAR.ms};`)
    expect(css).toContain(`--k-fill-ease:${DEFAULT_LINEAR.easing};`)
    expect(FILL).toEqual(springMotion(SPRINGS.default))
  })
})

describe("reduced motion", () => {
  it("drops travel and keeps a short fade", () => {
    expect(reducedSpring(SPRINGS.calm, "move", false)).toBe(SPRINGS.calm)
    expect(reducedSpring(SPRINGS.calm, "move", true)).toBeNull()
    expect(reducedSpring(SPRINGS.smooth, "fade", true)).toBe(FADE)
    expect(reducedSpring(SPRINGS.instant, "fade", true)).toBe(SPRINGS.instant)
  })
})
