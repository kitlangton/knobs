// Code diffs apart from the DOM and the renderer: a unified patch (one file or many) or before and
// after pairs as a list of files with their counts, in the order a file tree shows them; the
// tree's items, with single-child folders folded into one path; and which file stays selected as
// the list changes.

/** A file as before and after text. */
export interface DiffSource {
  /** Its path, which is its id. */
  readonly name: string
  readonly before: string
  readonly after: string
  /** A Shiki language id, when the extension doesn't say. */
  readonly lang?: string
}

/** What a diff takes: a unified patch (`git diff`, `git show`, one file or many) or pairs. */
export interface DiffInput {
  readonly patch?: string
  readonly files?: readonly DiffSource[]
}

export type DiffChange = "change" | "new" | "deleted" | "rename"

export interface DiffFile {
  /** Its path after the change (before it, for a deleted file): the file's id. */
  readonly name: string
  /** Its path before a rename. */
  readonly prevName?: string
  readonly change: DiffChange
  readonly additions: number
  readonly deletions: number
  readonly binary?: boolean
  /** Its own part of the patch, headers and hunks. */
  readonly patch?: string
  readonly before?: string
  readonly after?: string
  readonly lang?: string
  /** The rows its diff takes once drawn (see `DiffRows`). */
  readonly rows?: DiffRows
}

/**
 * How tall a file's diff is once drawn, in rows: each layout's lines (`split` pairs a removed
 * line with an added one) and the separators that stand for unchanged lines between hunks. A
 * card reserves this much before the renderer has loaded, so nothing jumps when it does.
 */
export interface DiffRows {
  readonly unified: number
  readonly split: number
  readonly separators: number
}

/** The context lines a patch made from before and after text keeps around each change. */
export const DIFF_CONTEXT = 3

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/

/** A header path without its quotes, `a/` or `b/` prefix, or a trailing timestamp. */
function cleanPath(raw: string): string | null {
  let s = raw.replace(/\r$/, "")
  const tab = s.indexOf("\t")
  if (tab >= 0) s = s.slice(0, tab)
  s = s.trim()
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) s = s.slice(1, -1)
  if (s === "/dev/null") return null
  return s.replace(/^[ab]\//, "")
}

/** The paths on a `diff --git a/x b/y` line (the same path twice unless it moved). */
function gitPaths(rest: string): [string, string] | null {
  // Unchanged names make the line symmetric, which holds even with spaces in the path.
  const half = (rest.length - 1) / 2
  if (Number.isInteger(half)) {
    const a = rest.slice(0, half)
    const b = rest.slice(half + 1)
    if (a.slice(2) === b.slice(2)) return [cleanPath(a) ?? "", cleanPath(b) ?? ""]
  }
  const m = /^"?a\/(.+?)"? "?b\/(.+?)"?$/.exec(rest)
  return m ? [m[1]!, m[2]!] : null
}

interface Draft {
  start: number
  end: number
  git?: [string, string]
  from?: string | null
  to?: string | null
  renameFrom?: string
  renameTo?: string
  change: DiffChange
  additions: number
  deletions: number
  binary: boolean
  hunks: boolean
  unified: number
  split: number
  separators: number
  /** Where the last hunk ended in the old file, to tell whether the next one runs on. */
  oldEnd: number
  blockAdd: number
  blockDel: number
}

/**
 * The files in a unified patch, in its order, with lines added and removed counted from the
 * hunks. Takes `git diff`, `git show` and `format-patch` output (anything before the first
 * file, a commit's header and message, is skipped) and plain `diff -u` output.
 */
