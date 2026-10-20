// Writes the README's token table from the schema, between its tokens:start and tokens:end marks.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { knobs } from "../src/themes/knobs"
import { tokensTable } from "../src/tokens/css"

const path = resolve(import.meta.dirname, "../README.md")
const readme = readFileSync(path, "utf8")
const next = readme.replace(
  /(<!-- tokens:start -->\n)[\s\S]*?(<!-- tokens:end -->)/,
  (_, start: string, end: string) => `${start}\n${tokensTable(knobs)}\n${end}`,
)
if (next !== readme) writeFileSync(path, next)
