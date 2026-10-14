import { Code } from "./Code"

/** The one place install instructions live, so publishing to npm is a one-file change. */
export function Install() {
  return (
    <>
      <p>
        knobs isn't on npm yet; the <code className="ic">knobs</code> name there belongs to an
        unrelated package. Until it's published, build it from source and link it into your app. The
        core has no runtime dependencies, the panel's only one is{" "}
        <code className="ic">@kitlangton/rolling-number</code>, and React and Solid are optional
        peers.
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
