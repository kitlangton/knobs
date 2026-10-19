import { describe, expect, test } from "vitest"
import {
  compareText,
  comparePaths,
  countChanges,
  diffFiles,
  diffFolders,
  diffStats,
  diffBar,
  diffTree,
  fileKey,
  filesUnder,
  matchPath,
  saveViewed,
  stillViewed,
  hunkRows,
  keepFile,
  parsePatch,
  splitPath,
  stepFile,
  type DiffFile,
  type DiffTreeItem,
} from "../src/ui/diff-model"

// `git show` output: the commit's header and message come before the first file.
const SHOW = `commit a5bc1ec82f926e5efcaaa8bae584b07b3fafecf4
Author: Kit Langton <kit.langton@gmail.com>
Date:   Thu Oct 15 22:44:13 2026 -0700

    OptionPicker numbers every row

diff --git a/src/ui/picker-model.ts b/src/ui/picker-model.ts
index 6c035d5..cc2c253 100644
--- a/src/ui/picker-model.ts
+++ b/src/ui/picker-model.ts
@@ -51,8 +51,8 @@ export function askPick(
 export const stillWanted = (ids: readonly string[], wanted: string | null): string | null =>
   wanted !== null && ids.includes(wanted) ? null : wanted
 
-/** The digit an option shows: its place, 1–9; none past the ninth. */
-export const pickDigit = (index: number): string => (index < 9 ? String(index + 1) : "")
+/** The number an option shows: its place, 1, 2, … 12 (only 1–9 are keys that pick). */
+export const pickDigit = (index: number): string => String(index + 1)
 
 /**
  * Whether a key event goes to the picker's digits: a bare 1–9 that nothing focused claimed (a
diff --git a/tests/picker.test.ts b/tests/picker.test.ts
index 12af7f8..9c2e13d 100644
--- a/tests/picker.test.ts
+++ b/tests/picker.test.ts
@@ -18,7 +18,10 @@ describe("option picker", () => {
     expect(digitPick(options, "4")).toBeUndefined()
     expect(digitPick(options, "0")).toBeUndefined()
     expect(pickDigit(0)).toBe("1")
-    expect(pickDigit(9)).toBe("")
+    // Every row is numbered; past 9 the number shows but no digit picks it.
+    expect(pickDigit(9)).toBe("10")
+    expect(pickDigit(11)).toBe("12")
+    expect(digitPick(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], "1")).toBe("A")
   })
   test("↑/↓ step and stop at the ends; Home/End", () => {
     expect(stepPick(options, "A", "ArrowDown")).toBe("B")
diff --git a/src/ui/picker-css.ts b/src/ui/picker-css.ts
index a1dbf70..a16c034 100644
--- a/src/ui/picker-css.ts
+++ b/src/ui/picker-css.ts
@@ -23,3 +23,4 @@ export const pickerCss = \`
 .knobs-picker-head>*{position:relative}
--- a line removed that looks like a header
+++ a line added that looks like a header
+.knobs-picker-key{width:max(17px,calc(2ch + 6px))}
 .knobs-picker-key:empty{visibility:hidden}
-- 
2.39.0
`

const file = (name: string, extra: Partial<DiffFile> = {}): DiffFile => ({
  name,
  change: "change",
  additions: 0,
  deletions: 0,
  ...extra,
})

