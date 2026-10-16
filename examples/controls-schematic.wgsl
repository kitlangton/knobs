// The hero's other face: a schematic of the same six twins, drawn as a tactical display on the
// desk plane in the hardware's own perspective, so each instrument sits where its twin does and
// the same hands work it. Vector rules in the accent, emerald and vermilion on the page's dark;
// a hex lattice lit by the spot (Spot moves the pool, Shadow widens and softens it, Key light
// sets how bright), a gauge for the key, a finish selector of three cells, a power glyph for the
// LEDs (off: the display drops to standby), a radar plot for the spot, a hue ring for the accent,
// a meter for the shadow, and an oscilloscope whose wave is as soft as the light. Lines keep a
// constant screen width, anti-aliased by their footprint on the plane. 2D, one pass, cheap.
//
// u.v[0]  principal point (px), focal (px), power (the LEDs, 0–1)
// u.v[1]  camera, key light (0–1)
// u.v[2]  right, shadow (0–1)
// u.v[3]  up, the key gauge's angle
// u.v[4]  forward, the selector's angle
// u.v[5]  accent (linear, brightest channel 1), the hue ring's turn
// u.v[6]  finish weights (matte, brushed, anodised), the switch (0 off – 1 on)
// u.v[7]  spot (0–1, 0–1), reveal (0–1), time (s)
// u.v[8]  each row's glow: key, finish, LEDs, spot
// u.v[9]  accent's, shadow's
// u.v[10] the composition's centre on screen (px), its reach left and right (px)
// u.v[11] its reach up and down (px)
// u.v[12] page colour (linear)

const K = vec2f(-1.85, -0.8);
const S = vec2f(0.0, -0.8);
const T = vec2f(1.85, -0.8);
const F = vec2f(-1.9, 0.95);
const J = vec2f(0.0, 0.95);
const C = vec2f(1.85, 0.95);
const FADER_L = 0.72;
const ARC = 2.35619449;
const TAU = 6.28318531;

/** Desk units per device pixel here. */
var<private> pw: f32;

fn angOf(q: vec2f) -> f32 {
  return atan2(q.x, -q.y);
}
fn polar(r: f32, a: f32) -> vec2f {
  return r * vec2f(sin(a), -cos(a));
}
/** A rule `w` device pixels wide along a distance (desk units). */
fn rule(d: f32, w: f32) -> f32 {
  let ww = max(w, 1.0);
  return sat(0.5 * ww + 0.5 - abs(d) / pw) * min(w, 1.0);
}
/** Inside a shape (signed distance), anti-aliased. */
fn fill(d: f32) -> f32 {
  return sat(0.5 - d / pw);
}
fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = sat(dot(pa, ba) / dot(ba, ba));
  return length(pa - ba * h);
}
fn box(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}
/** A flat-topped hexagon of inradius r. */
fn hexagon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var q = abs(p.yx);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2f(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}
/** The nearest cell of a hex grid of size s: (offset from its centre, its id). */
fn hexCell(p: vec2f, s: f32) -> vec4f {
  let r = vec2f(1.0, 1.7320508);
  let h = r * 0.5;
  let a = (p / s) - r * floor((p / s) / r) - h;
  let b = (p / s) - h - r * floor(((p / s) - h) / r) - h;
  var g = b;
  if (dot(a, a) < dot(b, b)) {
    g = a;
  }
  let id = (p / s) - g;
  return vec4f(g * s, id);
}
fn oklabToLinear(lab: vec3f) -> vec3f {
  let l = pow(lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z, 3.0);
  let m = pow(lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z, 3.0);
  let s = pow(lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z, 3.0);
  return max(vec3f(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ), vec3f(0.0));
}

/** The wave on the scope at x: sharp-cornered under a small light, a sine under a big one. */
fn wave(x: f32) -> f32 {
  let sharp = mix(9.0, 0.6, u.v[2].w);
  let t = u.v[7].w;
  let s = sin(x * 7.0 - t * 2.4) + 0.35 * sin(x * 17.0 + t * 1.3);
  return tanh(sharp * s) / tanh(sharp * 1.35);
}

