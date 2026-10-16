// The hero: a matte-black faceplate in the dark under one soft overhead spot, with six hardware
// twins of the panel's rows on it: a knurled rotary knob in a ring of LEDs (Key light), a three-
// position selector (Finish), a chrome toggle (LEDs), a fader in a lit slot (Shadow), a joystick on
// a gimbal (Spot) and a knob whose top is a glowing colour wheel (Accent). Ray-marched SDFs inside
// one bounding box over an analytic floor, so pixels outside the plate cost one floor sample. The
// spot is a disc light pointing down: a cone that falls off into black, soft shadows from its size
// and a contact shadow; the finish morphs between powder-coat, brushed (anisotropic) and anodised
// metal. LEDs are HDR emitters into the bloom. A spinning knob is rendered at several instants
// across Argon's shutter and averaged.
//
// Temporal: every frame is jittered and folded into a history (controls-gpu), and the camera never
// moves, so each pixel keeps a cache: its hit distance, shadow, occlusion and material. A frame's
// march starts just short of the nearest cached hit round the pixel (or goes straight to the floor
// if there was none), shadows and occlusion are reused unless the light moved or a control beside
// them did, and a control whose pose changed is marched in full inside its bounds. A reused
// shadow first refines for SHADOW_N frames (its soft edge is noisy by design), then holds. So a
// change to the light's level or colour, the finish or the LEDs costs a few steps a pixel.
//
// Everything unlit is exactly the page colour: the room's ambient brings a surface to it, the
// floor is it, less a soft contact shadow, plus whatever light lands there, and every edge of the
// frame fades to it. Detail finer than a pixel fades out (knurling at grazing angles, grain and
// brushing, the edges of dots and lines), so a single sample doesn't sparkle.
//
// World: y up, the plate's top at y = 0, x right, z toward the viewer. Screen lengths are CSS px.
// u.v[0]  principal point (px), focal (px), the still's sample (its noise seed)
// u.v[1]  camera position, entrance (0 → 1)
// u.v[2]  camera right, LEDs (0 → 1)
// u.v[3]  camera up, key knob's value (0–1)
// u.v[4]  camera forward, shadow softness (0–1)
// u.v[5]  light position, light intensity
// u.v[6]  light colour (linear, unit luminance), shutter samples while spinning
// u.v[7]  accent (linear), colour knob's angle (rad)
// u.v[8]  finish weights (matte, brushed, anodised), selector angle (rad)
// u.v[9]  key knob angle, and the angle each of key, colour and selector turns in a shutter
// u.v[10] toggle angle (rad), fader value (0–1), joystick tilt x, z (rad)
// u.v[11] each twin's LEDs arriving: key, selector, toggle, fader
// u.v[12] joystick's and colour knob's LEDs arriving, the sample's jitter (device px)
// u.v[13] page colour (linear)
// u.v[14] the light moved (1), the controls whose pose changed (bits: key 1, colour 2,
//         selector 4, toggle 8, fader 16, joystick 32)
// u.v[62].x the cache holds last frame (controls-gpu)

const PT = 0.32;
const PLATE = vec2f(3.0, 2.05);
const K = vec2f(-1.85, -0.8);
const S = vec2f(0.0, -0.8);
const T = vec2f(1.85, -0.8);
const F = vec2f(-1.9, 0.95);
const J = vec2f(0.0, 0.95);
const C = vec2f(1.85, 0.95);
const FADER_L = 0.72;
/** The colour knob's lens, inside a rim of its finish. */
const LENS = 0.34;
const ARC = 2.35619449;
const LED_N = 25.0;
const BOX_MIN = vec3f(-3.05, -0.34, -2.1);
const BOX_MAX = vec3f(3.05, 1.05, 2.1);

var<private> rotK: f32;
var<private> rotC: f32;
var<private> rotS: f32;
var<private> jit: f32;
/** The camera ray, and the world size of a device pixel where it is now. */
var<private> rdir: vec3f;
var<private> pixw: f32;
/** This pixel in the cache, and the shadow this sample's shading used (and how many samples). */
var<private> pix: vec2i;
var<private> usedSh: f32;
var<private> usedN: f32;
/** A cached shadow refines this many frames, then holds. */
const SHADOW_N = 8.0;

