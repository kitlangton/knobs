// The hero: one dial seen from above, lying on a soft field of light. The dial is a height field
// (a low dome, a rounded bevel, a knurled rim and the indicator's dimple), shaded as clear glass
// (refracting the field and its ticks with a little dispersion), spun aluminium (a highlight that
// fans along the light's direction over concentric grain) or obsidian, blended while the material
// morphs. Round it, a 270° ring of ticks lights up to the dial's angle. The field is three slow
// pools of colour and the dial's own shadow (with a caustic under glass). Turning fast, the dial
// renders up to twelve instants across Argon's shutter and averages them; at rest four sub-pixel
// samples anti-alias it, and the field outside it is one sample per pixel.
//
// Lengths are CSS px (y down, z toward the viewer).
// u.v[0]  dial centre, radius, angle (rad, 0 up, clockwise)
// u.v[1]  angle travelled in a shutter, samples, lit fraction of the ring (0–1), tone (0 dark, 1 light)
// u.v[2]  key light direction, drift clock (s)
// u.v[3]  material weights: glass, metal, obsidian; field energy
// u.v[4]  colour A (linear)
// u.v[5]  colour B (linear)
// u.v[6]  colour C (linear)
// u.v[7]  page colour (linear)

const TOP = 0.2;
const DOME = 0.018;
const SB = 0.83;
const BB = 0.17;
const KNURL = 0.011;
const N_KNURL = 72.0;
const SI = 0.64;
const RI = 0.06;
const TICKS = 41.0;
const ARC = 2.35619449;

fn sq(x: f32) -> f32 {
  return x * x;
}

fn indicatorAt(rot: f32) -> vec2f {
  return SI * vec2f(sin(rot), -cos(rot));
}

/** The dial's height above the floor at q (from its centre), px. */
fn height(q: vec2f, rot: f32) -> f32 {
  let R = u.v[0].z;
  let s = length(q) / R;
  if (s >= 1.0) {
    return 0.0;
  }
  var h = TOP + DOME * (1.0 - s * s);
  let e = max(s - SB, 0.0);
  h -= BB - sqrt(max(BB * BB - e * e, 0.0));
  let a = atan2(q.x, -q.y) - rot;
  h += KNURL * smoothstep(0.885, 0.935, s) * (0.5 - 0.5 * cos(a * N_KNURL));
  let d = length(q / R - indicatorAt(rot));
  if (d < RI) {
    h -= 0.022 * (1.0 - sq(d / RI));
  }
  return h * R;
}

fn normalAt(q: vec2f, rot: f32) -> vec3f {
  let e = 0.6;
  let hx = height(q + vec2f(e, 0.0), rot) - height(q - vec2f(e, 0.0), rot);
  let hy = height(q + vec2f(0.0, e), rot) - height(q - vec2f(0.0, e), rot);
  return normalize(vec3f(-hx / (2.0 * e), -hy / (2.0 * e), 1.0));
}

fn gauss(d: vec2f, s: f32) -> f32 {
  return exp(-dot(d, d) / (s * s));
}

