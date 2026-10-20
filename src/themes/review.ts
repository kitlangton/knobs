import { defineTheme } from "./define.js"
import { voidTheme } from "./void.js"

/**
 * The review pieces' own look (walkthrough, compare, player, diff, facts, decision): Void's true
 * black, flat and neutral, with hairlines you can see. Borders are alpha of the text colour, set
 * by APCA on the page: subtle ≈ Lc 9, default ≈ Lc 12, strong ≈ Lc 17, in both appearances
 * (Void's composited 6% and 10% read Lc 0 on black). Fills step 6 / 10 / 14% so a hover's
 * background is plain to see. Light is white, page and surface alike.
 */
export const reviewTheme = defineTheme({
  name: "review",
  extends: voidTheme,
  tokens: {
    dark: {
      fill: "#ededed0f",
      "fill-hover": "#ededed1a",
      "fill-selected": "#ededed24",
      "border-subtle": "#ededed47",
      border: "#ededed4f",
      "border-strong": "#585858",
    },
    light: {
      "bg-page": "#ffffff",
      "bg-inset": "#f7f7f7",
      bg: "#ffffff",
      "bg-raised": "#ffffff",
      "bg-overlay": "#ffffff",
      fill: "#1919190a",
      "fill-hover": "#19191912",
      "fill-selected": "#1919191c",
      "border-subtle": "#19191917",
      border: "#1919191d",
      "border-strong": "#dcdcdc",
    },
  },
})