fn sq(x: f32) -> f32 {
  return x * x;
}
/** Smooth value noise: band-limited, unlike a hash per cell. */
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2f(1.0, 0.0)), w.x),
    mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), w.x),
    w.y,
  );
}
/** How much of a detail `scale` cycles per unit survives at this pixel: none finer than ~2 px. */
fn detail(scale: f32) -> f32 {
  return 1.0 - smoothstep(0.22, 0.5, pixw * scale);
}
/** A line `hw` wide either side, its edge a pixel soft. */
fn lineMask(d: f32, hw: f32) -> f32 {
  let aw = max(0.003, pixw * 0.75);
  return 1.0 - smoothstep(hw - aw, hw + aw, d);
}
/** 1 past `edge`, its step a pixel soft. */
fn soft(edge: f32, x: f32) -> f32 {
  let aw = max(0.002, pixw * 0.6);
  return smoothstep(edge - aw, edge + aw, x);
}
fn rot2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}
/** Angle round a point on the plate: 0 toward the back (up on screen), clockwise. */
fn ang(q: vec2f) -> f32 {
  return atan2(q.x, -q.y);
}
fn sdRoundRect(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
/** Distance to a bound: a cylinder of radius `r` up to height `h` (open below). */
fn bound(q: vec3f, r: f32, h: f32) -> f32 {
  let d = vec2f(length(q.xz) - r, q.y - h);
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}
fn sdBox(p: vec3f, b: vec3f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
/** A cylinder standing on y = 0, `h` tall, its edges rounded by `rr`. */
fn sdCyl(p: vec3f, r: f32, h: f32, rr: f32) -> f32 {
  let d = vec2f(length(p.xz) - r + rr, abs(p.y - h * 0.5) - h * 0.5 + rr);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0))) - rr;
}
fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
fn sdHex(p: vec3f, r: f32, h: f32) -> f32 {
  let k = vec3f(-0.8660254, 0.5, 0.57735);
  var q = abs(p.xz);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  let d = vec2f(length(q - vec2f(clamp(q.x, -k.z * r, k.z * r), r)) * sign(q.y - r), abs(p.y - h * 0.5) - h * 0.5);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}
/** A knurled knob: radius `r`, `h` tall, its grip a band of `n` ridges, turned by `a`. */
fn sdKnob(q: vec3f, r: f32, h: f32, n: f32, a: f32) -> f32 {
  let band = smoothstep(0.07, 0.11, q.y) * (1.0 - smoothstep(h - 0.1, h - 0.06, q.y));
  // The ridges crowd together toward the silhouette; once closer than a few pixels they smooth out.
  let tang = vec3f(q.z, 0.0, -q.x) / max(length(q.xz), 1e-4);
  let tv = dot(tang, rdir);
  let period = 6.2831853 * r / n * sqrt(max(1.0 - tv * tv, 0.0));
  let fine = smoothstep(2.5, 5.0, period / max(pixw, 1e-5));
  let grip = 0.016 * band * fine * (0.5 + 0.5 * cos((ang(q.xz) - a) * n));
  let body = sdCyl(q, r - grip, h, 0.05);
  let skirt = sdCyl(q, r + 0.06, 0.05, 0.02);
  return min(body, skirt);
}

/** The joystick's stick direction. */
fn stickDir() -> vec3f {
  return normalize(vec3f(tan(u.v[10].z), 1.0, tan(u.v[10].w)));
}

/** Distance and material: 0 plate, 1 finish, 2 chrome, 3 rubber, 4 gloss black, 6 colour knob,
 *  7 key knob, 8 selector, 9 fader cap. */
