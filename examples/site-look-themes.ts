// The site's looks, in the order the header's knob sweeps through them: three dark, then two
// light, so dark and light meet once. Night is the page as it was. Every token is in every theme;
// grounds follow the knob and inks the polarity (site-look-math.ts).
import type { Theme } from "./site-look-math"

type Ground = "page" | "card" | "night" | "kBg" | "kPage"
type Ink =
  | "surface"
  | "surfaceHi"
  | "line"
  | "text"
  | "label"
  | "dim"
  | "faint"
  | "accent"
  | "pill"
  | "warm"
  | "cool"
  | "kicker"
  | "liftA"
  | "liftB"
  | "kSurface"
  | "kSurfaceHi"
  | "kLine"
  | "kLineHi"
  | "kText"
  | "kLabel"
  | "kDim"
  | "kAccent"
  | "kModified"
  | "kSegBg"
  | "kSegActive"
  | "kToggleTrack"
  | "kToggleThumb"
  | "kRim"
  | "kEdge"
  | "kThumb"
  | "kGroupInk"
type Num =
  /** Panels: corners, how round the round things are (0–1), glass, glow, backdrop tone. */
  | "kRadius"
  | "kPanelRadius"
  | "kRound"
  | "kGlass"
  | "kGlow"
  | "kGlassTone"
  /** 0 a dark panel's drop shadow, 1 a light one's. */
  | "shadow"
  /** The page: stage and control corners, vertical rhythm, rule weight, section headings. */
  | "rStage"
  | "rCtl"
  | "density"
  | "rule"
  | "hWeight"
  | "hTrack"
  | "hSize"
  | "catTrack"
  /** The title: size (em of the masthead), weight, tracking (em), left 0 … centred .5, glow. */
  | "tSize"
  | "tWeight"
  | "tTrack"
  | "tAlign"
  | "tGlow"

export type SiteTheme = Theme<Ground, Ink, Num>

