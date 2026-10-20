import { describe, expect, test } from "vitest";
import { icon, ICON_NAMES } from "../src/ui/icons";

describe("icons", () => {
  test("one set, one weight: every glyph a single Phosphor path on the 256 grid, in currentColor", () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('fill="currentColor"');
      expect(svg.match(/<path /g)).toHaveLength(1);
      expect(svg).toMatch(/d="M[\d.,\-a-zA-Z ]+"/);
    }
    expect(icon("x")).toContain('width="16"');
    expect(icon("x", { small: true })).toContain('width="12"');
  });
});