/** Everything the display draws (light over the dark) at a point on the desk. */
fn display(w: vec2f) -> vec3f {
  let t = u.v[7].w;
  let k = u.v[1].w;
  let sh = u.v[2].w;
  let acc = u.v[5].rgb;
  let emerald = vec3f(0.06, 1.0, 0.42);
  let crimson = vec3f(1.0, 0.05, 0.1);
  let bone = vec3f(0.82, 0.84, 0.88);
  let fin = u.v[6].xyz;
  let lit = 0.45 + 0.55 * k;
  var col = vec3f(0.0);

  // ── The frame: chamfered, with registration marks, a ruler and its corner brackets ──
  let fc = vec2f(0.0, 0.07);
  let fh = vec2f(2.86, 1.86);
  let fq = abs(w - fc) - fh;
  let chamfer = max(box(w - fc, fh), (fq.x + fq.y + 0.14) * 0.7071);
  col += acc * 0.32 * rule(chamfer, 1.0);
  let inner = box(w - fc, fh - vec2f(0.05));
  let corner = step(fh.x - 0.4, abs(w.x - fc.x)) * step(fh.y - 0.3, abs(w.y - fc.y));
  col += bone * 0.4 * rule(inner, 1.0) * corner;
  for (var i = 0; i < 4; i++) {
    let sx = select(-1.0, 1.0, (i & 1) == 1);
    let sz = select(-1.0, 1.0, (i & 2) == 2);
    let rc = w - fc - vec2f(sx * (fh.x + 0.16), sz * (fh.y + 0.12));
    if (max(abs(rc.x), abs(rc.y)) < 0.08) {
      let cross = max(rule(rc.x, 1.0) * step(abs(rc.y), 0.06), rule(rc.y, 1.0) * step(abs(rc.x), 0.06));
      col += bone * 0.45 * max(cross, rule(length(rc) - 0.025, 1.0));
    }
  }
  let topZ = fc.y - fh.y;
  if (w.y > topZ && w.y < topZ + 0.1 && abs(w.x) < 2.5) {
    let i = round(w.x / 0.1);
    let major = abs(i - 5.0 * round(i / 5.0)) < 0.5;
    let len = select(0.035, 0.07, major);
    col += bone * 0.3 * rule(w.x - i * 0.1, 1.0) * step(w.y - topZ, len);
  }

  // ── The lattice, lit where the spot falls ──
  let spot = vec2f(-3.2 + 6.4 * u.v[7].x, -2.4 + 5.2 * u.v[7].y);
  let size = mix(0.7, 2.1, sh);
  let pd = length(w - spot);
  let pool = exp(-sq(pd / size) * mix(3.2, 1.4, sh));
  // Clear round each instrument, so they read.
  var clear = length(w - K) - 1.08;
  clear = min(clear, length(w - S) - 0.72);
  clear = min(clear, length(w - T) - 0.5);
  clear = min(clear, box(w - J, vec2f(0.66)));
  clear = min(clear, length(w - C) - 0.86);
  clear = min(clear, box(w - F, vec2f(0.42, FADER_L + 0.14)));
  clear = min(clear, box(w - vec2f(0.0, 0.14), vec2f(1.02, 0.24)));
  let inFrame = step(box(w - fc, fh - vec2f(0.1)), 0.0);
  if (inFrame > 0.0 && clear > 0.0) {
    let hs = 0.095;
    let hc = hexCell(w, hs);
    let cellC = w - hc.xy;
    let hsh = hash12(hc.zw + 17.0);
    let dOut = hexagon(hc.xy, hs * 0.43);
    let dIn = hexagon(hc.xy, hs * 0.3);
    let poolC = exp(-sq(length(cellC - spot) / size) * mix(3.2, 1.4, sh));
    let room = smoothstep(0.0, 0.08, clear);
    // Matte: emerald rules; brushed: bone, with a scan line; anodised: cells filled in the accent.
    var rim = emerald * fin.x + bone * 0.7 * fin.y + acc * fin.z;
    let ripple = 0.5 + 0.5 * sin(length(cellC - spot) * 9.0 - t * 2.2 + hsh * 1.5);
    let bright = (0.035 + 1.1 * poolC * k * (0.7 + 0.3 * ripple)) * room;
    col += rim * bright * rule(dOut, 1.0);
    col += acc * bright * 0.6 * rule(dIn, 1.0) * step(0.55, hsh);
    col += acc * bright * 0.35 * fin.z * fill(dIn);
    col += bone * bright * 0.5 * fin.y * rule(fract(w.y / 0.024) - 0.5, 1.0) * step(dOut, 0.0) * step(0.7, hsh);
    if (hsh > 0.93) {
      col += mix(acc, crimson, step(0.975, hsh)) * 1.4 * bright * fill(box(hc.xy, vec2f(0.012)));
    }
  }

  // ── Traces: the signal chain, top row and bottom, with packets running along them ──
  var tr = 1e9;
  tr = min(tr, segment(w, K + vec2f(1.0, 0.0), S - vec2f(0.68, 0.0)));
  tr = min(tr, segment(w, S + vec2f(0.68, 0.0), T - vec2f(0.46, 0.0)));
  tr = min(tr, segment(w, T + vec2f(0.0, 0.46), vec2f(T.x, 0.1)));
  tr = min(tr, segment(w, vec2f(T.x, 0.1), vec2f(C.x, C.y - 0.82)));
  tr = min(tr, segment(w, F + vec2f(0.44, 0.0), J - vec2f(0.68, 0.0)));
  tr = min(tr, segment(w, J + vec2f(0.68, 0.0), C - vec2f(0.84, 0.0)));
  col += acc * 0.42 * rule(tr, 1.0);
  // Packets: a bright bead every so often, flowing left to right (down the verticals).
  let flow = fract((w.x + w.y) * 0.9 - t * 0.55);
  col += acc * 1.6 * u.v[0].w * smoothstep(0.96, 1.0, flow) * rule(tr, 3.0);

  // ── Key light: a 270° gauge ──
  var q = w - K;
  var r = length(q);
  if (r < 1.1) {
    let a = angOf(q);
    let onArc = step(abs(a), ARC);
    col += acc * 0.45 * rule(r - 1.0, 1.0) * onArc;
    // 25 segments, lit up to the value.
    let stp = 2.0 * ARC / 24.0;
    let i = clamp(round((a + ARC) / stp), 0.0, 24.0);
    let seg = rule((a - (-ARC + i * stp)) * r, 3.0) * step(0.8, r) * step(r, 0.93) * onArc;
    let on = step(i, k * 24.0 + 0.01);
    col += mix(acc * 0.12, acc * 1.9, on) * seg;
    // An inner ring of fine ticks, a lit wave travelling round it.
    let fine = rule(fract((a + PI) / TAU * 72.0) - 0.5, 1.0) * step(0.66, r) * step(r, 0.71);
    let crest = 0.5 + 0.5 * sin(a * 3.0 - t * 1.8);
    col += emerald * (0.18 + 0.9 * crest * crest) * fine;
    col += bone * 0.35 * rule(r - 0.64, 1.0);
    // The needle and its hub.
    let needle = segment(q, polar(0.12, u.v[3].w), polar(0.6, u.v[3].w));
    col += acc * 1.8 * rule(needle, 2.0);
    col += bone * 0.6 * rule(r - 0.08, 1.0);
    // A marker outside, riding the value.
    let mk = polar(1.06, u.v[3].w);
    col += crimson * 1.3 * fill(length(q - mk) - 0.028);
  }

  // ── Finish: three cells, the chosen one filled ──
  q = w - S;
  r = length(q);
  if (r < 0.72) {
    col += bone * 0.3 * rule(r - 0.62, 1.0);
    for (var j = 0; j < 3; j++) {
      let a0 = f32(j - 1) * 0.7;
      let c = polar(0.42, a0);
      let d = hexagon((q - c).yx, 0.1);
      col += acc * (0.5 + 0.9 * fin[j]) * rule(d, 1.0);
      col += acc * 0.9 * fin[j] * fill(hexagon((q - c).yx, 0.07));
    }
    col += acc * 1.5 * rule(segment(q, vec2f(0.0), polar(0.28, u.v[4].w)), 2.0);
    col += bone * 0.5 * rule(r - 0.06, 1.0);
  }

  // ── LEDs: the power glyph, emerald on, vermilion off ──
  q = w - T;
  r = length(q);
  if (r < 0.5) {
    let on = u.v[6].w;
    let glyph = mix(crimson * 1.1, emerald * 1.5, on);
    let a = angOf(q);
    let ring = rule(r - 0.2, 2.0) * step(0.55, abs(a));
    let bar = rule(segment(q, vec2f(0.0, -0.06), vec2f(0.0, -0.27)), 2.0);
    col += glyph * max(ring, bar);
    let dash = step(0.5, fract(a / TAU * 24.0 + t * 0.15 * on));
    col += bone * 0.3 * rule(r - 0.36, 1.0) * dash;
  }

  // ── Spot: a radar plot, the light where it's been sent ──
  q = w - J;
  if (max(abs(q.x), abs(q.y)) < 0.66) {
    let b = box(q, vec2f(0.6));
    col += acc * 0.35 * rule(b, 1.0);
    let br = step(0.45, abs(q.x)) * step(0.45, abs(q.y));
    col += acc * 1.1 * rule(b, 2.0) * br;
    let g = abs(fract(q / 0.3 + 0.5) - 0.5) * 0.3;
    col += bone * 0.12 * (rule(g.x, 1.0) + rule(g.y, 1.0)) * step(b, 0.0);
    // The sweep, its trail fading behind it.
    let sa = fract(t * 0.25) * TAU;
    let behind = fract((sa - angOf(q)) / TAU);
    col += emerald * 0.22 * exp(-behind * 9.0) * step(length(q), 0.6) * step(b, 0.0);
    col += emerald * 0.7 * rule(segment(q, vec2f(0.0), polar(0.6, sa)), 1.0) * step(b, 0.0);
    // The reticle: crosshairs to the edges, a ring, a blip when the sweep passes.
    let rp = (u.v[7].xy - 0.5) * 1.2;
    let rq = q - rp;
    col += acc * 0.45 * (rule(rq.x, 1.0) + rule(rq.y, 1.0)) * step(b, 0.0) * step(0.1, length(rq));
    col += acc * 1.7 * rule(length(rq) - 0.07, 2.0);
    let ping = exp(-fract((sa - angOf(rp)) / TAU) * 5.0);
    col += acc * (0.6 + 2.0 * ping) * fill(length(rq) - 0.022);
  }

  // ── Accent: a ring of hues turning to put the accent at twelve ──
  q = w - C;
  r = length(q);
  if (r < 0.86) {
    let a = angOf(q);
    let hue = a - u.v[5].w;
    let hc = oklabToLinear(vec3f(0.78, 0.15 * cos(hue), 0.15 * sin(hue)));
    let cells = step(0.12, abs(fract(a / TAU * 36.0) - 0.5) * 2.0);
    col += hc * 1.3 * cells * step(0.6, r) * step(r, 0.7);
    col += bone * 0.3 * (rule(r - 0.58, 1.0) + rule(r - 0.72, 1.0));
    // The marker at twelve, pointing in.
    let mq = q - vec2f(0.0, -0.8);
    let tri = max(abs(mq.x) * 0.866 + mq.y * 0.5, -mq.y) - 0.025;
    col += bone * 1.2 * fill(tri);
    col += acc * 0.35 * rule(r - 0.42, 1.0);
    col += acc * 1.2 * fill(r - 0.14);
    col += acc * 0.6 * rule(r - 0.2, 1.0);
  }

  // ── Shadow: a meter, filled to the value ──
  q = w - F;
  if (abs(q.x) < 0.42 && abs(q.y) < FADER_L + 0.14) {
    let capZ = FADER_L - 2.0 * FADER_L * sh;
    col += bone * 0.3 * rule(q.x, 1.0) * step(abs(q.y), FADER_L);
    let bar = box(q - vec2f(0.0, (capZ + FADER_L) * 0.5), vec2f(0.03, max((FADER_L - capZ) * 0.5, 0.0)));
    col += acc * 1.1 * fill(bar);
    let i = round((q.y + FADER_L) / (FADER_L / 4.0));
    let major = abs(i - 2.0 * round(i / 2.0)) < 0.5;
    let tick = rule(q.y + FADER_L - i * FADER_L / 4.0, 1.0) * step(0.12, abs(q.x)) *
      step(abs(q.x), select(0.22, 0.32, major)) * step(abs(q.y), FADER_L + 0.01);
    col += bone * 0.45 * tick;
    col += acc * 1.8 * rule(q.y - capZ, 2.0) * step(abs(q.x), 0.36);
    let tq = vec2f(abs(q.x) - 0.4, q.y - capZ);
    col += acc * 1.5 * fill(max(tq.x * 0.5 + abs(tq.y) * 0.866 - 0.02, -tq.x - 0.02));
  }

  // ── The scope: the light's softness, as a wave; its height, the key ──
  q = w - vec2f(0.0, 0.14);
  if (abs(q.x) < 0.98 && abs(q.y) < 0.2) {
    let b = box(q, vec2f(0.95, 0.17));
    col += acc * 0.3 * rule(b, 1.0);
    col += bone * 0.1 * rule(q.y, 1.0) * step(b, 0.0);
    let gx = abs(fract(q.x / 0.19 + 0.5) - 0.5) * 0.19;
    col += bone * 0.1 * rule(gx, 1.0) * step(b, 0.0);
    let amp = 0.03 + 0.11 * k;
    let y = -amp * wave(q.x);
    let dy = (-amp * wave(q.x + 0.004) - y) / 0.004;
    let d = (q.y - y) / sqrt(1.0 + dy * dy);
    let fadeX = smoothstep(0.95, 0.85, abs(q.x));
    col += acc * 1.7 * rule(d, 1.5) * fadeX;
    col += acc * 0.25 * exp(-abs(d) / (pw * 6.0)) * fadeX;
    // A ghost of the trace a moment ago, in emerald.
    let y2 = -amp * 0.85 * wave(q.x - 0.25);
    col += emerald * 0.25 * rule(q.y - y2, 1.0) * fadeX;
  }

  // Each instrument brightens with its row's glow (hovered, focused, in hand).
  let g0 = u.v[8];
  let g1 = u.v[9];
  var glow = g0.x * exp(-max(length(w - K) - 1.0, 0.0) / 0.1);
  glow = max(glow, g0.y * exp(-max(length(w - S) - 0.62, 0.0) / 0.1));
  glow = max(glow, g0.z * exp(-max(length(w - T) - 0.4, 0.0) / 0.1));
  glow = max(glow, g0.w * exp(-max(box(w - J, vec2f(0.6)), 0.0) / 0.1));
  glow = max(glow, g1.x * exp(-max(length(w - C) - 0.75, 0.0) / 0.1));
  glow = max(glow, g1.y * exp(-max(box(w - F, vec2f(0.36, FADER_L)), 0.0) / 0.1));
  col *= lit * (1.0 + 0.6 * glow);

  // The LEDs off: standby. Everything but the power glyph drops to a dim grey.
  let power = u.v[0].w;
  let grey = vec3f(dot(col, vec3f(0.2126, 0.7152, 0.0722))) * 0.22;
  var out = mix(grey, col, power);
  if (length(w - T) < 0.5) {
    out = max(out, col * (1.0 - power));
  }
  return out;
}