export const THEMES: readonly SiteTheme[] = [
  {
    id: "night",
    name: "Night",
    dark: true,
    font: "sans",
    ground: {
      page: "#101012",
      card: "#1c1c1e",
      night: "#101012",
      kBg: "#1c1c1e",
      kPage: "#101012",
    },
    ink: {
      surface: "rgba(255,255,255,.045)",
      surfaceHi: "rgba(255,255,255,.09)",
      line: "rgba(255,255,255,.075)",
      text: "rgba(255,255,255,.92)",
      label: "rgba(255,255,255,.62)",
      dim: "rgba(255,255,255,.4)",
      faint: "rgba(255,255,255,.16)",
      accent: "#ffffff",
      pill: "rgba(255,255,255,.13)",
      warm: "#ffb35c",
      cool: "#7cc4ff",
      kicker: "rgba(255,255,255,.4)",
      liftA: "rgba(0,0,0,.16)",
      liftB: "rgba(0,0,0,0)",
      kSurface: "rgba(255,255,255,.055)",
      kSurfaceHi: "rgba(255,255,255,.11)",
      kLine: "rgba(255,255,255,.1)",
      kLineHi: "rgba(255,255,255,.18)",
      kText: "rgba(255,255,255,.92)",
      kLabel: "rgba(255,255,255,.64)",
      kDim: "rgba(255,255,255,.42)",
      kAccent: "#ffffff",
      kModified: "rgba(255,255,255,.5)",
      kSegBg: "rgba(0,0,0,.26)",
      kSegActive: "rgba(255,255,255,.11)",
      kToggleTrack: "rgba(255,255,255,.14)",
      kToggleThumb: "#1c1c1e",
      kRim: "rgba(255,255,255,.1)",
      kEdge: "rgba(255,255,255,.07)",
      kThumb: "#ffffff",
      kGroupInk: "rgba(255,255,255,.48)",
    },
    num: {
      kRadius: 8,
      kPanelRadius: 12,
      kRound: 1,
      kGlass: 0.6,
      kGlow: 0.5,
      kGlassTone: 0.5,
      shadow: 0,
      rStage: 16,
      rCtl: 8,
      density: 1,
      rule: 1,
      hWeight: 600,
      hTrack: -0.01,
      hSize: 1,
      catTrack: 0.05,
      tSize: 1,
      tWeight: 650,
      tTrack: -0.05,
      tAlign: 0,
      tGlow: 0,
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    dark: true,
    font: "sans",
    ground: {
      page: "#07131c",
      card: "#0d1f2b",
      night: "#030d15",
      kBg: "#0e2130",
      kPage: "#07131c",
    },
    ink: {
      surface: "rgba(150,220,255,.05)",
      surfaceHi: "rgba(150,220,255,.1)",
      line: "rgba(150,220,255,.09)",
      text: "rgba(226,246,252,.94)",
      label: "rgba(196,232,246,.68)",
      dim: "rgba(170,214,234,.48)",
      faint: "rgba(150,220,255,.18)",
      accent: "#52e3d4",
      pill: "rgba(150,220,255,.14)",
      warm: "#ffc685",
      cool: "#63d8ff",
      kicker: "rgba(82,227,212,.85)",
      liftA: "rgba(0,0,0,.2)",
      liftB: "rgba(0,0,0,0)",
      kSurface: "rgba(150,220,255,.06)",
      kSurfaceHi: "rgba(150,220,255,.12)",
      kLine: "rgba(150,220,255,.1)",
      kLineHi: "rgba(150,220,255,.2)",
      kText: "rgba(228,247,252,.94)",
      kLabel: "rgba(196,232,246,.7)",
      kDim: "rgba(170,214,234,.48)",
      kAccent: "#52e3d4",
      kModified: "rgba(82,227,212,.75)",
      kSegBg: "rgba(0,8,16,.34)",
      kSegActive: "rgba(150,220,255,.14)",
      kToggleTrack: "rgba(150,220,255,.16)",
      kToggleThumb: "#0e2130",
      kRim: "rgba(170,235,255,.14)",
      kEdge: "rgba(150,220,255,.09)",
      kThumb: "#e4f7fc",
      kGroupInk: "rgba(180,225,242,.52)",
    },
    num: {
      kRadius: 12,
      kPanelRadius: 20,
      kRound: 1,
      kGlass: 0.72,
      kGlow: 0.8,
      kGlassTone: 0.5,
      shadow: 0,
      rStage: 26,
      rCtl: 11,
      density: 1.14,
      rule: 1,
      hWeight: 420,
      hTrack: 0.005,
      hSize: 1.04,
      catTrack: 0.12,
      tSize: 1.02,
      tWeight: 200,
      tTrack: -0.02,
      tAlign: 0.5,
      tGlow: 0.3,
    },
  },
  {
    id: "synth",
    name: "Synth",
    dark: true,
    font: "wide",
    ground: {
      page: "#13071f",
      card: "#1f0d32",
      night: "#0c0416",
      kBg: "#211036",
      kPage: "#13071f",
    },
    ink: {
      surface: "rgba(255,120,235,.055)",
      surfaceHi: "rgba(255,120,235,.11)",
      line: "rgba(255,120,235,.14)",
      text: "rgba(253,236,255,.95)",
      label: "rgba(242,202,255,.7)",
      dim: "rgba(222,172,255,.52)",
      faint: "rgba(255,120,235,.24)",
      accent: "#ff4fc4",
      pill: "rgba(255,120,235,.17)",
      warm: "#ffe45c",
      cool: "#3ee8ff",
      kicker: "#3ee8ff",
      liftA: "rgba(0,0,0,.24)",
      liftB: "rgba(255,79,196,.2)",
      kSurface: "rgba(255,120,235,.07)",
      kSurfaceHi: "rgba(255,120,235,.14)",
      kLine: "rgba(255,120,235,.14)",
      kLineHi: "rgba(255,120,235,.26)",
      kText: "rgba(253,236,255,.95)",
      kLabel: "rgba(242,202,255,.72)",
      kDim: "rgba(222,172,255,.52)",
      kAccent: "#ff4fc4",
      kModified: "#3ee8ff",
      kSegBg: "rgba(8,0,20,.42)",
      kSegActive: "rgba(255,120,235,.18)",
      kToggleTrack: "rgba(255,120,235,.2)",
      kToggleThumb: "#fdecff",
      kRim: "rgba(255,170,245,.2)",
      kEdge: "rgba(255,120,235,.16)",
      kThumb: "#ffffff",
      kGroupInk: "rgba(62,232,255,.8)",
    },
    num: {
      kRadius: 6,
      kPanelRadius: 10,
      kRound: 1,
      kGlass: 0.5,
      kGlow: 1.2,
      kGlassTone: 0.45,
      shadow: 0,
      rStage: 12,
      rCtl: 6,
      density: 0.96,
      rule: 1,
      hWeight: 700,
      hTrack: 0.02,
      hSize: 1,
      catTrack: 0.2,
      tSize: 0.64,
      tWeight: 820,
      tTrack: -0.035,
      tAlign: 0.5,
      tGlow: 1,
    },
  },
  {
    id: "brutal",
    name: "Brutal",
    dark: false,
    font: "mono",
    ground: {
      page: "#f1f1ec",
      card: "#ffffff",
      night: "#0b0b0b",
      kBg: "#ffffff",
      kPage: "#f1f1ec",
    },
    ink: {
      surface: "rgba(0,0,0,.05)",
      surfaceHi: "rgba(0,0,0,.1)",
      line: "rgba(10,10,10,.88)",
      text: "#0a0a0a",
      label: "rgba(10,10,10,.76)",
      dim: "rgba(10,10,10,.58)",
      faint: "rgba(10,10,10,.24)",
      accent: "#ff3b00",
      pill: "#ffffff",
      warm: "#e03400",
      cool: "#0040ff",
      kicker: "#cc2f00",
      liftA: "rgba(0,0,0,.25)",
      liftB: "rgba(0,0,0,.7)",
      kSurface: "rgba(0,0,0,.045)",
      kSurfaceHi: "rgba(0,0,0,.09)",
      kLine: "rgba(0,0,0,.16)",
      kLineHi: "rgba(0,0,0,.42)",
      kText: "#0a0a0a",
      kLabel: "rgba(10,10,10,.76)",
      kDim: "rgba(10,10,10,.56)",
      kAccent: "#ff3b00",
      kModified: "#e03400",
      kSegBg: "rgba(0,0,0,.07)",
      kSegActive: "#ffffff",
      kToggleTrack: "rgba(0,0,0,.18)",
      kToggleThumb: "#ffffff",
      kRim: "rgba(255,255,255,0)",
      kEdge: "rgba(10,10,10,.9)",
      kThumb: "#ffffff",
      kGroupInk: "#0a0a0a",
    },
    num: {
      kRadius: 0,
      kPanelRadius: 0,
      kRound: 0,
      kGlass: 0,
      kGlow: 0,
      kGlassTone: 1.08,
      shadow: 1,
      rStage: 0,
      rCtl: 0,
      density: 0.88,
      rule: 2,
      hWeight: 800,
      hTrack: -0.025,
      hSize: 1.06,
      catTrack: 0.14,
      tSize: 0.8,
      tWeight: 800,
      tTrack: -0.07,
      tAlign: 0,
      tGlow: 0,
    },
  },
  {
    id: "paper",
    name: "Paper",
    dark: false,
    font: "serif",
    ground: {
      page: "#f3ecdf",
      card: "#fbf7ef",
      night: "#1b1611",
      kBg: "#fcf8f1",
      kPage: "#f3ecdf",
    },
    ink: {
      surface: "rgba(70,45,20,.05)",
      surfaceHi: "rgba(70,45,20,.09)",
      line: "rgba(70,45,20,.15)",
      text: "#241a11",
      label: "rgba(52,38,25,.76)",
      dim: "rgba(66,48,32,.58)",
      faint: "rgba(70,45,20,.2)",
      accent: "#a8331f",
      pill: "#fffaf2",
      warm: "#b8601c",
      cool: "#2f5e86",
      kicker: "#a8331f",
      liftA: "rgba(60,40,20,.14)",
      liftB: "rgba(60,40,20,.08)",
      kSurface: "rgba(70,45,20,.05)",
      kSurfaceHi: "rgba(70,45,20,.09)",
      kLine: "rgba(70,45,20,.12)",
      kLineHi: "rgba(70,45,20,.24)",
      kText: "#241a11",
      kLabel: "rgba(52,38,25,.74)",
      kDim: "rgba(66,48,32,.56)",
      kAccent: "#a8331f",
      kModified: "#a8331f",
      kSegBg: "rgba(70,45,20,.07)",
      kSegActive: "#fffdf8",
      kToggleTrack: "rgba(70,45,20,.16)",
      kToggleThumb: "#ffffff",
      kRim: "rgba(255,255,255,.7)",
      kEdge: "rgba(70,45,20,.1)",
      kThumb: "#ffffff",
      kGroupInk: "rgba(66,48,32,.58)",
    },
    num: {
      kRadius: 4,
      kPanelRadius: 7,
      kRound: 0.7,
      kGlass: 0.3,
      kGlow: 0.25,
      kGlassTone: 1.08,
      shadow: 1,
      rStage: 6,
      rCtl: 5,
      density: 1.06,
      rule: 1,
      hWeight: 560,
      hTrack: -0.015,
      hSize: 1.08,
      catTrack: 0.16,
      tSize: 1.06,
      tWeight: 360,
      tTrack: -0.04,
      tAlign: 0.5,
      tGlow: 0,
    },
  },
]