export function parsePatch(patch: string): DiffFile[] {
  const lines = patch.split("\n")
  const drafts: Draft[] = []
  // A run of removed and added lines takes the longer side's rows when split.
  const flush = (d: Draft) => {
    d.split += Math.max(d.blockAdd, d.blockDel)
    d.blockAdd = d.blockDel = 0
  }
  let cur: Draft | undefined
  let oldLeft = 0
  let newLeft = 0
  const open = (start: number) => {
    cur = {
      start,
      end: start,
      change: "change",
      additions: 0,
      deletions: 0,
      binary: false,
      hunks: false,
      unified: 0,
      split: 0,
      separators: 0,
      oldEnd: 1,
      blockAdd: 0,
      blockDel: 0,
    }
    drafts.push(cur)
    oldLeft = newLeft = 0
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // Inside a hunk, every line until its counts run out is the hunk's.
    if (cur && (oldLeft > 0 || newLeft > 0)) {
      const c = line[0]
      if (c === "+") {
        cur.additions++
        cur.blockAdd++
        cur.unified++
        newLeft--
      } else if (c === "-") {
        cur.deletions++
        cur.blockDel++
        cur.unified++
        oldLeft--
      } else if (c === "\\") {
        // "\ No newline at end of file"
      } else {
        flush(cur)
        cur.unified++
        cur.split++
        oldLeft--
        newLeft--
      }
      if (oldLeft <= 0 && newLeft <= 0) flush(cur)
      cur.end = i
      continue
    }
    if (line.startsWith("diff --git ")) {
      open(i)
      cur!.git = gitPaths(line.slice(11).replace(/\r$/, "")) ?? undefined
      continue
    }
    // A plain unified diff: `--- x` then `+++ y`, starting a file unless a git header just did.
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) {
      if (!cur || cur.hunks || cur.from !== undefined) open(i)
      cur!.from = cleanPath(line.slice(4))
      cur!.to = cleanPath(lines[i + 1]!.slice(4))
      if (cur!.from === null) cur!.change = "new"
      else if (cur!.to === null) cur!.change = "deleted"
      cur!.end = ++i
      continue
    }
    if (!cur) continue
    const hunk = HUNK.exec(line)
    if (hunk) {
      const oldStart = Number(hunk[1])
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2])
      newLeft = hunk[3] === undefined ? 1 : Number(hunk[3])
      // Unchanged lines before it (none for a new file's, which starts at 0) show as a separator.
      if (oldStart > cur.oldEnd) cur.separators++
      cur.oldEnd = oldStart + oldLeft
      cur.hunks = true
      cur.end = i
      continue
    }
    if (cur.hunks) continue
    const header = line.replace(/\r$/, "")
    if (header.startsWith("new file mode")) cur.change = "new"
    else if (header.startsWith("deleted file mode")) cur.change = "deleted"
    else if (header.startsWith("rename from ")) cur.renameFrom = header.slice(12)
    else if (header.startsWith("rename to ")) cur.renameTo = header.slice(10)
    else if (header.startsWith("Binary files ") || header === "GIT binary patch") cur.binary = true
    else if (
      !/^(old mode|new mode|similarity index|dissimilarity index|index |copy from|copy to)/.test(
        header,
      )
    )
      continue
    cur.end = i
  }
  return drafts.map((d) => {
    const after = d.renameTo ?? d.to ?? d.git?.[1]
    const before = d.renameFrom ?? d.from ?? d.git?.[0]
    const name = (d.change === "deleted" ? before : after) ?? before ?? "untitled"
    const moved = before && after && before !== after ? before : undefined
    const change: DiffChange = d.change === "change" && moved ? "rename" : d.change
    return {
      name,
      ...(moved ? { prevName: moved } : {}),
      change,
      additions: d.additions,
      deletions: d.deletions,
      ...(d.binary ? { binary: true } : {}),
      patch: lines.slice(d.start, d.end + 1).join("\n"),
      rows: { unified: d.unified, split: d.split, separators: d.separators },
    }
  })
}

/** Lines one side has that the other doesn't, by a shortest edit (Myers), as a patch counts them. */
export function countChanges(
  before: string,
  after: string,
): { additions: number; deletions: number } {
  const { additions, deletions } = compareText(before, after)
  return { additions, deletions }
}

/** What a patch made from before and after text would show: its counts and its rows. */
export function compareText(
  before: string,
  after: string,
  context = DIFF_CONTEXT,
): { additions: number; deletions: number; rows: DiffRows } {
  const a = splitLines(before)
  const b = splitLines(after)
  let lo = 0
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++
  let ea = a.length
  let eb = b.length
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--
    eb--
  }
  const middle = editScript(a.slice(lo, ea), b.slice(lo, eb), 1500)
  if (!middle) {
    // Too far apart to walk: count the lines each side has more of, and guess the rows.
    const seen = new Map<string, number>()
    for (let i = lo; i < ea; i++) seen.set(a[i]!, (seen.get(a[i]!) ?? 0) + 1)
    let common = 0
    for (let j = lo; j < eb; j++) {
      const k = seen.get(b[j]!) ?? 0
      if (k > 0) {
        common++
        seen.set(b[j]!, k - 1)
      }
    }
    const additions = eb - lo - common
    const deletions = ea - lo - common
    return {
      additions,
      deletions,
      rows: {
        unified: additions + deletions + 2 * context,
        split: Math.max(additions, deletions) + 2 * context,
        separators: 1,
      },
    }
  }
  const ops = new Uint8Array(lo + middle.length + (a.length - ea))
  ops.set(middle, lo)
  let additions = 0
  let deletions = 0
  for (const op of middle) {
    if (op === ADD) additions++
    else if (op === DEL) deletions++
  }
  return { additions, deletions, rows: hunkRows(ops, context) }
}

const SAME = 0
const DEL = 1
const ADD = 2

