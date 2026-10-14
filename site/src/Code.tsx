import { useMemo, useState } from "react"
import { highlight, type Lang } from "./highlight"

/** Strips the shared indentation and the blank first and last lines of a template literal. */
export function dedent(text: string) {
  const lines = text
    .replace(/^\n/, "")
    .replace(/\n\s*$/, "")
    .split("\n")
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length))
  return lines.map((l) => l.slice(indent)).join("\n")
}

export function Code({
  children,
  lang = "ts",
  title,
  copyable = true,
}: {
  children: string
  lang?: Lang
  title?: string
  copyable?: boolean
}) {
  const code = useMemo(() => dedent(children), [children])
  const tokens = useMemo(() => highlight(code, lang), [code, lang])
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }
  return (
    <figure className="code" data-lang={lang}>
      {(title || copyable) && (
        <figcaption>
          <span>{title ?? lang}</span>
          {copyable && (
            <button type="button" onClick={copy} aria-label={`Copy ${title ?? "code"}`}>
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </figcaption>
      )}
      <pre>
        <code>
          {tokens.map(([kind, text], i) =>
            kind === "plain" ? (
              text
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
              <span key={i} className={`t-${kind}`}>
                {text}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  )
}

/** A short inline code span. */
export const C = ({ children }: { children: string }) => <code className="ic">{children}</code>