describe("diff model", () => {
  test("a patch: each file with its counts and its own slice, the message skipped", () => {
    const files = parsePatch(SHOW)
    expect(files.map((f) => [f.name, f.additions, f.deletions])).toEqual([
      ["src/ui/picker-model.ts", 2, 2],
      ["tests/picker.test.ts", 4, 1],
      // Lines inside a hunk that look like ---/+++ headers are the hunk's.
      ["src/ui/picker-css.ts", 2, 1],
    ])
    expect(files[0]!.patch!.startsWith("diff --git a/src/ui/picker-model.ts")).toBe(true)
    expect(
      files[0]!.patch!.endsWith(
        " * Whether a key event goes to the picker's digits: a bare 1–9 that nothing focused claimed (a",
      ),
    ).toBe(true)
    expect(files[1]!.patch).not.toContain("picker-css")
    // A format-patch signature after the last hunk isn't part of it.
    expect(files[2]!.patch!.endsWith(".knobs-picker-key:empty{visibility:hidden}")).toBe(true)
    expect(files.every((f) => f.change === "change")).toBe(true)
  })

  test("new, deleted, renamed and binary files; plain diff -u", () => {
    const patch = [
      "diff --git a/docs/new.md b/docs/new.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/new.md",
      "@@ -0,0 +1,2 @@",
      "+# New",
      "+text",
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-gone",
      "diff --git a/src/a b.ts b/src/c d.ts",
      "similarity index 100%",
      "rename from src/a b.ts",
      "rename to src/c d.ts",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n")
    const files = parsePatch(patch)
    expect(files.map((f) => [f.name, f.change, f.additions, f.deletions])).toEqual([
      ["docs/new.md", "new", 2, 0],
      ["old.txt", "deleted", 0, 1],
      ["src/c d.ts", "rename", 0, 0],
      ["logo.png", "change", 0, 0],
    ])
    expect(files[2]!.prevName).toBe("src/a b.ts")
    expect(files[3]!.binary).toBe(true)

    const plain = parsePatch(
      [
        "--- a.txt\t2026-10-19 10:00:00",
        "+++ a.txt\t2026-10-19 10:01:00",
        "@@ -1,2 +1,2 @@",
        " same",
        "-was",
        "+now",
        "--- b.txt",
        "+++ b.txt",
        "@@ -1 +1,2 @@",
        " one",
        "+two",
      ].join("\n"),
    )
    expect(plain.map((f) => [f.name, f.additions, f.deletions])).toEqual([
      ["a.txt", 1, 1],
      ["b.txt", 1, 0],
    ])
  })

  test("before and after pairs are counted by a shortest edit", () => {
    expect(countChanges("a\nb\nc\n", "a\nb\nc\n")).toEqual({ additions: 0, deletions: 0 })
    expect(countChanges("a\nb\nc\n", "a\nx\nc\n")).toEqual({ additions: 1, deletions: 1 })
    expect(countChanges("a\nb\nc\nd\n", "a\nc\nd\ne\nf\n")).toEqual({ additions: 2, deletions: 1 })
    expect(countChanges("", "one\ntwo\n")).toEqual({ additions: 2, deletions: 0 })
    expect(countChanges("x\ny\n", "")).toEqual({ additions: 0, deletions: 2 })
    // A minimal edit, not a line-by-line one: moving a block costs only the block.
    expect(countChanges("1\n2\n3\n4\n5\n", "4\n5\n1\n2\n3\n")).toEqual({
      additions: 2,
      deletions: 2,
    })
    const files = diffFiles({
      files: [
        { name: "b.ts", before: "x\n", after: "y\n" },
        { name: "a/new.ts", before: "", after: "1\n2\n" },
      ],
    })
    expect(files.map((f) => [f.name, f.change, f.additions, f.deletions])).toEqual([
      ["a/new.ts", "new", 2, 0],
      ["b.ts", "change", 1, 1],
    ])
  })

  test("files sort as a tree shows them: folders first at each level, natural order", () => {
    const names = ["z.ts", "src/z.ts", "src/ui/b.ts", "README.md", "src/a.ts", "a10.ts", "a2.ts"]
    expect([...names].sort(comparePaths)).toEqual([
      "src/ui/b.ts",
      "src/a.ts",
      "src/z.ts",
      "a2.ts",
      "a10.ts",
      "README.md",
      "z.ts",
    ])
    expect(diffFiles({ patch: SHOW }).map((f) => f.name)).toEqual([
      "src/ui/picker-css.ts",
      "src/ui/picker-model.ts",
      "tests/picker.test.ts",
    ])
    expect(diffStats(diffFiles({ patch: SHOW }))).toEqual({ files: 3, additions: 8, deletions: 4 })
    expect(splitPath("src/ui/diff.ts")).toEqual({ dir: "src/ui/", base: "diff.ts" })
    expect(splitPath("README.md")).toEqual({ dir: "", base: "README.md" })
  })

  test("the tree folds single-child folders into one path", () => {
    const tree = diffTree(diffFiles({ patch: SHOW }))
    expect(tree.map((i) => [i.id, i.label])).toEqual([
      ["dir:src/ui", "src/ui"],
      ["dir:tests", "tests"],
    ])
    expect(tree[0]!.children!.map((i) => [i.id, i.label])).toEqual([
      ["src/ui/picker-css.ts", "picker-css.ts"],
      ["src/ui/picker-model.ts", "picker-model.ts"],
    ])
    expect(tree[0]!.children![0]!.file!.additions).toBe(2)

    const deep = diffTree(
      ["src/ui/a.ts", "src/ui/deep/x/y.ts", "src/core/b.ts", "top.ts"].map((n) => file(n)),
    )
    const shape = (items: readonly DiffTreeItem[]): unknown =>
      items.map((i) => (i.children ? { [i.label]: shape(i.children) } : i.label))
    // src holds two folders, so it stays; deep/x has one child, so it joins.
    expect(shape(deep)).toEqual([
      { src: [{ core: ["b.ts"] }, { ui: [{ "deep/x": ["y.ts"] }, "a.ts"] }] },
      "top.ts",
    ])
    expect(diffFolders(deep)).toEqual([
      "dir:src",
      "dir:src/core",
      "dir:src/ui",
      "dir:src/ui/deep/x",
    ])
  })

  test("the file on show stays, or the one now in its place", () => {
    const a = [file("a"), file("b"), file("c")]
    expect(keepFile([], a, undefined)).toBe("a")
    expect(keepFile([], a, "c")).toBe("c")
    expect(keepFile([], a, "missing")).toBe("a")
    expect(keepFile(a, [file("a"), file("c")], "b")).toBe("c")
    expect(keepFile(a, [file("a"), file("b")], "c")).toBe("b")
    expect(keepFile(a, [], "a")).toBeNull()
    expect(stepFile(a, "b", 1)).toBe("c")
    expect(stepFile(a, "c", 1)).toBe("c")
    expect(stepFile(a, "a", -1)).toBe("a")
    expect(stepFile(a, null, -1)).toBe("c")
    expect(stepFile([], "a", 1)).toBeNull()
  })

  test("rows to reserve: from a patch's hunks, or a patch over whole files", () => {
    const [model, test] = parsePatch(SHOW)
    // Three unchanged, two removed beside two added, three unchanged; lines 1–50 left out.
    expect(model!.rows).toEqual({ unified: 10, split: 8, separators: 1 })
    expect(test!.rows).toEqual({ unified: 11, split: 10, separators: 1 })

    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    const changed = lines.map((l, i) => (i === 9 ? "changed" : l))
    const one = compareText(`${lines.join("\n")}\n`, `${changed.join("\n")}\n`)
    expect(one.additions).toBe(1)
    expect(one.deletions).toBe(1)
    // Lines 7–13: three either side of the change; lines 1–6 and 14–20 are separators.
    expect(one.rows).toEqual({ unified: 8, split: 7, separators: 2 })
    // Changes six unchanged lines apart share a hunk; seven apart, they don't.
    const S = 0
    const D = 1
    const A = 2
    expect(hunkRows([D, S, S, S, S, S, S, A])).toEqual({ unified: 8, split: 8, separators: 0 })
    expect(hunkRows([D, S, S, S, S, S, S, S, A])).toEqual({ unified: 8, split: 8, separators: 1 })
    expect(hunkRows([S, S, S, S, D, D, A, S])).toEqual({ unified: 7, split: 6, separators: 1 })
    expect(compareText("", "a\nb\n").rows).toEqual({ unified: 2, split: 2, separators: 0 })
  })

  test("a file's key follows its change", () => {
    const [a, b] = parsePatch(SHOW)
    expect(fileKey(a!)).toBe(fileKey(parsePatch(SHOW)[0]!))
    expect(fileKey(a!)).not.toBe(fileKey(b!))
    expect(fileKey(file("x", { before: "1", after: "2" }))).not.toBe(
      fileKey(file("x", { before: "1", after: "3" })),
    )
  })

  test("the bar, the filter and what stays viewed", () => {
    expect(diffBar(0, 0)).toEqual([0, 0, 5])
    expect(diffBar(2, 1)).toEqual([2, 1, 2])
    expect(diffBar(90, 10)).toEqual([4, 1, 0])
    expect(diffBar(100, 1)).toEqual([4, 1, 0])
    expect(diffBar(0, 40)).toEqual([0, 5, 0])

    expect(matchPath("src/ui/diff.ts", "UI diff")).toBe(true)
    expect(matchPath("src/ui/diff.ts", "ui/d")).toBe(true)
    expect(matchPath("src/ui/diff.ts", "tree")).toBe(false)
    expect(matchPath("src/ui/diff.ts", "  ")).toBe(true)

    const files = parsePatch(SHOW)
    const saved = saveViewed([files[0]!.name, "gone.ts"], files)
    expect(Object.keys(saved)).toEqual([files[0]!.name])
    expect([...stillViewed(saved, files)]).toEqual([files[0]!.name])
    // Its change moved on: it's to look at again.
    const changed = files.map((f, i) => (i === 0 ? { ...f, patch: `${f.patch}\n+more` } : f))
    expect(stillViewed(saved, changed).size).toBe(0)

    const tree = diffTree(files)
    expect(tree.flatMap(filesUnder).sort()).toEqual(files.map((f) => f.name).sort())
  })
})
