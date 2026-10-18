# /// script
# requires-python = ">=3.9"
# dependencies = ["fonttools==4.60.1", "skia-pathops==0.8.0.post2"]
# ///
"""Bake compatible title outlines. Run with `uv run scripts/title-outlines.py --cache <dir>`.

The output is artwork, not a font dependency: all five letters share their contour topology
across faces and weights, so the browser can move one outline instead of layering words.
"""

import argparse
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib.instancer import instantiateVariableFont

REV = "47d54ca1ebb14fd864695f1d39dc734f39017c33"
ROOT = Path(__file__).resolve().parents[1]
FONTS = {
    "sans": ("inter", "Inter[opsz,wght].ttf", {"opsz": 32}),
    "serif": ("fraunces", "Fraunces[SOFT,WONK,opsz,wght].ttf", {"opsz": 96, "SOFT": 0, "WONK": 1}),
    "mono": ("jetbrainsmono", "JetBrainsMono[wght].ttf", {}),
    "wide": ("unbounded", "Unbounded[wght].ttf", {}),
}
WEIGHTS = [100, 400, 650, 900]
WORD = "knobs"


class OutlinePen(BasePen):
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.contours = []
        self.points = []

    def _moveTo(self, p):
        self.points = [p]

    def _lineTo(self, p):
        self.points.append(p)

    def _curveToOne(self, a, b, c):
        p = self.points[-1]
        for i in range(1, 33):
            t = i / 32
            u = 1 - t
            self.points.append(tuple(u**3 * p[j] + 3 * u**2 * t * a[j] + 3 * u * t**2 * b[j] + t**3 * c[j] for j in range(2)))

    def _qCurveToOne(self, a, b):
        p = self.points[-1]
        for i in range(1, 25):
            t = i / 24
            u = 1 - t
            self.points.append(tuple(u * u * p[j] + 2 * u * t * a[j] + t * t * b[j] for j in range(2)))

    def _closePath(self):
        self.contours.append(self.points)
        self.points = []

    _endPath = _closePath


def area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def resample(points, count):
    if area(points) < 0:
        points = list(reversed(points))
    # Every contour starts on the same side of its letter, before the cross-face alignment.
    start = min(range(len(points)), key=lambda i: (round(points[i][1], 3), points[i][0]))
    points = points[start:] + points[:start]
    edges = list(zip(points, points[1:] + points[:1]))
    lengths = [math.dist(a, b) for a, b in edges]
    total = sum(lengths)
    out = []
    edge = 0
    traveled = 0
    for i in range(count):
        at = i * total / count
        while edge < len(edges) - 1 and traveled + lengths[edge] < at:
            traveled += lengths[edge]
            edge += 1
        a, b = edges[edge]
        t = (at - traveled) / lengths[edge] if lengths[edge] else 0
        out.append(tuple(a[j] + (b[j] - a[j]) * t for j in range(2)))
    return out


def normalized(points):
    lo = [min(p[j] for p in points) for j in range(2)]
    span = [max(p[j] for p in points) - lo[j] for j in range(2)]
    return [tuple((p[j] - lo[j]) / max(span[j], 1e-9) for j in range(2)) for p in points]


def align(points, reference):
    a, b = normalized(points), normalized(reference)
    n = len(a)
    shift = min(range(n), key=lambda s: sum((a[(i + s) % n][j] - b[i][j]) ** 2 for i in range(n) for j in range(2)))
    return points[shift:] + points[:shift]


def fetch(cache, folder, filename):
    path = cache / folder / filename
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/google/fonts/{REV}/ofl/{folder}/{urllib.parse.quote(filename)}"
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    return path