const splitLines = (text: string) => {
  if (text === "") return []
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
}

/** A shortest edit from `a` to `b` (Myers) as one op per line, or undefined past `max` edits. */
function editScript(
  a: readonly string[],
  b: readonly string[],
  max: number,
): Uint8Array | undefined {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return new Uint8Array(n + m).fill(n ? DEL : ADD)
  const offset = n + m + 1
  const v = new Int32Array(2 * offset + 1)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= Math.min(max, n + m); d++) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) found = d
      if (found >= 0) break
    }
    trace.push(v.slice(offset - d, offset + d + 1))
    if (found >= 0) break
  }
  if (found < 0) return undefined
  const out: number[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const prev = trace[d - 1]!
    const at = (k: number) => prev[k + d - 1]!
    const k = x - y
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1))
    const pk = down ? k + 1 : k - 1
    const px = at(pk)
    const py = px - pk
    const sx = down ? px : px + 1
    while (x > sx) {
      out.push(SAME)
      x--
      y--
    }
    out.push(down ? ADD : DEL)
    x = px
    y = py
  }
  while (x > 0) {
    out.push(SAME)
    x--
  }
  return Uint8Array.from(out.reverse())
}

/**
 * The rows of a patch over whole files: changes with `context` unchanged lines around them,
 * changes no more than twice that apart in one hunk, and a separator for each run of
 * unchanged lines left out (before, between and after the hunks).
 */
export function hunkRows(ops: ArrayLike<number>, context = DIFF_CONTEXT): DiffRows {
  const changes: number[] = []
  for (let i = 0; i < ops.length; i++) if (ops[i] !== SAME) changes.push(i)
  if (changes.length === 0) return { unified: 0, split: 0, separators: 0 }
  let unified = 0
  let split = 0
  let separators = 0
  let i = 0
  let lastEnd = 0
  while (i < changes.length) {
    let j = i
    while (j + 1 < changes.length && changes[j + 1]! - changes[j]! - 1 <= 2 * context) j++
    const start = Math.max(0, changes[i]! - context)
    const end = Math.min(ops.length, changes[j]! + context + 1)
    if (start > lastEnd) separators++
    let add = 0
    let del = 0
    for (let k = start; k < end; k++) {
      const op = ops[k]
      if (op === SAME) {
        split += Math.max(add, del) + 1
        add = del = 0
      } else if (op === ADD) add++
      else del++
    }
    split += Math.max(add, del)
    unified += end - start
    lastEnd = end
    i = j + 1
  }
  if (lastEnd < ops.length) separators++
  return { unified, split, separators }
}

/**
 * A fingerprint of a file's change (its part of the patch, or its before and after text), so a
 * file marked viewed comes back unviewed once its diff changes.
 */
