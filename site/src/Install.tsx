import { Code } from "./Code"

/** The one place install instructions live, so publishing to npm is a one-file change. */
export function Install() {
  return (
    <>
      <p>
        knobs isn't published to npm yet. The repository is public at{" "}
        <a href="https://github.com/kitlangton/knobs">github.com/kitlangton/knobs</a>: build it from
        source and depend on it by path. React and Solid are optional.
      </p>
      <Code lang="sh" title="Terminal">{`
        git clone https://github.com/kitlangton/knobs
        cd knobs && bun install && bun run build

        # then, in your app's package.json: "knobs": "file:../knobs"
        bun install
      `}</Code>
    </>
  )
}
