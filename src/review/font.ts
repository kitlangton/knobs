import { FONT } from "./foundations.js"
import { defineTheme, type Theme } from "../themes/define.js"
import { reviewTheme } from "../themes/review.js"

export interface ReviewFontOptions {
  /** A stylesheet that declares the face (Google Fonts, rsms.me/inter, your own). */
  readonly href?: string
  /** The family, first in the stack: `"Inter"`, `"Geist"`. The platform's face follows it. */
  readonly sans?: string
  readonly mono?: string
}

const quote = (family: string) =>
  /\s/.test(family) && !/^["']/.test(family) ? `"${family}"` : family

/**
 * The review look in a webfont: loads `href` once per document and returns the review theme with
 * `sans` (and `mono`) first in its stacks. Pass it as `theme`.
 */
export function reviewFont(doc: Document, options: ReviewFontOptions): Theme {
  const { href, sans, mono } = options
  if (href && !doc.querySelector(`link[data-knobs-font="${CSS.escape(href)}"]`)) {
    const link = doc.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.dataset.knobsFont = href
    doc.head.append(link)
  }
  const slug = `${sans ?? ""}-${mono ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return defineTheme({
    name: `review${slug.replace(/-+$/, "")}`,
    extends: reviewTheme,
    font: {
      ...(sans ? { sans: `${quote(sans)},${FONT.sans}` } : {}),
      ...(mono ? { mono: `${quote(mono)},${FONT.mono}` } : {}),
    },
  })
}
