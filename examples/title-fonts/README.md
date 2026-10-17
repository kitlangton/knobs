# Title outlines

The masthead morphs one outline per letter. The artwork in `site-title-shapes.json`
comes from Inter, Fraunces, JetBrains Mono and Unbounded, all under the SIL Open
Font License. Their notices are retained here. No font files are shipped or loaded.

Regenerate with:

```sh
uv run scripts/title-outlines.py --cache /path/to/font-cache
```

The generator pins Google Fonts revision
`47d54ca1ebb14fd864695f1d39dc734f39017c33`. It normalizes contour direction and
correspondence, and bakes four weight masters. Outer contours have 192 points;
the counters in `o` and `b` have 64. Every face uses lowercase letters, so each
letter keeps its identity and the same number of counters during a morph.
