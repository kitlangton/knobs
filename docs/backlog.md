# Backlog

## Native Swift (held until Hex or another Mac app picks it up)

The plan agreed with Hex (Oct 15 2026), in order:

1. **Freeze protocol v1.**
   - The app dials the Mac's tune server over a WebSocket and sends `ControlDescriptor[]` (`src/core/remote.ts`).
   - Messages: `welcome`, `set`, `setValues`, `resetAll`, `randomize`, `undoRoll`, `preset`, `panel`, `hide` and `slowmo`.
   - Write it up as a spec, with shared JSON fixtures that both the TypeScript and Swift tests run.
2. **Extract `KnobsKit`** (Swift package, iOS and macOS). The source is opencode-ios `OpenCode/Tuning/`:
   - `Tunable`, `TunableSpring`, `TuningStore` and the protocol client in `TuningRemote` are almost Foundation-only;
   - the overlay, panel, gestures and `AnimationTimeScale` stay iOS-specific.
   - `Package.swift` sits at the repo root, with the sources in `swift/`.
   - opencode-ios moving onto the package is its own session's call.
3. **Move the tune server** (`scripts/tune-server.ts`, `tune-shared.ts`, `tune-page/` in opencode-ios) into a `packages/tune-server` workspace. That makes the repo a small Bun monorepo: `packages/knobs`, `packages/tune-server`, `site/`.
4. **Mac apps go remote first:** they register tunables and tune from the knobs web page.
5. **In-app panel:** in debug builds, a floating `NSPanel` hosting the knobs web panel in a `WKWebView`, which gives the full look for about a day's work.
6. **A native SwiftUI/Metal knobs panel.**
   - It's not far from the WebGPU renderer: the same instanced SDF prims (`src/panel/gpu/shader.wgsl.ts` ports to MSL almost line for line), the glyph atlas from Core Text, and the same springs (`src/core/spring.ts`).
   - Layout comes from a SwiftUI or AppKit host, which hands rects to the Metal layer, the way the GPU renderer reads the DOM's layout today.
   - Aim for parity with the WebGPU panel; the costly parts are rolling digits, preset morphs, hint mode and the Esc/R scope ladder.
