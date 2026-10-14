// A small regex highlighter: enough grammar for the snippets on this site, with no dependency.
export type Lang = "ts" | "tsx" | "css" | "sh" | "swift" | "text"
export type Token = readonly [kind: string, text: string]

const jsKeywords =
  "import|export|from|const|let|var|function|return|if|else|for|of|in|new|await|async|type|interface|extends|typeof|as|default|class|true|false|null|undefined|void|satisfies|while|break|case|switch"
const swiftKeywords =
  "import|let|var|func|struct|class|enum|return|if|else|for|in|true|false|nil|some|static|private|public|init|self|case|switch|guard"

const rules: Record<Exclude<Lang, "text">, [kind: string, pattern: string][]> = {
  ts: [
    ["comment", String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
    ["string", String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\``],
    ["keyword", String.raw`\b(?:${jsKeywords})\b`],
    ["number", String.raw`\b\d+(?:\.\d+)?\b`],
    ["type", String.raw`\b[A-Z][A-Za-z0-9]*\b`],
    ["fn", String.raw`\b[a-z_$][\w$]*(?=\s*\()`],
    ["prop", String.raw`\b[a-z_$][\w$]*(?=\??:\s)`],
    ["punct", String.raw`=>|[{}()[\];,.<>/=:?|&+*-]`],
  ],
  tsx: [],
  css: [
    ["comment", String.raw`\/\*[\s\S]*?\*\/`],
    ["string", String.raw`"[^"\n]*"`],
    ["prop", String.raw`--[\w-]+(?=\s*:)|\b[a-z-]+(?=\s*:)`],
    ["keyword", String.raw`--[\w-]+|@[\w-]+|:root|:where`],
    ["number", String.raw`-?\b\d*\.?\d+(?:px|ms|em|rem|ch|%|s|deg)?\b`],
    ["fn", String.raw`\b[a-z-]+(?=\()`],
    ["punct", String.raw`[{}();:,]`],
  ],
  sh: [
    ["comment", String.raw`#[^\n]*`],
    ["string", String.raw`"[^"\n]*"|'[^'\n]*'`],
    ["fn", String.raw`(?<=^|\n|&& )\s*[a-z][\w.-]*`],
    ["keyword", String.raw`\s--?[\w-]+`],
  ],
  swift: [
    ["comment", String.raw`\/\/[^\n]*`],
    ["string", String.raw`"(?:[^"\\\n]|\\.)*"`],
    ["keyword", String.raw`\b(?:${swiftKeywords})\b`],
    ["number", String.raw`\b\d+(?:\.\d+)?\b`],
    ["type", String.raw`\b[A-Z][A-Za-z0-9]*\b`],
    ["fn", String.raw`\.?\b[a-z_][\w]*(?=\s*\()`],
    ["punct", String.raw`[{}()[\];,.<>=:]`],
  ],
}
rules.tsx = [
  ["comment", String.raw`\{?\/\*[\s\S]*?\*\/\}?|\/\/[^\n]*`],
  ["tag", String.raw`<\/?[A-Za-z][\w.]*|\/?>`],
  ...rules.ts.slice(1),
]

const compiled = new Map<Lang, RegExp>()
function grammar(lang: Exclude<Lang, "text">) {
  let re = compiled.get(lang)
  if (!re) {
    re = new RegExp(rules[lang].map(([, p]) => `(${p})`).join("|"), "g")
    compiled.set(lang, re)
  }
  return re
}

export function highlight(code: string, lang: Lang): Token[] {
  if (lang === "text") return [["plain", code]]
  const out: Token[] = []
  const kinds = rules[lang].map(([kind]) => kind)
  let last = 0
  for (const match of code.matchAll(grammar(lang))) {
    const index = match.index ?? 0
    if (index > last) out.push(["plain", code.slice(last, index)])
    const group = match.findIndex((m, i) => i > 0 && m !== undefined)
    out.push([kinds[group - 1] ?? "plain", match[0]])
    last = index + match[0].length
  }
  if (last < code.length) out.push(["plain", code.slice(last)])
  return out
}