/** The field of light and its ticks, before the dial's shadow. */
fn field(q: vec2f) -> vec3f {
  let R = u.v[0].z;
  let t = u.v[2].w;
  let tone = u.v[1].w;
  let page = u.v[7].rgb;
  let cA = u.v[4].rgb;
  let cB = u.v[5].rgb;
  let cC = u.v[6].rgb;
  let k = q / R;
  let gA = gauss(k - vec2f(-1.55, -0.5) - 0.24 * vec2f(sin(t * 0.13), cos(t * 0.11)), 1.55);
  let gB = gauss(k - vec2f(1.65, 0.3) - 0.24 * vec2f(cos(t * 0.09 + 1.0), sin(t * 0.12 + 2.0)), 1.7);
  let gC = gauss(k - vec2f(0.1, 1.3) - 0.22 * vec2f(sin(t * 0.1 + 4.0), cos(t * 0.07 + 1.0)), 1.45);
  let halo = gauss(k, 1.25);
  // The pools fade out before the hero's edges, so it meets the top bar and the page below
  // in the page's own colour.
  let size = u.frame.xy / u.frame.z;
  let p = q + u.v[0].xy;
  let edge = smoothstep(0.0, 0.16 * size.y, p.y) * smoothstep(0.0, 0.3 * size.y, size.y - p.y) *
    smoothstep(0.0, 0.14 * size.x, p.x) * smoothstep(0.0, 0.14 * size.x, size.x - p.x);
  let energy = u.v[3].w * edge;
  let glow = (cA * (gA + 0.55 * halo) + cB * gB + cC * gC) * energy;
  // Dark: light added to the page. Light: the page tinted toward each pool's hue.
  let dark = page + glow * 0.46;
  let tint = glow / max(max(glow.r, max(glow.g, glow.b)), 1e-4);
  let amount = sat(max(glow.r, max(glow.g, glow.b)) * 1.6);
  let light = page * mix(vec3f(1.0), 0.35 + 0.65 * tint, amount * 0.55);
  var col = mix(dark, light, tone);

  // The ring of ticks, lit up to the dial's angle.
  let r = length(q);
  let a = atan2(q.x, -q.y);
  if (r > 1.15 * R && r < 1.37 * R && abs(a) < ARC + 0.06) {
    let stp = 2.0 * ARC / (TICKS - 1.0);
    let i = clamp(round((a + ARC) / stp), 0.0, TICKS - 1.0);
    let major = i - 5.0 * floor(i / 5.0) < 0.5;
    let ac = -ARC + i * stp;
    let r0 = 1.2 * R;
    let r1 = select(1.28 * R, 1.33 * R, major);
    let across = r * abs(sin(a - ac));
    let along = max(max(r0 - r, r - r1), 0.0);
    let d = length(vec2f(across, along)) - select(0.75, 1.15, major);
    let cov = 1.0 - smoothstep(-0.6, 0.6, d);
    let lit = sat(u.v[1].z * TICKS - i);
    let off = mix(vec3f(0.05), page * 0.55, tone);
    let on = mix(cA * 3.2 + vec3f(0.05), cA * 0.9, tone);
    col = mix(col, mix(off, on, lit), cov);
    col += cA * lit * exp(-max(d, 0.0) / 3.5) * 0.12 * (1.0 - tone);
  }
  return col;
}

/** The floor: the field under the dial's shadow, with a caustic where it's glass. */
fn floorAt(q: vec2f) -> vec3f {
  let R = u.v[0].z;
  let l = u.v[2].xyz;
  let w = u.v[3].xyz;
  var col = field(q);
  let r = length(q);
  if (r > 2.2 * R) {
    return col;
  }
  let o = -l.xy / max(l.z, 0.35) * (TOP * R);
  let ds = length(q - o) - R;
  let pen = 0.2 * R;
  let sh = 1.0 - smoothstep(-pen, pen * 1.4, ds);
  let contact = exp(-max(r - R, 0.0) / (0.045 * R));
  let opaque = w.y + w.z;
  let dark = sh * (0.7 * opaque + 0.22 * w.x) + contact * (0.4 * opaque + 0.15 * w.x);
  col *= 1.0 - min(dark, 0.92);
  // Glass focuses the light into a ring just inside its shadow.
  let caustic = exp(-sq((ds + 0.12 * R) / (0.06 * R))) * w.x;
  col += (vec3f(0.5) + u.v[4].rgb * 0.8) * caustic * mix(0.3, 0.18, u.v[1].w);
  return col;
}

fn ggx(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l);
  let nh = max(dot(n, h), 0.0);
  let a2 = rough * rough * rough * rough;
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * dd * dd) / (4.0 * max(dot(n, v), 0.2)) * max(dot(n, l), 0.0);
}

/** What a reflection sees: a soft studio with the key's softbox above, the floor near the horizon. */
fn env(r: vec3f, q: vec2f) -> vec3f {
  let l = u.v[2].xyz;
  let tone = u.v[1].w;
  let kl = max(dot(r, l), 0.0);
  let studio = mix(vec3f(0.02), vec3f(0.62), tone) * (0.45 + 0.55 * sat(r.z));
  var c = studio + vec3f(pow(kl, 28.0) * 3.2 + pow(kl, 5.0) * 0.22);
  if (r.z < 0.4) {
    let dirOut = r.xy / max(length(r.xy), 1e-3);
    c = mix(floorAt(q + dirOut * u.v[0].z * (0.18 + 0.4 * (1.0 - r.z))), c, sat(r.z / 0.4));
  }
  return c;
}

fn shadeGlass(q: vec2f, n: vec3f, h: f32) -> vec3f {
  let v = vec3f(0.0, 0.0, 1.0);
  let fr = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  let depth = h * 1.7 + 0.08 * u.v[0].z;
  var refr = vec3f(0.0);
  for (var c = 0; c < 3; c++) {
    let t = refract(-v, n, 1.0 / (1.46 + 0.025 * f32(c)));
    let at = floorAt(q + t.xy / max(-t.z, 0.25) * depth);
    refr[c] = at[c];
  }
  let tint = u.v[4].rgb / max(max(u.v[4].r, max(u.v[4].g, u.v[4].b)), 1e-4);
  refr *= mix(vec3f(1.0), tint, 0.1);
  let l = u.v[2].xyz;
  return mix(refr, env(reflect(-v, n), q), fr) + vec3f(ggx(n, v, l, 0.07) * 2.4);
}