export function fileKey(file: DiffFile): string {
  const text = file.patch ?? `${file.before ?? ""}\u0000${file.after ?? ""}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Orders paths as a file tree shows them: at each level folders first, then files, each by
 * name (natural order, so `file2` comes before `file10`).
 */
export function comparePaths(a: string, b: string): number {
  const pa = a.split("/")
  const pb = b.split("/")
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const dirA = i < pa.length - 1
    const dirB = i < pb.length - 1
    if (dirA !== dirB) return dirA ? -1 : 1
    const c = pa[i]!.localeCompare(pb[i]!, undefined, { numeric: true, sensitivity: "base" })
    if (c !== 0) return c
  }
  return pa.length - pb.length
}

/** A diff's files in tree order, counted: from the patch, or from each pair's text. */
export function diffFiles(input: DiffInput): DiffFile[] {
  const files: DiffFile[] = input.patch
    ? parsePatch(input.patch)
    : (input.files ?? []).map((f) => ({
        name: f.name,
        change:
          f.before === "" && f.after !== ""
            ? "new"
            : f.after === "" && f.before !== ""
              ? "deleted"
              : "change",
        ...compareText(f.before, f.after),
        before: f.before,
        after: f.after,
        ...(f.lang ? { lang: f.lang } : {}),
      }))
  return files.sort((a, b) => comparePaths(a.name, b.name))
}

/** Lines added and removed across the files. */
export function diffStats(files: readonly DiffFile[]): {
  files: number
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const f of files) {
    additions += f.additions
    deletions += f.deletions
  }
  return { files: files.length, additions, deletions }
}

/** A path as the folder it's in and its own name. */
export function splitPath(name: string): { dir: string; base: string } {
  const at = name.lastIndexOf("/")
  return at < 0 ? { dir: "", base: name } : { dir: name.slice(0, at + 1), base: name.slice(at + 1) }
}

/** A row of a diff's file tree: a folder (one or more path segments) or a file. */
export interface DiffTreeItem {
  /** A file's name, or `dir:` and a folder's path. */
  readonly id: string
  readonly label: string
  /** The folder's path, or the file's. */
  readonly path: string
  readonly file?: DiffFile
  readonly children?: readonly DiffTreeItem[]
}

/**
 * The files as tree items: folders hold what's in them, and a folder whose only child is a
 * folder joins it (`src` › `ui` is one row, `src/ui`), so short trees stay flat.
 */
export function diffTree(files: readonly DiffFile[]): DiffTreeItem[] {
  interface Dir {
    dirs: Map<string, Dir>
    files: DiffFile[]
  }
  const root: Dir = { dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.name.split("/")
    let at = root
    for (const p of parts.slice(0, -1)) {
      let next = at.dirs.get(p)
      if (!next) {
        next = { dirs: new Map(), files: [] }
        at.dirs.set(p, next)
      }
      at = next
    }
    at.files.push(f)
  }
  const build = (dir: Dir, prefix: string): DiffTreeItem[] => {
    const out: DiffTreeItem[] = []
    for (const [name, sub] of dir.dirs) {
      let label = name
      let node = sub
      while (node.files.length === 0 && node.dirs.size === 1) {
        const [child, next] = [...node.dirs][0]!
        label += `/${child}`
        node = next
      }
      const path = prefix + label
      out.push({ id: `dir:${path}`, label, path, children: build(node, `${path}/`) })
    }
    for (const f of dir.files)
      out.push({ id: f.name, label: splitPath(f.name).base, path: f.name, file: f })
    return out.sort((a, b) => {
      if (Boolean(a.children) !== Boolean(b.children)) return a.children ? -1 : 1
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
    })
  }
  return build(root, "")
}

/** Every folder's id in a diff tree (to open them all). */
export function diffFolders(items: readonly DiffTreeItem[]): string[] {
  return items.flatMap((i) => (i.children ? [i.id, ...diffFolders(i.children)] : []))
}

/**
 * Which file to show once the list changes: the same one if it's still there; else the one now
 * where it was (the next, or the last); else the first. Null with no files.
 */
export function keepFile(
  prev: readonly DiffFile[],
  next: readonly DiffFile[],
  current: string | null | undefined,
): string | null {
  if (next.length === 0) return null
  if (current != null && next.some((f) => f.name === current)) return current
  const at = current == null ? -1 : prev.findIndex((f) => f.name === current)
  if (at < 0) return next[0]!.name
  return next[Math.min(at, next.length - 1)]!.name
}

/** The file before or after `current`, stopping at the ends. */
export function stepFile(
  files: readonly DiffFile[],
  current: string | null | undefined,
  dir: -1 | 1,
): string | null {
  if (files.length === 0) return null
  const at = files.findIndex((f) => f.name === current)
  if (at < 0) return files[dir > 0 ? 0 : files.length - 1]!.name
  return files[Math.max(0, Math.min(files.length - 1, at + dir))]!.name
}

/**
 * A change as a bar of `cells` squares, as GitHub draws one: how many show added, how many
 * removed and how many neither. A change smaller than the bar fills one square a line; each side
 * that has lines keeps at least one.
 */
export function diffBar(additions: number, deletions: number, cells = 5): [number, number, number] {
  const total = additions + deletions
  if (total <= 0) return [0, 0, cells]
  const filled = Math.min(cells, total)
  let add = Math.round((filled * additions) / total)
  if (additions > 0 && add === 0) add = 1
  if (deletions > 0 && add === filled && filled > 1) add = filled - 1
  return [add, filled - add, cells - filled]
}

/** Whether a path has every word of a query in it, any case: `ui diff` finds `src/ui/diff.ts`. */
export function matchPath(path: string, query: string): boolean {
  const p = path.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => p.includes(word))
}

/** The files still viewed: those saved viewed whose change is the one saved (see `fileKey`). */
export function stillViewed(
  saved: Readonly<Record<string, string>>,
  files: readonly DiffFile[],
): Set<string> {
  const out = new Set<string>()
  for (const f of files) if (saved[f.name] === fileKey(f)) out.add(f.name)
  return out
}

/** What to save for the files viewed: each one's name and the key of its change. */
export function saveViewed(
  viewed: Iterable<string>,
  files: readonly DiffFile[],
): Record<string, string> {
  const byName = new Map(files.map((f) => [f.name, f]))
  const out: Record<string, string> = {}
  for (const name of viewed) {
    const f = byName.get(name)
    if (f) out[name] = fileKey(f)
  }
  return out
}

/** The files under a tree item (itself, for a file). */
export function filesUnder(item: DiffTreeItem): string[] {
  if (item.file) return [item.file.name]
  return (item.children ?? []).flatMap(filesUnder)
}