fn sq(x: f32) -> f32 {
  return x * x;
}

fn scene(px: vec2f) -> vec3f {
  let dpr = u.frame.z;
  let p = px / dpr;
  let page = u.v[12].rgb;
  // The ray through this pixel, onto the desk (y = 0).
  let cam = u.v[1].xyz;
  let d = p - u.v[0].xy;
  let rd = normalize(d.x * u.v[2].xyz - d.y * u.v[3].xyz + u.v[0].z * u.v[4].xyz);
  let tt = -cam.y / min(rd.y, -1e-3);
  let w = (cam + rd * tt).xz;
  pw = tt / (u.v[0].z * dpr) / sqrt(max(-rd.y, 0.2));
  // Drawn on from the middle out as it arrives.
  let reveal = u.v[7].z;
  let shown = smoothstep(reveal * 4.8 - 0.5, reveal * 4.8, length(w - vec2f(0.0, 0.07)));
  var col = display(w) * (1.0 - shown);
  // Every edge of the frame is the page colour, as for the hardware.
  let size = u.frame.xy / dpr;
  var edge = smoothstep(0.0, 48.0, p.x) * smoothstep(0.0, 48.0, size.x - p.x) *
    smoothstep(0.0, 0.08 * size.y, p.y) * smoothstep(0.0, 0.1 * size.y, size.y - p.y);
  let dc = p - u.v[10].xy;
  let reach = vec2f(select(u.v[10].w, u.v[10].z, dc.x < 0.0), select(u.v[11].y, u.v[11].x, dc.y < 0.0));
  edge *= 1.0 - smoothstep(0.75, 1.0, length(dc / max(reach, vec2f(1.0))));
  return page + col * edge;
}