fn map(p: vec3f) -> vec2f {
  // The plate, with the fader's slot cut into it.
  let w = vec2f(sdRoundRect(p.xz, PLATE, 0.32) + 0.04, abs(p.y + PT * 0.5) - PT * 0.5 + 0.04);
  var plate = min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0))) - 0.04;
  plate = max(plate, -sdBox(p - vec3f(F.x, 0.0, F.y), vec3f(0.055, 0.11, FADER_L + 0.06), 0.03));
  var res = vec2f(plate, 0.0);
  if (p.y > 0.95) {
    return vec2f(min(plate, p.y - 0.9), 0.0);
  }
  // Each twin inside its own bound: outside it, the bound's distance stands in.
  var q = p - vec3f(K.x, 0.0, K.y);
  var b = bound(q, 0.78, 0.6);
  if (b < 0.05) {
    let d = sdKnob(q, 0.6, 0.52, 54.0, rotK);
    if (d < res.x) {
      res = vec2f(d, 7.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  q = p - vec3f(C.x, 0.0, C.y);
  b = bound(q, 0.66, 0.5);
  if (b < 0.05) {
    let d = sdKnob(q, 0.5, 0.44, 48.0, rotC);
    if (d < res.x) {
      res = vec2f(d, 6.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  q = p - vec3f(S.x, 0.0, S.y);
  b = bound(q, 0.62, 0.5);
  if (b < 0.05) {
    let base = sdCyl(q, 0.5, 0.17, 0.05);
    if (base < res.x) {
      res = vec2f(base, 1.0);
    }
    let bq = vec3f(rot2(q.xz, -rotS), q.y).xzy;
    let taper = 0.035 * clamp(-bq.z / 0.5, -1.0, 1.0);
    let bar = sdBox(bq - vec3f(0.0, 0.3, 0.0), vec3f(0.15 - taper, 0.14, 0.5), 0.06);
    if (bar < res.x) {
      res = vec2f(bar, 8.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  q = p - vec3f(T.x, 0.0, T.y);
  b = bound(q, 0.5, 0.95);
  if (b < 0.05) {
    let washer = sdCyl(q, 0.32, 0.04, 0.014);
    if (washer < res.x) {
      res = vec2f(washer, 1.0);
    }
    let nut = min(sdHex(q - vec3f(0.0, 0.035, 0.0), 0.2, 0.12), sdCyl(q, 0.115, 0.26, 0.02));
    let tip = vec3f(0.0, 0.24 + 0.58 * cos(u.v[10].x), 0.58 * sin(u.v[10].x));
    let lever = min(sdCapsule(q, vec3f(0.0, 0.24, 0.0), tip, 0.055), length(q - tip) - 0.085);
    let d = min(nut, lever);
    if (d < res.x) {
      res = vec2f(d, 2.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  q = p - vec3f(F.x, 0.0, F.y);
  b = length(max(vec3f(abs(q.x) - 0.32, q.y - 0.3, abs(q.z) - FADER_L - 0.2), vec3f(0.0)));
  if (b < 0.05) {
    let capZ = FADER_L - 2.0 * FADER_L * u.v[10].y;
    let cap = sdBox(q - vec3f(0.0, 0.13, capZ), vec3f(0.24, 0.11, 0.13), 0.045);
    let stem = sdBox(q - vec3f(0.0, 0.0, capZ), vec3f(0.03, 0.1, 0.05), 0.01);
    let d = min(cap, stem);
    if (d < res.x) {
      res = vec2f(d, 9.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  q = p - vec3f(J.x, 0.0, J.y);
  b = bound(q, 0.66, 0.95);
  if (b < 0.05) {
    let ring = max(sdCyl(q, 0.57, 0.07, 0.025), -(length(q.xz) - 0.44));
    if (ring < res.x) {
      res = vec2f(ring, 1.0);
    }
    let boot = (length(q / vec3f(0.43, 0.22, 0.43)) - 1.0) * 0.22;
    if (boot < res.x) {
      res = vec2f(boot, 3.0);
    }
    let pivot = vec3f(0.0, 0.12, 0.0);
    let top = pivot + stickDir() * 0.6;
    let stick = min(sdCapsule(q, pivot, top, 0.055), length(q - top) - 0.15);
    if (stick < res.x) {
      res = vec2f(stick, 4.0);
    }
  } else {
    res.x = min(res.x, b);
  }
  return res;
}

fn boxHit(ro: vec3f, rd: vec3f) -> vec2f {
  let inv = 1.0 / rd;
  let t0 = (BOX_MIN - ro) * inv;
  let t1 = (BOX_MAX - ro) * inv;
  let lo = min(t0, t1);
  let hi = max(t0, t1);
  return vec2f(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

fn normalAt(p: vec3f) -> vec3f {
  let k = max(0.0012, 0.35 * pixw);
  let e = vec2f(k, -k);
  return normalize(
    e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x,
  );
}

/** Soft shadow toward the disc light (iq's penumbra estimate, its width from the light's size). */
fn shadow(p: vec3f, l: vec3f, dist: f32) -> f32 {
  let bh = boxHit(p, l);
  let end = min(dist, bh.y);
  if (bh.x > bh.y || end <= 0.0) {
    return 1.0;
  }
  let size = mix(0.12, 1.3, u.v[4].w);
  let k = dist / size;
  var res = 1.0;
  var ph = 1e10;
  var t = max(bh.x, 0.0) + 0.012 + 0.08 * jit;
  for (var i = 0; i < 56; i++) {
    if (t > end) {
      break;
    }
    let h = map(p + l * t).x;
    let y = h * h / (2.0 * ph);
    let d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, k * d / max(t - y, 1e-4));
    ph = h;
    if (res < 0.002) {
      break;
    }
    t += clamp(h, 0.01, 0.09);
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}

fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var o = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 4; i++) {
    let h = 0.02 * f32(i * i);
    o += w * (h - map(p + n * h).x);
    w *= 0.6;
  }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
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

struct Light {
  l: vec3f,
  e: vec3f,
  dist: f32,
  cone: f32,
}

/** The spot at p: direction, irradiance (cone and distance; shadow applied by the caller). */
fn spotAt(p: vec3f) -> Light {
  let lp = u.v[5].xyz;
  let d = lp - p;
  let dist = length(d);
  let l = d / dist;
  let soft = u.v[4].w;
  let ao = mix(0.4, 0.72, soft);
  let cone = smoothstep(cos(ao), cos(ao * mix(0.35, 0.1, soft)), l.y);
  let e = u.v[6].rgb * u.v[5].w * cone / (dist * dist) * u.v[1].w * u.v[1].w;
  return Light(l, e, dist, cone);
}

fn ggxAniso(n: vec3f, h: vec3f, t: vec3f, ax: f32, ay: f32) -> f32 {
  let b = cross(n, t);
  let x = dot(h, t) / ax;
  let y = dot(h, b) / ay;
  let z = dot(h, n);
  let d = x * x + y * y + z * z;
  return 1.0 / (PI * ax * ay * d * d);
}

struct Mat {
  albedo: vec3f,
  f0: vec3f,
  ax: f32,
  ay: f32,
  t: vec3f,
  emit: vec3f,
}

/** One BRDF under the spot: diffuse, specular (widened by the disc's size) and a dark room. */
fn light(m: Mat, p: vec3f, n: vec3f, v: vec3f, sp: Light, sh: f32, ao: f32) -> vec3f {
  let ndl = max(dot(n, sp.l), 0.0);
  let nv = max(dot(n, v), 0.15);
  let h = normalize(sp.l + v);
  let widen = sq(mix(0.12, 1.3, u.v[4].w) * 0.5 / sp.dist);
  let ax = sqrt(m.ax * m.ax + widen);
  let ay = sqrt(m.ay * m.ay + widen);
  let fr = m.f0 + (vec3f(1.0) - m.f0) * pow(1.0 - max(dot(h, v), 0.0), 5.0);
  let spec = fr * ggxAniso(n, h, m.t, ax, ay) / (4.0 * nv);
  let col = (m.albedo * ndl + spec * ndl) * sp.e * sh;
  // The room is the page: a surface the spot doesn't reach is the page colour, a little darker
  // in its creases and on walls turned from the room.
  let room = u.v[13].rgb * (0.5 + 0.5 * ao) * (0.8 + 0.2 * max(n.y, 0.0));
  return col + room + m.emit;
}

fn finishes(p: vec3f, n: vec3f, top: bool, centre: vec2f) -> array<Mat, 3> {
  let grain = (vnoise(p.xz * 80.0) - 0.5) * detail(80.0);
  let accent = u.v[7].rgb;
  let tint = accent / max(max(accent.r, max(accent.g, accent.b)), 1e-4);
  var t = vec3f(1.0, 0.0, 0.0);
  if (top) {
    let r = p.xz - centre;
    t = normalize(vec3f(-r.y, 0.0, r.x) + vec3f(1e-4, 0.0, 0.0));
  }
  let e = vec3f(0.0);
  let matte = Mat(vec3f(0.022) * (1.0 + 0.12 * grain), vec3f(0.035), 0.5, 0.5, t, e);
  // Brushing: fine streaks along the stroke, each octave only while it's wider than a pixel.
  let along = vec2f(select(p.z, length(p.xz - centre), top), 3.7);
  let line = (vnoise(along * vec2f(70.0, 1.0)) - 0.5) * detail(70.0) +
    (vnoise(along * vec2f(210.0, 1.0)) - 0.5) * 0.6 * detail(210.0);
  let brushed = Mat(vec3f(0.0), vec3f(0.6, 0.61, 0.63) * (1.0 + 0.1 * line), 0.08, 0.42, t, e);
  let anod = Mat(vec3f(0.0), tint * 0.5 + vec3f(0.03), 0.22, 0.32, t, e);
  return array<Mat, 3>(matte, brushed, anod);
}

fn paint() -> Mat {
  return Mat(vec3f(0.22), vec3f(0.04), 0.5, 0.5, vec3f(1.0, 0.0, 0.0), vec3f(0.0));
}

/** An LED's lens: dark glass when off, the accent when lit (`lit` × its twin's arrival). */
fn led(lit: f32) -> Mat {
  return Mat(vec3f(0.012), vec3f(0.05), 0.1, 0.1, vec3f(1.0, 0.0, 0.0), u.v[7].rgb * 9.0 * lit);
}

/** A disc of radius `r`: its edge a quarter of it soft, and never less than a pixel. */
fn dotMask(d: f32, r: f32) -> f32 {
  let w = max(r * 0.25, pixw * 1.2);
  return 1.0 - smoothstep(r - w * 0.5, r + w * 0.5, d);
}

/** Markings, LEDs and screws on the plate's top; `base` is the plate's own finish. */
fn plateDecal(p: vec3f, m: Mat) -> Mat {
  let leds = u.v[2].w;
  let pa = p.xz;
  var mm = m;
  // The key knob's ring: 25 LEDs over 270°, lit up to its value.
  var q = pa - K;
  var r = length(q);
  if (abs(r - 0.86) < 0.06) {
    let a = ang(q);
    if (abs(a) < ARC + 0.08) {
      let stp = 2.0 * ARC / (LED_N - 1.0);
      let i = clamp(round((a + ARC) / stp), 0.0, LED_N - 1.0);
      let c = 0.86 * vec2f(sin(-ARC + i * stp), -cos(-ARC + i * stp));
      let k = dotMask(length(q - c), 0.034);
      if (k > 0.0) {
        let lit = sat(u.v[3].w * LED_N - i) * leds * u.v[11].x;
        mm = mixMat(mm, led(lit), k);
      }
    }
  }
  // The selector's three positions, the one it points at lit.
  q = pa - S;
  r = length(q);
  if (abs(r - 0.74) < 0.05) {
    for (var j = -1; j <= 1; j++) {
      let a0 = f32(j) * 0.7;
      let c = 0.74 * vec2f(sin(a0), -cos(a0));
      let k = dotMask(length(q - c), 0.036);
      if (k > 0.0) {
        let lit = exp(-sq((rotS - a0) / 0.28)) * leds * u.v[11].y;
        mm = mixMat(mm, led(lit), k);
      }
    }
  }
  // The toggle's own LED, and the colour knob's marker (the hue it points at).
  let kt = dotMask(length(pa - (T + vec2f(0.0, -0.55))), 0.036);
  if (kt > 0.0) {
    mm = mixMat(mm, led(leds * u.v[11].z), kt);
  }
  // Round the colour knob, twelve hues: the accent's at 12, bright; the rest dimly, turning with it.
  q = pa - C;
  r = length(q);
  if (abs(r - 0.74) < 0.05) {
    let a = ang(q);
    let i = round(a / (PI / 6.0));
    let a0 = i * PI / 6.0;
    let k = dotMask(length(q - 0.74 * vec2f(sin(a0), -cos(a0))), 0.03);
    if (k > 0.0) {
      let hue = a0 - rotC;
      let col = oklabToLinear(vec3f(0.78, 0.15 * cos(hue), 0.15 * sin(hue)));
      let lit = select(0.22, 1.0, abs(i) < 0.5) * leds * u.v[12].y;
      let dotM = Mat(vec3f(0.012), vec3f(0.05), 0.1, 0.1, vec3f(1.0, 0.0, 0.0), col * 7.0 * lit);
      mm = mixMat(mm, dotM, k);
    }
  }
  // Ticks either side of the fader, and round the joystick.
  q = pa - F;
  if (abs(q.y) < FADER_L + 0.05 && abs(q.x) > 0.17 && abs(q.x) < 0.36) {
    let i = round((q.y + FADER_L) / (FADER_L / 4.0));
    let dz = abs(q.y + FADER_L - i * FADER_L / 4.0);
    let major = i - 2.0 * floor(i / 2.0) < 0.5;
    let k = lineMask(dz, 0.011) * select(1.0 - soft(0.3, abs(q.x)), 1.0, major);
    mm = mixMat(mm, paint(), k * 0.8);
  }
  q = pa - J;
  r = length(q);
  if (r > 0.64 && r < 0.84) {
    let a = ang(q);
    let near = abs(a - round(a / (PI * 0.5)) * PI * 0.5) * r;
    mm = mixMat(mm, paint(), lineMask(near, 0.011) * 0.8);
  }
  // Screws in the corners.
  let sc = abs(pa) - vec2f(2.68, 1.73);
  let sd = length(sc);
  if (sd < 0.12) {
    let head = Mat(vec3f(0.02), vec3f(0.35), 0.25, 0.25, vec3f(1.0, 0.0, 0.0), vec3f(0.0));
    let hole = Mat(vec3f(0.004), vec3f(0.02), 0.6, 0.6, vec3f(1.0, 0.0, 0.0), vec3f(0.0));
    mm = mixMat(mm, hole, dotMask(sd, 0.12));
    mm = mixMat(mm, head, dotMask(sd, 0.085));
    mm = mixMat(mm, hole, dotMask(sd, 0.028));
  }
  return mm;
}

fn mixMat(a: Mat, b: Mat, k: f32) -> Mat {
  return Mat(
    mix(a.albedo, b.albedo, k),
    mix(a.f0, b.f0, k),
    mix(a.ax, b.ax, k),
    mix(a.ay, b.ay, k),
    a.t,
    mix(a.emit, b.emit, k),
  );
}

/** A finish (0 matte, 1 brushed, 2 anodised) with this point's markings and emitters. */
fn surface(fin: Mat, id: f32, p: vec3f, n: vec3f) -> Mat {
  var m = fin;
  let up = n.y > 0.75;
  if (id < 0.5) {
    if (p.y < -0.01 && abs(p.x - F.x) < 0.06 && abs(p.z - F.y) < FADER_L + 0.07) {
      // The fader's slot: lit from the bottom up to the cap.
      let capZ = F.y + FADER_L - 2.0 * FADER_L * u.v[10].y;
      let fill = smoothstep(capZ - 0.02, capZ + 0.08, p.z);
      let glow = (0.05 + 0.95 * fill) * u.v[2].w * u.v[11].w * (1.0 - smoothstep(-0.105, -0.085, p.y));
      m = Mat(vec3f(0.01), vec3f(0.03), 0.4, 0.4, m.t, u.v[7].rgb * 5.0 * glow);
    } else if (up) {
      m = plateDecal(p, m);
    }
  } else if (id > 0.5 && id < 1.5 && up && p.y > 0.03 && length(p.xz - J) < 0.6) {
    // The joystick's base: a ring of light, brightest the way the stick leans.
    let q = p.xz - J;
    let tilt = u.v[10].zw;
    let lean = max(dot(q / max(length(q), 1e-4), tilt / max(length(tilt), 1e-4)), 0.0);
    let bright = 0.12 + 0.3 * lean * min(length(tilt) / 0.3, 1.0);
    m = mixMat(m, led(u.v[2].w * u.v[12].x * bright), lineMask(abs(length(q) - 0.5), 0.012));
  } else if (id > 6.5 && id < 7.5 && up && p.y > 0.4) {
    // The key knob's pointer line.
    let lq = rot2(p.xz - K, -rotK);
    let k = lineMask(abs(lq.x), 0.02) * soft(-0.52, lq.y) * (1.0 - soft(-0.24, lq.y));
    m = mixMat(m, paint(), k);
  } else if (id > 7.5 && id < 8.5 && up && p.y > 0.3) {
    let lq = rot2(p.xz - S, -rotS);
    let k = lineMask(abs(lq.x), 0.018) * soft(-0.32, lq.y) * (1.0 - soft(-0.14, lq.y));
    m = mixMat(m, paint(), k);
    m = mixMat(m, led(u.v[2].w * u.v[11].y), dotMask(length(lq - vec2f(0.0, -0.41)), 0.04));
  } else if (id > 8.5 && up) {
    let capZ = F.y + FADER_L - 2.0 * FADER_L * u.v[10].y;
    let k = lineMask(abs(p.z - capZ), 0.016);
    m = mixMat(m, paint(), k * (1.0 - soft(0.19, abs(p.x - F.x))));
  }
  return m;
}

/** The colour knob's top: a wheel of hues glowing through a frosted lens, the accent's at 12. */
fn wheel(p: vec3f) -> vec3f {
  let q = p.xz - C;
  let r = length(q) / LENS;
  let hue = ang(q) - rotC;
  let ch = 0.15 * smoothstep(0.05, 0.9, r);
  let col = oklabToLinear(vec3f(0.74, ch * cos(hue), ch * sin(hue)));
  let lit = u.v[2].w * u.v[12].y;
  return col * 0.5 * lit * (1.0 - smoothstep(0.88, 1.0, r));
}

/**
 * This frame's shadow, given what's known: `known` is (a shadow, its samples, how to use it:
 * 0 ignore it, 1 keep it, 2 average a new sample into it).
 */
fn shadowWith(known: vec4f, s: f32) -> f32 {
  if (known.z > 1.5) {
    usedN = known.y + 1.0;
    return mix(known.x, s, 1.0 / usedN);
  }
  usedN = 1.0;
  return s;
}

/** Shades a hit, with what's known of its shadow (see shadowWith). */
fn shade(p: vec3f, rd: vec3f, id: f32, known: vec4f) -> vec3f {
  let n = normalAt(p);
  let v = -rd;
  let sp = spotAt(p);
  var sh = known.x;
  usedN = known.y;
  if (abs(known.z - 1.0) > 0.5) {
    var s = 0.0;
    if (dot(n, sp.l) > 0.0 && sp.cone > 0.0) {
      s = shadow(p + n * 0.006, sp.l, sp.dist);
    }
    sh = shadowWith(known, s);
  }
  let ao = occlusion(p, n);
  usedSh = sh;
  var col = vec3f(0.0);
  if (id > 1.5 && id < 2.5) {
    // The lever's tip: a frosted lens, lit in the accent while the LEDs are on.
    let a = u.v[10].x;
    let tip = vec3f(T.x, 0.24 + 0.58 * cos(a), T.y + 0.58 * sin(a));
    if (length(p - tip) < 0.1) {
      let lens = Mat(vec3f(0.03), vec3f(0.05), 0.25, 0.25, vec3f(1.0, 0.0, 0.0),
        u.v[7].rgb * 2.2 * u.v[2].w * u.v[11].z * (0.6 + 0.4 * max(dot(n, v), 0.0)));
      return light(lens, p, n, v, sp, sh, ao);
    }
    let chrome = Mat(vec3f(0.0), vec3f(0.9, 0.9, 0.92), 0.07, 0.07, vec3f(1.0, 0.0, 0.0), vec3f(0.0));
    col = light(chrome, p, n, v, sp, sh, ao);
    // Chrome mirrors the room: the spot's disc and the warm pool round it.
    let r = reflect(rd, n);
    col += u.v[6].rgb * u.v[5].w * u.v[1].w * 0.0012 * pow(max(dot(r, sp.l), 0.0), 6.0) * ao;
    return col;
  }
  if (id > 2.5 && id < 3.5) {
    return light(Mat(vec3f(0.018), vec3f(0.03), 0.7, 0.7, vec3f(1.0, 0.0, 0.0), vec3f(0.0)), p, n, v, sp, sh, ao);
  }
  if (id > 3.5 && id < 4.5) {
    return light(Mat(vec3f(0.01), vec3f(0.05), 0.12, 0.12, vec3f(1.0, 0.0, 0.0), vec3f(0.0)), p, n, v, sp, sh, ao);
  }
  if (id > 5.5 && id < 6.5 && n.y > 0.85 && p.y > 0.38 && length(p.xz - C) < LENS) {
    // The wheel under a glossy lens.
    let lens = Mat(vec3f(0.0), vec3f(0.04), 0.06, 0.06, vec3f(1.0, 0.0, 0.0), wheel(p));
    return light(lens, p, n, v, sp, sh, ao);
  }
  var centre = K;
  if (id > 5.5 && id < 6.5) {
    centre = C;
  } else if (id > 7.5 && id < 8.5) {
    centre = S;
  }
  let top = n.y > 0.85 && id > 5.5 && id < 7.5;
  var fins = finishes(p, n, top, centre);
  for (var i = 0; i < 3; i++) {
    let w = u.v[8][i];
    if (w > 0.002) {
      col += w * light(surface(fins[i], id, p, n), p, n, v, sp, sh, ao);
    }
  }
  // The LEDs light the plate round them a little: the key's ring, the fader's slot, the
  // joystick's ring. With the LEDs off, all of it goes.
  if (id < 0.5 && p.y > -0.02) {
    let leds = u.v[2].w;
    let r = length(p.xz - K);
    var spill = 0.05 * u.v[3].w * u.v[11].x * exp(-abs(r - 0.86) / 0.12);
    let fq = p.xz - F;
    let capZ = FADER_L - 2.0 * FADER_L * u.v[10].y;
    let along = smoothstep(capZ - 0.05, capZ + 0.1, fq.y) * (1.0 - smoothstep(FADER_L, FADER_L + 0.15, fq.y));
    spill += 0.05 * u.v[11].w * along * exp(-max(abs(fq.x) - 0.06, 0.0) / 0.1);
    spill += 0.015 * u.v[12].x * exp(-abs(length(p.xz - J) - 0.6) / 0.1);
    col += u.v[7].rgb * leds * spill;
  }
  return col;
}

fn floorShade(p: vec3f, rd: vec3f, known: vec4f) -> vec3f {
  let n = vec3f(0.0, 1.0, 0.0);
  let sp = spotAt(p);
  var sh = known.x;
  usedN = known.y;
  if (abs(known.z - 1.0) > 0.5) {
    var s = 1.0;
    if (sp.cone > 0.0) {
      s = shadow(p + n * 0.004, sp.l, sp.dist);
    }
    sh = shadowWith(known, s);
  }
  usedSh = sh;
  // The floor is the page, less a contact shadow darkest under the plate's edge and gone within
  // a few centimetres, plus the light that lands on it.
  let edge = max(sdRoundRect(p.xz, PLATE, 0.32), 0.0);
  let contact = exp(-edge / 0.09);
  let m = Mat(vec3f(0.065), vec3f(0.03), 0.6, 0.6, vec3f(1.0, 0.0, 0.0), vec3f(0.0));
  let lit = light(m, p, n, -rd, sp, sh * (1.0 - 0.6 * contact), 1.0) - u.v[13].rgb;
  // The pool stays close round the plate, dissolving long before the frame's edge.
  let near = exp(-sq(edge / 0.45)) * (1.0 - smoothstep(0.55, 1.0, edge));
  return u.v[13].rgb * (1.0 - 0.7 * contact) + lit * near;
}

/** Where the ray enters a box, or never (1e9). */
fn enter(ro: vec3f, rd: vec3f, lo: vec3f, hi: vec3f) -> f32 {
  let inv = 1.0 / rd;
  let a = (lo - ro) * inv;
  let b = (hi - ro) * inv;
  let n = max(max(min(a.x, b.x), min(a.y, b.y)), min(a.z, b.z));
  let f = min(min(max(a.x, b.x), max(a.y, b.y)), max(a.z, b.z));
  return select(1e9, max(n, 0.0), n < f && f > 0.0);
}

/** Each twin's bounds over its whole travel: key, colour, selector, toggle, fader, joystick. */
fn twinBox(i: u32) -> array<vec3f, 2> {
  switch i {
    case 0u: { return array(vec3f(K.x - 0.8, -0.01, K.y - 0.8), vec3f(K.x + 0.8, 0.62, K.y + 0.8)); }
    case 1u: { return array(vec3f(C.x - 0.68, -0.01, C.y - 0.68), vec3f(C.x + 0.68, 0.52, C.y + 0.68)); }
    case 2u: { return array(vec3f(S.x - 0.64, -0.01, S.y - 0.64), vec3f(S.x + 0.64, 0.52, S.y + 0.64)); }
    case 3u: { return array(vec3f(T.x - 0.5, -0.01, T.y - 0.75), vec3f(T.x + 0.5, 0.97, T.y + 0.75)); }
    case 4u: { return array(vec3f(F.x - 0.34, -0.13, F.y - FADER_L - 0.22), vec3f(F.x + 0.34, 0.32, F.y + FADER_L + 0.22)); }
    default: { return array(vec3f(J.x - 0.68, -0.01, J.y - 0.68), vec3f(J.x + 0.68, 0.97, J.y + 0.68)); }
  }
}

/** The nearest a twin that moved this frame comes along the ray (1e9: none). */
fn dirtyEntry(ro: vec3f, rd: vec3f, mask: u32) -> f32 {
  var t = 1e9;
  for (var i = 0u; i < 6u; i++) {
    if ((mask & (1u << i)) != 0u) {
      let b = twinBox(i);
      t = min(t, enter(ro, rd, b[0], b[1]));
    }
  }
  return t;
}

/** Whether a twin that moved this frame is within `reach` of a point on the plate. */
fn nearDirty(p: vec3f, mask: u32, reach: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    if ((mask & (1u << i)) != 0u) {
      let b = twinBox(i);
      let d = max(max(b[0].xz - p.xz, p.xz - b[1].xz), vec2f(0.0));
      if (length(d) < reach) {
        return true;
      }
    }
  }
  return false;
}

/**
 * One sample of the frame. The primary one (`primary`) uses and refills the pixel's cache; the
 * shutter's others reuse the primary's shadow (`prim`: shadow, its samples, part) where they hit
 * the same part.
 */
fn render(px: vec2f, tau: f32, primary: bool, prim: vec3f) -> vec4f {
  jit = hash12(px * 3.1 + tau + u.v[0].w * 17.13);
  rotK = u.v[9].x + u.v[9].y * tau;
  rotC = u.v[7].w + u.v[9].z * tau;
  rotS = u.v[8].w + u.v[9].w * tau;
  let cam = u.v[1].xyz;
  let d = px - u.v[0].xy;
  let rd = normalize(d.x * u.v[2].xyz - d.y * u.v[3].xyz + u.v[0].z * u.v[4].xyz);
  rdir = rd;
  let pixA = 1.0 / (u.v[0].z * u.frame.z);
  let mask = u32(u.v[14].y);
  let moved = u.v[14].x > 0.5;
  let bh = boxHit(cam, rd);
  var t = max(bh.x, 0.0);
  var march = bh.x < bh.y && bh.y > 0.0;
  var c0 = vec4f(0.0, 0.0, 1.0, -2.0);
  let cached = primary && u.v[62].x > 0.5;
  if (cached) {
    c0 = textureLoad(cacheIn, pix, 0);
  }
  if (cached && march) {
    // The nearest hit round this pixel last frame: nothing static can be nearer than that.
    let hi = vec2i(u.frame.xy) - 1;
    var near = 1e9;
    var known = true;
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let c = textureLoad(cacheIn, clamp(pix + vec2i(x, y), vec2i(0), hi), 0);
        known = known && c.w > -1.5;
        if (c.w > -0.5) {
          near = min(near, c.x);
        }
      }
    }
    if (known) {
      let de = dirtyEntry(cam, rd, mask);
      if (near < 1e8) {
        t = max(t, near - 0.08);
      } else {
        march = de < 1e8;
      }
      t = min(t, max(de, bh.x));
    }
  }
  if (march) {
    for (var i = 0; i < 110; i++) {
      let p = cam + rd * t;
      pixw = t * pixA;
      let h = map(p);
      if (h.x < 0.0006 * t) {
        var known = vec4f(0.0);
        // The same surface as last frame, under the same light, nothing moving beside it.
        if (cached && abs(c0.w - h.y) < 0.5 && abs(c0.x - t) < 0.03 && !moved &&
          !nearDirty(p, mask, 1.0)) {
          known = vec4f(c0.y, c0.z, select(2.0, 1.0, c0.z >= SHADOW_N), 0.0);
        } else if (!primary && abs(prim.z - h.y) < 0.5) {
          known = vec4f(prim.x, prim.y, 1.0, 0.0);
        }
        let col = shade(p, rd, h.y, known);
        if (primary) {
          cacheOut = vec4f(t, usedSh, usedN, h.y);
        }
        return vec4f(col, h.y);
      }
      t += h.x * 0.85;
      if (t > bh.y) {
        break;
      }
    }
  }
  let tf = (-PT - cam.y) / rd.y;
  pixw = tf * pixA;
  var known = vec4f(0.0);
  if (cached && c0.w < -0.5 && c0.w > -1.5 && !moved) {
    known = vec4f(c0.y, c0.z, select(2.0, 1.0, c0.z >= SHADOW_N), 0.0);
  }
  let col = floorShade(cam + rd * tf, rd, known);
  if (primary) {
    cacheOut = vec4f(tf, usedSh, usedN, -1.0);
  }
  return vec4f(col, -1.0);
}

fn scene(px: vec2f) -> vec3f {
  pix = vec2i(floor(px));
  let dpr = u.frame.z;
  let p = (px + u.v[12].zw) / dpr;
  // Whatever the light does, every edge of the frame is the page colour.
  let size = u.frame.xy / dpr;
  let edge = smoothstep(0.0, 48.0, p.x) * smoothstep(0.0, 48.0, size.x - p.x) *
    smoothstep(0.0, 0.08 * size.y, p.y) * smoothstep(0.0, 0.1 * size.y, size.y - p.y);
  let page = u.v[13].rgb;
  return page + (frame(px, p, dpr) - page) * edge;
}

fn frame(px: vec2f, p: vec2f, dpr: f32) -> vec3f {
  let first = render(p, 0.0, true, vec3f(0.0));
  let prim = vec3f(usedSh, usedN, first.w);
  // Spinning twins (key 7, colour 6, selector 8) take the shutter's samples.
  var n = 1;
  let id = first.w;
  let spin = (id > 6.5 && id < 7.5 && u.v[9].y != 0.0) || (id > 5.5 && id < 6.5 && u.v[9].z != 0.0) ||
    (id > 7.5 && id < 8.5 && u.v[9].w != 0.0);
  if (spin) {
    n = max(n, i32(u.v[6].w));
  }
  if (n <= 1) {
    return first.rgb;
  }
  let j = hash12(px);
  var c = first.rgb;
  var ws = 1.0;
  for (var i = 1; i < n; i++) {
    let fi = f32(i);
    let a = fi * 2.39996 + j * 6.2831853;
    let off = vec2f(cos(a), sin(a)) * sqrt(fi / f32(n)) * 0.5 / dpr;
    var tau = 0.0;
    var w = 1.0;
    if (spin) {
      tau = (fi + hash12(px.yx + fi) - 0.5) / f32(n) - 0.5;
      w = 0.64 + 0.36 * cos(tau * 6.2831853);
    }
    c += w * render(p + off, tau, false, prim).rgb;
    ws += w;
  }
  return c / ws;
}
