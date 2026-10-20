// A ratchet on raw values in knobs' stylesheets: colours, durations and easings, pill radii and
// z-indexes written as literals rather than read from tokens, and reads of custom properties that
// nothing declares. Each count may only fall. When a change lowers one, lower its baseline here.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { aliased } from "../src/core/glide"
import { rootCss } from "../src/core/root"
import { panelCss } from "../src/panel/styles"
import { DEPRECATED, TOKENS, cssName } from "../src/tokens/schema"
import { diffCss } from "../src/ui/diff-css"
import { rendererCss } from "../src/ui/diff-scroll"
import { uiCss } from "../src/ui/look"
import { walkthroughCss } from "../src/ui/walkthrough-css"

/** Every stylesheet knobs writes into a page (or a diff's shadow root). */
const SHEETS: Record<string, string> = {
  tokens: rootCss,
  panel: panelCss(),
  ui: uiCss(),
  diff: aliased(diffCss),
  diffRenderer: rendererCss(() => ""),
  walkthrough: aliased(walkthroughCss),
}

/** `property: value` pairs, comments dropped, with the sheet they came from. */
function declarations(css: string): { property: string; value: string }[] {
  const out: { property: string; value: string }[] = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "")
  // A declaration runs from a `{` or `;` to the next `;` or `}`; nested parentheses don't split.
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (depth === 0 && (ch === "{" || ch === ";" || ch === "}")) {
      const chunk = text.slice(start, i).trim()
      start = i + 1
      if (ch === "{") continue
      const colon = chunk.indexOf(":")
      if (colon <= 0) continue
      const property = chunk.slice(0, colon).trim()
      if (!/^-?-?[\w-]+$/.test(property)) continue
      out.push({ property, value: chunk.slice(colon + 1).trim() })
    }
  }
  return out
}

/** The token sheet's own definitions are where literals belong; everything else should read them. */
const isTokenDefinition = (sheet: string, property: string) =>
  sheet === "tokens" && property.startsWith("--")
/** Masks draw alpha, not colour: their black is no theme's to change. */
const isMask = (property: string) => /mask/.test(property)

const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|\b(?:white|black)\b/gi
// `calc(var(--x) * 1ms)` is a unit, not a duration.
const TIME = /(?<!\*\s*)(?<![\w.-])(?:\d+\.?\d*|\.\d+)m?s\b|\bcubic-bezier\(/g
const PILL = /\b999px\b/g
const Z = /^-?\d+$/

function count(test: (sheet: string, property: string, value: string) => number) {
  let n = 0
  for (const [sheet, css] of Object.entries(SHEETS))
    for (const { property, value } of declarations(css)) n += test(sheet, property, value)
  return n
}
const matches = (value: string, re: RegExp) => value.match(re)?.length ?? 0

/** Custom properties set from script (`style.setProperty`), which no stylesheet declares. */
function scriptDeclared(): Set<string> {
  const names = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry))
        for (const m of readFileSync(path, "utf8").matchAll(
          /setProperty\(\s*[`"'](--[\w-]+)|[`"';{]\s*(--[\w-]+)\s*:/g,
        ))
          names.add((m[1] ?? m[2])!)
    }
  }
  walk(join(import.meta.dirname, "../src"))
  return names
}

function undefinedReads(prefix: RegExp) {
  const declared = new Set<string>()
  for (const [, css] of Object.entries(SHEETS))
    for (const { property } of declarations(css))
      if (property.startsWith("--")) declared.add(property)
  for (const name of scriptDeclared()) declared.add(name)
  // Public tokens and their old names are a host's to set: reading them undeclared is the point.
  for (const t of TOKENS) declared.add(cssName(t)).add(`--k-${t.name}`)
  for (const name of DEPRECATED.keys()) declared.add(name)
  const missing = new Set<string>()
  for (const css of Object.values(SHEETS))
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g))
      if (prefix.test(m[1]!) && !declared.has(m[1]!)) missing.add(m[1]!)
  return [...missing].sort()
}

const counts = () => ({
  colors: count((sheet, p, v) =>
    isTokenDefinition(sheet, p) || isMask(p) ? 0 : matches(v, COLOR),
  ),
  durations: count((sheet, p, v) => (isTokenDefinition(sheet, p) ? 0 : matches(v, TIME))),
  pills: count((sheet, p, v) => (isTokenDefinition(sheet, p) ? 0 : matches(v, PILL))),
  zIndexes: count((_, p, v) => (p === "z-index" && Z.test(v) ? 1 : 0)),
  undefinedPublic: undefinedReads(/^--k-/).length,
  undefinedPrivate: undefinedReads(/^--(?:_k|_ku|kv|kt)-/).length,
})

/** Today's counts. Lower one when a change brings it down; never raise it. */
const BASELINE = {
  colors: 33,
  durations: 362,
  pills: 15,
  zIndexes: 53,
  undefinedPublic: 48,
  undefinedPrivate: 0,
}

describe("raw values in stylesheets", () => {
  const now = counts()
  for (const key of Object.keys(BASELINE) as (keyof typeof BASELINE)[])
    it(`${key} stays at or under ${BASELINE[key]}`, () => {
      expect(now[key]).toBeLessThanOrEqual(BASELINE[key])
    })
})
