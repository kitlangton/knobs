import { describe, expect, it } from "vitest"
import { injectStyles } from "../src/panel/styles.js"

/** The panel stylesheet, as injectStyles writes it. */
function stylesheet() {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text += style.textContent) },
  }
  injectStyles(doc as unknown as Document)
  return text
}

/** Splits at commas outside parentheses. */
function splitTop(list: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === "," && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  parts.push(list.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

type Spec = [number, number, number]
const add = (a: Spec, b: Spec): Spec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const compare = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** A selector's specificity, with :where() as zero and :is()/:not() as their most specific argument. */
function specificity(selector: string): Spec {
  let spec: Spec = [0, 0, 0]
  let i = 0
  while (i < selector.length) {
    const rest = selector.slice(i)
    const fn = /^:(where|is|not|has)\(/.exec(rest)
    if (fn) {
      let depth = 1
      let j = fn[0].length
      while (depth > 0 && j < rest.length) {
        if (rest[j] === "(") depth++
        else if (rest[j] === ")") depth--
        j++
      }
      if (fn[1] !== "where") {
        const args = splitTop(rest.slice(fn[0].length, j - 1)).map(specificity)
        spec = add(
          spec,
          args.reduce((m, s) => (compare(s, m) > 0 ? s : m), [0, 0, 0] as Spec),
        )
      }
      i += j
      continue
    }
    const token =
      /^(#[\w-]+|\.[\w-]+|\[[^\]]*\]|::[\w-]+(\([^)]*\))?|:[\w-]+(\([^)]*\))?|[a-zA-Z][\w-]*|\*|.)/.exec(
        rest,
      )![0]
    if (token.startsWith("#")) spec = add(spec, [1, 0, 0])
    else if (token.startsWith(".") || token.startsWith("[")) spec = add(spec, [0, 1, 0])
    else if (token.startsWith("::")) spec = add(spec, [0, 0, 1])
    else if (token.startsWith(":")) spec = add(spec, [0, 1, 0])
    else if (/^[a-zA-Z]/.test(token)) spec = add(spec, [0, 0, 1])
    i += token.length
  }
  return spec
}

/** The innermost rules: each selector with whether all its declarations are !important. */
function rules(css: string) {
  const out: { selector: string; important: boolean }[] = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = m[2]!.split(";").filter((d) => d.trim())
    const important = decls.length > 0 && decls.every((d) => d.includes("!important"))
    for (const selector of splitTop(m[1]!)) out.push({ selector, important })
  }
  return out
}

/** The selector's last compound (what it styles), outside :where()/:is()/:not(). */
function subject(selector: string) {
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (depth === 0 && /[\s>+~]/.test(ch!)) start = i + 1
  }
  return selector.slice(start).replace(/:(where|is|not|has)\((?:[^()]|\([^()]*\))*\)/g, "")
}

describe("panel stylesheet", () => {
  const css = stylesheet()

  it("has the scoped reset at (0,1,1) over kbd", () => {
    const reset = rules(css).find((r) => /:is\([^)]*\bkbd\b/.test(r.selector))
    expect(reset && specificity(reset.selector)).toEqual([0, 1, 1])
  })

  // The hint and option-key badges are <kbd>s: a rule at (0,1,1) or below loses to the reset,
  // which put the digits unstyled in the panel's top-left corner.
  it.each(["knobs-hint", "knobs-optkey", "knobs-optkey-range"])(
    "styles .%s above the scoped reset",
    (name) => {
      const own = rules(css).filter(
        (r) => !r.important && new RegExp(`\\.${name}(?![\\w-])`).test(subject(r.selector)),
      )
      expect(own.length).toBeGreaterThan(0)
      for (const r of own)
        expect(compare(specificity(r.selector), [0, 1, 1]), r.selector).toBeGreaterThan(0)
    },
  )

  // Derived tokens resolve where they're declared: on :root they'd freeze to :root's inputs, so a
  // light panel's accent, a subtree's density or a panel's contrast wouldn't reach them.
  it("declares only the theme's values on :root", () => {
    const root = /:where\(:root,:host\)\{([^}]*)\}/.exec(css)![1]!
    expect(root).toContain("--k-bg:")
    expect(root).not.toMatch(/var\(--_?k-/)
  })

  it("resolves on the knobs root, and the slider handle follows the accent there", () => {
    expect(css).toContain("--_k-fill:var(--k-surface,var(--ku-surface,var(--k-fill,")
    expect(css).toContain("--_k-slider-handle:var(--k-handle,var(--k-slider-handle,var(--_k-accent)))")
  })

  // Components read what the root resolved (or its gliding alias), never a token's public name,
  // so a host's value anywhere reaches them and an old name a host sets still works.
  it("reads no design token by its public or deprecated name", () => {
    const rules = css.slice(css.indexOf(":where(.knobs-panel,.knobs-chip,.knobs-menu){"))
    for (const name of ["--k-text", "--k-surface", "--k-bg", "--k-accent", "--k-line", "--k-label"])
      expect(rules, name).not.toContain(`var(${name})`)
  })

  it("follows the appearance's color-scheme, not a dark default", () => {
    const rules = css.slice(css.indexOf(":where(.knobs-panel,.knobs-chip,.knobs-menu){"))
    expect(rules).not.toMatch(/color-scheme:dark/)
    expect(rules).not.toContain('[data-theme="light"]')
  })

  it("sets density as --k-density alone", () => {
    for (const m of css.matchAll(/\[data-density="\w+"\]\{([^}]*)\}/g))
      expect(m[1]).toMatch(/^--k-density:[\d.]+$/)
  })
})
