import { Code } from "./Code"

/** The one place install instructions live, so publishing to npm is a one-file change. */
export function Install() {
  return (
    <>
      <p>
        knobs isn't on npm yet, and the <code className="ic">knobs</code> name there belongs to
        another package, so build it from source and link it. React and Solid are optional.
      </p>
      <Code lang="sh" title="Terminal">{`
        git clone https://github.com/kitlangton/knobs
        cd knobs && bun install && bun run build && bun link

        # then, in your app
        bun link knobs
      `}</Code>
    </>
  )
}