def fallback(output):
    letters = output["sans"][2]["letters"]  # Night, weight 650.
    cursor = 0
    paths = []
    left = math.inf
    right = -math.inf
    top = math.inf
    for i, letter in enumerate(letters):
        contours = []
        for points in letter["contours"]:
            left = min(left, min(p[0] + cursor for p in points))
            right = max(right, max(p[0] + cursor for p in points))
            top = min(top, min(p[1] for p in points))
            contours.append("".join(f"{'M' if j == 0 else 'L'}{x + cursor:.4f} {y:.4f}" for j, (x, y) in enumerate(points)) + "Z")
        paths.append(f'<path d="{"".join(contours)}"/>')
        if i < 4:
            ink_right = max(p[0] for p in letter["contours"][0])
            next_left = min(p[0] for p in letters[i + 1]["contours"][0])
            cursor += max(letter["advance"] - 0.05, ink_right - next_left + 0.035)
        else:
            cursor += letter["advance"]
    em = -top / 0.78
    width = right - left
    svg = f'<svg class="mast-vector" aria-hidden="true" fill="currentColor" fill-rule="evenodd" viewBox="{left} {-em} {width} {em}" style="--title-advance:{width / em:.5f}">{"".join(paths)}</svg>'
    html = ROOT / "examples" / "controls.html"
    text = html.read_text()
    text, count = re.subn(r"<!-- title-outline:start -->.*?<!-- title-outline:end -->", f"<!-- title-outline:start -->{svg}<!-- title-outline:end -->", text, flags=re.S)
    if count != 1:
        raise ValueError("Missing title outline markers in controls.html")
    html.write_text(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--fallback-only", action="store_true")
    args = parser.parse_args()
    if args.fallback_only:
        fallback(json.loads((ROOT / "examples" / "site-title-shapes.json").read_text()))
        return
    if args.cache is None:
        parser.error("--cache is required to regenerate font outlines")
    output = {}
    references = None
    for face, (folder, filename, axes) in FONTS.items():
        source = fetch(args.cache, folder, filename)
        font = TTFont(source)
        bounds = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
        masters = []
        for weight in WEIGHTS:
            lo, hi = bounds["wght"]
            instance = instantiateVariableFont(font, {**axes, "wght": min(hi, max(lo, weight))}, inplace=False)
            cmap = instance.getBestCmap()
            # Variable fonts can build a letter from overlapping strokes. Union them before
            # matching contours: those construction seams must not become separate actors.
            removeOverlaps(instance, glyphNames=[cmap[ord(letter)] for letter in WORD])
            glyphs = instance.getGlyphSet()
            em = instance["head"].unitsPerEm
            letters = []
            for index, letter in enumerate(WORD):
                name = cmap[ord(letter)]
                pen = OutlinePen(glyphs)
                glyphs[name].draw(pen)
                contours = [[(x / em, -y / em) for x, y in points] for points in pen.contours]
                contours = sorted((p for p in contours if abs(area(p)) > 1e-7), key=lambda p: -abs(area(p)))
                expected = 2 if letter in "ob" else 1
                if len(contours) != expected:
                    raise ValueError(f"{face} {weight} {letter}: expected {expected} contours, got {len(contours)}")
                paths = []
                for ci, contour in enumerate(contours):
                    points = resample(contour, 192 if ci == 0 else 64)
                    if references is not None:
                        points = align(points, references[index]["contours"][ci])
                    paths.append(points)
                letters.append({"advance": glyphs[name].width / em, "contours": paths})
            if references is None and weight == 400:
                references = letters
            masters.append({"weight": weight, "letters": letters})
        # Align the first sans master too: its reference wasn't available when it was sampled.
        if face == "sans":
            for master in masters:
                for i, letter in enumerate(master["letters"]):
                    letter["contours"] = [align(p, references[i]["contours"][ci]) for ci, p in enumerate(letter["contours"])]
        output[face] = masters
        license_path = ROOT / "examples" / "title-fonts" / f"{folder}-OFL.txt"
        license_path.parent.mkdir(exist_ok=True)
        license_text = fetch(args.cache, folder, "OFL.txt").read_text()
        license_path.write_text("\n".join(line.rstrip() for line in license_text.splitlines()) + "\n")
        print(f"{face}: {source.name}, sha256 {hashlib.sha256(source.read_bytes()).hexdigest()}")

    def rounded(value):
        if isinstance(value, float):
            return round(value, 5)
        if isinstance(value, (list, tuple)):
            return [rounded(v) for v in value]
        if isinstance(value, dict):
            return {k: rounded(v) for k, v in value.items()}
        return value

    target = ROOT / "examples" / "site-title-shapes.json"
    output = rounded(output)
    target.write_text(json.dumps(output, separators=(",", ":")) + "\n")
    fallback(output)
    print(f"Wrote {target.name}: {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