fn shadeMetal(q: vec2f, n: vec3f) -> vec3f {
  let R = u.v[0].z;
  let v = vec3f(0.0, 0.0, 1.0);
  let l = u.v[2].xyz;
  let tone = u.v[1].w;
  let r = length(q);
  let radial = q / max(r, 1e-3);
  // Spun aluminium: concentric grain, and a highlight that fans out along the light's direction.
  let hv = normalize(l + v);
  let al = abs(dot(radial, normalize(hv.xy + vec2f(1e-4, 0.0))));
  let streak = pow(al, 22.0) * 0.85 + pow(al, 3.0) * 0.1;
  let grain = hash12(vec2f(floor(r * 1.6), 7.0)) - 0.5;
  let base = mix(vec3f(0.2, 0.205, 0.215), vec3f(0.34, 0.345, 0.355), tone);
  let ndl = max(dot(n, l), 0.0);
  let brushed = base * (0.55 + 0.45 * ndl) * (1.0 + 0.16 * grain) + vec3f(streak * (1.0 + 0.4 * grain));
  // The bevel and the knurl are polished: mirrors of the room and the field.
  let polished = env(reflect(-v, n), q) * vec3f(0.9, 0.91, 0.93) + vec3f(ggx(n, v, l, 0.12) * 1.6);
  let topW = 1.0 - smoothstep(0.8, 0.84, r / R);
  return mix(polished, brushed, topW);
}

fn shadeObsidian(q: vec2f, n: vec3f) -> vec3f {
  let v = vec3f(0.0, 0.0, 1.0);
  let fr = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  let l = u.v[2].xyz;
  return vec3f(0.004) + env(reflect(-v, n), q) * fr + vec3f(ggx(n, v, l, 0.06) * 1.8);
}

fn dial(q: vec2f, rot: f32) -> vec3f {
  let R = u.v[0].z;
  let w = u.v[3].xyz;
  let n = normalAt(q, rot);
  let h = height(q, rot);
  var col = vec3f(0.0);
  if (w.x > 0.002) {
    col += w.x * shadeGlass(q, n, h);
  }
  if (w.y > 0.002) {
    col += w.y * shadeMetal(q, n);
  }
  if (w.z > 0.002) {
    col += w.z * shadeObsidian(q, n);
  }
  col /= max(w.x + w.y + w.z, 1e-3);
  // The indicator: a lit bead in its dimple.
  let d = length(q / R - indicatorAt(rot)) / RI;
  let bead = 1.0 - smoothstep(0.45, 0.7, d);
  let tone = u.v[1].w;
  col = mix(col, mix(u.v[4].rgb * 4.0 + vec3f(0.2), u.v[4].rgb * 1.2 + vec3f(0.05), tone), bead);
  return col;
}

fn scene(px: vec2f) -> vec3f {
  let dpr = u.frame.z;
  let q0 = px / dpr - u.v[0].xy;
  let R = u.v[0].z;
  if (length(q0) > R + 1.5) {
    return floorAt(q0);
  }
  let n = max(i32(u.v[1].y), 1);
  let rot = u.v[0].w;
  let moving = u.v[1].x != 0.0;
  let j = hash12(px);
  var c = vec3f(0.0);
  var ws = 0.0;
  for (var i = 0; i < n; i++) {
    let fi = f32(i);
    // Sub-pixel offsets on a golden-angle spiral; instants stratified across the shutter.
    let ang = fi * 2.39996 + j * 6.2831853;
    let off = vec2f(cos(ang), sin(ang)) * sqrt((fi + 0.5) / f32(n)) * 0.5 / dpr;
    var tau = 0.0;
    var w = 1.0;
    if (moving) {
      tau = (fi + 0.5 + (hash12(px.yx + fi) - 0.5) * 0.6) / f32(n) - 0.5;
      w = 0.64 + 0.36 * cos(tau * 6.2831853);
    }
    let q = q0 + off;
    if (length(q) >= R) {
      c += w * floorAt(q);
    } else {
      c += w * dial(q, rot + u.v[1].x * tau);
    }
    ws += w;
  }
  return c / ws;
}
