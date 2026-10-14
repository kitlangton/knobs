`wheel-traces.json` holds real wheel event streams (deltaX, deltaY, ms, deltaMode) recorded by
Felix Leupold for [wheel-gestures](https://github.com/xiel/wheel-gestures) (MIT): macOS trackpad
flicks and pans in Safari, Chrome and Firefox, Chrome on a Windows precision touchpad, and mouse
wheels. `"-0"` is Chrome on Windows marking the fingers lifting.

`kit-traces/` holds Kit's own macOS trackpad gestures in Brave 155 (Chromium), recorded with
`examples/wheel.html`: `[ms, deltaX, deltaY, deltaMode]` per event (newer recordings add Chromium's
`WheelEvent.momentum` as a fifth field). Chromium 151+ marks momentum natively, so these mostly
serve the fallback detection Safari and Firefox still need.
