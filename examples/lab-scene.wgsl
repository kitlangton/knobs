// The Lab's night street (examples/lab-scene.ts): wet asphalt, a sodium streetlamp, props, fog
// lit by the lights, procedural rain, splashes and CPU-placed smoke and fire sprites. Everything
// reads one Frame uniform per view; the FX tab's gradients and curves arrive as rows of a ramp
// texture (4 rows per view: smoke over life, sky by hour, fog by hour, falloff and unseen curves).

struct Light {
  pos: vec4f,   // xyz, range (m)
  color: vec4f, // linear rgb × intensity, kind (0 point, 1 spot, 3 directional)
  dir: vec4f,   // xyz (where a spot points, or where a directional light travels), size (m)
  cone: vec4f,  // cos outer, cos inner, fog scale, the occluders that shade it (bits)
  vol: vec4f,   // the sphere its light fills in fog: centre, radius (0: none)
}

struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  cam: vec4f,      // xyz, w: scene time (s)
  view: vec4f,     // the view's rect in target px: x, y, w, h
  sky: vec4f,      // hour (0…1), overcast, lightning flash, ramp row base
  fog: vec4f,      // density, height falloff, max distance, steps
  ambient: vec4f,  // rgb scale, city glow
  wet: vec4f,      // wetness, puddles, ripples, snow cover
  rain: vec4f,     // fall phase (m), unused, streak length (m), drop width (m)
  rain2: vec4f,    // wind slope, lit-only, snowness, drop count
  rain3: vec4f,    // size, brightness, seed, sway time
  splash: vec4f,   // count, rate (/s per slot), life (s), size
  misc: vec4f,     // lights, occluders, reduced mode, grain seed
  accent: vec4f,   // selection rim rgb, the lit window's level
  box0: vec4f,     // rain box min
  box1: vec4f,     // rain box size
  camRight: vec4f,
  camUp: vec4f,
  occl: array<vec4f, 24>, // xyz, radius + 100 × object
  lights: array<Light, 8>,
}

struct Part {
  m0: vec4f,
  m1: vec4f,
  m2: vec4f,
  nrm: vec4f,   // 1 / scale², per axis
  color: vec4f, // albedo (linear), roughness
  mat: vec4f,   // metallic, emissive strength, pattern, object
  emit: vec4f,  // emissive rgb, unused
}

struct Sprite {
  pos: vec4f,  // xyz, size (m)
  col: vec4f,  // albedo rgb, opacity
  emit: vec4f, // emissive rgb, rotation
  info: vec4f, // kind (0 smoke, 1 fire, 2 ember, 3 drop), seed, stretch, unused
}

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> parts: array<Part>;
@group(0) @binding(2) var<storage, read> objects: array<vec4f>; // visibility, highlight, light level
@group(0) @binding(3) var ramp: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;
@group(0) @binding(5) var<storage, read> sprites: array<Sprite>;
// Tiling noise, mipmapped: r is fbm at 4 cells a tile, g fbm at 8, b fbm at 16, a value noise at 64.
@group(0) @binding(6) var noiseTex: texture_2d<f32>;
@group(0) @binding(7) var wrap: sampler;

/** Noise at p (tile = 1 / s), with p's screen derivatives so distant ground filters cleanly. */
fn nt(p: vec2f, dx: vec2f, dy: vec2f, s: f32) -> vec4f {
  return textureSampleGrad(noiseTex, wrap, p * s, dx * s, dy * s);
}

const PI = 3.14159265;

// ——— noise ———
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd4(i: u32) -> vec4f {
  let a = pcg(i);
  let b = pcg(a ^ 0x9e3779b9u);
  let c = pcg(b ^ 0x85ebca6bu);
  let d = pcg(c ^ 0xc2b2ae35u);
  return vec4f(f32(a), f32(b), f32(c), f32(d)) / 4294967295.0;
}
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
/** Interleaved gradient noise: a cheap, even dither per pixel. */
fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}
fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// ——— ramps ———
fn rampAt(row: f32, t: f32) -> vec4f {
  let u = (clamp(t, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
  let v = (F.sky.w + row + 0.5) / 16.0;
  return textureSampleLevel(ramp, samp, vec2f(u, v), 0.0);
}
fn falloffCurve(x: f32) -> f32 {
  return rampAt(3.0, x).r * (1.0 - smoothstep(0.92, 1.0, x));
}
fn unseenCurve(x: f32) -> f32 {
  return rampAt(3.0, x).g;
}
fn skyColor(d: vec3f) -> vec3f {
  let top = rampAt(1.0, F.sky.x).rgb;
  let horizon = rampAt(2.0, F.sky.x).rgb;
  let up = clamp(d.y, -1.0, 1.0);
  var c = mix(horizon, top, smoothstep(-0.05, 0.55, up));
  // Below the horizon: the city's murk, darker toward the ground.
  c = mix(c, horizon * 0.35, smoothstep(0.0, -0.3, up));
  let grey = vec3f(luma(c)) * vec3f(0.62, 0.66, 0.78);
  c = mix(c, grey * 0.7, F.sky.y * 0.85);
  // The city's glow on low cloud.
  c += vec3f(0.9, 0.42, 0.16) * F.ambient.w * (1.0 - smoothstep(0.0, 0.45, abs(up))) * (0.4 + F.sky.y);
  return c;
}

// ——— lights ———
struct LightSample {
  rad: vec3f,
  l: vec3f,
  dist: f32,
}
fn lightAt(i: u32, p: vec3f) -> LightSample {
  let lt = F.lights[i];
  var s: LightSample;
  if (lt.color.w > 2.5) {
    s.l = -lt.dir.xyz;
    s.dist = 1e4;
    s.rad = lt.color.rgb;
    return s;
  }
  let d = lt.pos.xyz - p;
  let r = max(length(d), 1e-3);
  s.l = d / r;
  s.dist = r;
  var att = falloffCurve(r / lt.pos.w);
  if (lt.color.w > 0.5) {
    att *= smoothstep(lt.cone.x, lt.cone.y, dot(-s.l, lt.dir.xyz));
  }
  s.rad = lt.color.rgb * att;
  return s;
}

fn sphShadow(ro: vec3f, rd: vec3f, sph: vec4f, k: f32, maxT: f32) -> f32 {
  let oc = ro - sph.xyz;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - sph.w * sph.w;
  let h = b * b - c;
  let d = sqrt(max(0.0, sph.w * sph.w - h)) - sph.w;
  let t = -b - sqrt(max(h, 0.0));
  if (t < 0.0 || t > maxT) {
    return 1.0;
  }
  return smoothstep(0.0, 1.0, 2.5 * k * d / t);
}
/** Soft shadows from the occluder spheres in `mask` (those that can shade what the light reaches). */
fn shadowAt(p: vec3f, l: vec3f, dist: f32, own: f32, k: f32, mask: u32) -> f32 {
  var s = 1.0;
  if ((u32(F.misc.z) & 4u) != 0u) { return 1.0; }
  var m = mask;
  while (m != 0u) {
    let i = countTrailingZeros(m);
    m &= m - 1u;
    let o = F.occl[i];
    let id = floor(o.w / 100.0);
    if (id == own) {
      continue;
    }
    s *= sphShadow(p, l, vec4f(o.xyz, o.w - id * 100.0), k, dist);
  }
  return s;
}
fn occlusionAt(p: vec3f, n: vec3f, own: f32) -> f32 {
  var ao = 1.0;
  if ((u32(F.misc.z) & 16u) != 0u) { return 1.0; }
  let c = u32(F.misc.y);
  for (var i = 0u; i < c; i++) {
    let o = F.occl[i];
    let id = floor(o.w / 100.0);
    let r = o.w - id * 100.0;
    if (id == own || r < 0.01) {
      continue;
    }
    let di = o.xyz - p;
    let l = length(di);
    let nl = dot(n, di / l);
    let h = l / r;
    ao *= 1.0 - clamp(max(nl, 0.0) / (h * h), 0.0, 1.0) * 0.85;
  }
  return ao;
}

fn ggx(nh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
fn smithV(nv: f32, nl: f32, a: f32) -> f32 {
  let gv = nl * (nv * (1.0 - a) + a);
  let gl = nv * (nl * (1.0 - a) + a);
  return 0.5 / max(gv + gl, 1e-5);
}

/** The facade's windows at (x, y): emitted light (rgb) and glass (a). `blur` softens the edges,
 *  for reflections seen through a rough surface. The near facade (z = −6.5) or the skyline. */
fn facadeWindows(x: f32, y: f32, z: f32, far: bool, blur: f32) -> vec4f {
  let cw = select(2.6, 2.2, far);
  let ch = select(3.0, 2.8, far);
  let u = x / cw + select(0.0, z * 0.37, far);
  let fl = (y - select(3.4, 0.0, far)) / ch;
  let cell = vec2f(floor(u), floor(fl));
  let f = vec2f(fract(u), fract(fl));
  let bx = blur / cw;
  let by = blur / ch;
  let inX = smoothstep(0.22 - bx, 0.22 + bx, f.x) * smoothstep(0.78 + bx, 0.78 - bx, f.x);
  let inY = smoothstep(0.2 - by, 0.2 + by, f.y) * smoothstep(0.8 + by, 0.8 - by, f.y);
  let glass = inX * inY * step(0.0, fl);
  let h = hash12(cell + select(0.0, 31.0, far) + floor(z));
  let h2 = hash12(cell * 1.7 + 4.0);
  let lit = step(select(0.84, 0.88, far), h);
  let warm = mix(vec3f(1.0, 0.5, 0.18), vec3f(0.45, 0.6, 1.0), step(0.6, h2));
  var level = (0.05 + 0.3 * h2 * h2) * select(1.0, 0.6, far);
  if (!far && lit > 0.0) {
    // A room behind the glass: lit from a lamp low in it, curtains drawn part way, a cross bar.
    let g = vec2f((f.x - 0.22) / 0.56, (f.y - 0.2) / 0.6);
    let room = 0.45 + 0.75 * exp(-8.0 * dot(g - vec2f(0.35 + 0.3 * h2, 0.3), g - vec2f(0.35 + 0.3 * h2, 0.3)));
    let drawn = 0.12 + 0.22 * fract(h * 7.3);
    let edge = min(g.x, 1.0 - g.x);
    let folds = 0.75 + 0.25 * sin(g.x * 70.0);
    let curtain = mix(folds * 0.35, 1.0, smoothstep(drawn - 0.02, drawn + 0.02, edge));
    let bar = max(smoothstep(0.02 + bx, 0.01, abs(g.x - 0.5)), smoothstep(0.025 + by, 0.012, abs(g.y - 0.62)));
    level *= room * curtain * (1.0 - 0.85 * bar);
  }
  return vec4f(warm * lit * level * glass, glass);
}

/** What a surface sees in its reflection: the facade's windows where the ray meets it, else sky. */
fn envColor(p: vec3f, r: vec3f, rough: f32) -> vec3f {
  var c = skyColor(r) * F.ambient.rgb;
  if (r.z < -0.01 && p.z > -6.3) {
    let t = (-6.5 - p.z) / r.z;
    let hit = p + r * t;
    if (hit.y > 0.0 && hit.y < 7.0) {
      let blur = 0.03 + rough * t * 0.5;
      let w = facadeWindows(hit.x, hit.y, -6.5, false, blur);
      c = vec3f(0.006, 0.004, 0.004) * F.ambient.rgb + w.rgb;
      // The lit window, as bright as it is.
      let d = abs(hit.xy - vec2f(3.6, 1.75)) - vec2f(0.82, 0.72);
      let inside = 1.0 - smoothstep(-blur, blur, max(d.x, d.y));
      c += vec3f(1.0, 0.6, 0.3) * 3.5 * F.accent.w * inside;
    }
  }
  return c;
}

struct Surface {
  albedo: vec3f,
  rough: f32,
  metal: f32,
  emit: vec3f,
  n: vec3f,
  coat: f32,
}

fn shade(s: Surface, p: vec3f, v: vec3f, own: f32) -> vec3f {
  let n = s.n;
  let nv = max(dot(n, v), 1e-3);
  let f0 = mix(vec3f(0.04), s.albedo, s.metal);
  let diff = s.albedo * (1.0 - s.metal);
  let ao = occlusionAt(p, n, own);
  // Ambient: the sky above, the street's bounce below, and the sky in reflections.
  let skyUp = skyColor(vec3f(0.0, 1.0, 0.0)) * F.ambient.rgb;
  let bounce = vec3f(0.05, 0.035, 0.025) * F.ambient.rgb;
  var col = diff * mix(bounce, skyUp, n.y * 0.5 + 0.5) * ao;
  let r = reflect(-v, n);
  let fr = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
  col += envColor(p, r, s.rough) * fr * (1.0 - s.rough) * (1.0 - s.rough) * ao * 1.4;
  let count = u32(F.misc.x);
  for (var i = 0u; i < count; i++) {
    let lt = F.lights[i];
    if (lt.color.r + lt.color.g + lt.color.b < 1e-4) {
      continue;
    }
    let ls = lightAt(i, p);
    if (ls.rad.r + ls.rad.g + ls.rad.b < 1e-5) {
      continue;
    }
    let nl = dot(n, ls.l);
    if (nl <= 0.0) {
      continue;
    }
    var sh = 1.0;
    if (lt.cone.w > 0.5) {
      sh = shadowAt(p + n * 0.02, ls.l, ls.dist, own, 6.0, u32(lt.cone.w));
    }
    // A light with a size widens its highlight (Karis's sphere-light trick).
    let a = s.rough * s.rough;
    let aw = clamp(a + lt.dir.w / (2.0 * ls.dist), 0.002, 1.0);
    let h = normalize(ls.l + v);
    let nh = max(dot(n, h), 0.0);
    let vh = max(dot(v, h), 0.0);
    let fh = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    let norm = (a * a) / (aw * aw);
    let spec = ggx(nh, aw) * norm * smithV(nv, nl, aw) * fh;
    var coat = 0.0;
    if (s.coat > 0.0) {
      coat = ggx(nh, 0.03) * smithV(nv, nl, 0.03) * 0.04 * s.coat;
    }
    col += ls.rad * nl * sh * (diff * (1.0 - fh) / PI + spec + coat);
  }
  return col + s.emit;
}

/** Transmittance of the height fog from `ro` along `rd` for `t` metres (closed form). */
fn fogTrans(ro: vec3f, rd: vec3f, t: f32) -> f32 {
  let k = F.fog.y;
  let y0 = max(ro.y, 0.0);
  var od = 0.0;
  if (abs(rd.y) < 1e-3) {
    od = F.fog.x * exp(-k * y0) * t;
  } else {
    od = F.fog.x / (k * rd.y) * (exp(-k * y0) - exp(-k * max(y0 + rd.y * t, 0.0)));
  }
  return exp(-max(od, 0.0));
}

/** Light scattered toward the eye along a ray through the fog, and what's left of what's behind.
 *  The ambient part is closed form; each lamp is marched only inside the sphere its light fills. */
fn fogAlong(ro: vec3f, rd: vec3f, tMax: f32, jitter: f32) -> vec4f {
  if ((u32(F.misc.z) & 2u) != 0u) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let trans = fogTrans(ro, rd, tMax);
  let fogTint = rampAt(2.0, F.sky.x).rgb * F.ambient.rgb * 0.6 + vec3f(0.0015);
  var scat = fogTint * (1.0 + F.sky.z * 6.0) * (1.0 - trans);
  let steps = max(F.fog.w, 1.0);
  let count = u32(F.misc.x);
  for (var i = 0u; i < count; i++) {
    let lt = F.lights[i];
    if (lt.vol.w <= 0.0 || lt.cone.z <= 0.0 || lt.color.r + lt.color.g + lt.color.b < 1e-4) {
      continue;
    }
    let oc = ro - lt.vol.xyz;
    let b = dot(oc, rd);
    let h = b * b - (dot(oc, oc) - lt.vol.w * lt.vol.w);
    if (h <= 0.0) {
      continue;
    }
    let sq = sqrt(h);
    let t0 = max(-b - sq, 0.0);
    let t1 = min(-b + sq, tMax);
    if (t1 <= t0) {
      continue;
    }
    let dt = (t1 - t0) / steps;
    var acc = vec3f(0.0);
    for (var k = 0.0; k < steps; k += 1.0) {
      let t = t0 + (k + jitter) * dt;
      let p = ro + rd * t;
      let ls = lightAt(i, p);
      // Henyey–Greenstein, forward-leaning: beams glow when you look toward the lamp.
      let g = 0.55;
      let c = dot(ls.l, -rd);
      let hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g + 2.0 * g * c, 1.5));
      let dens = F.fog.x * exp(-max(p.y, 0.0) * F.fog.y);
      acc += ls.rad * hg * dens * fogTrans(ro, rd, t);
    }
    scat += acc * dt * lt.cone.z;
  }
  return vec4f(scat, trans);
}

/** How far the point sits past every light's reach: the FX tab's unseen curve darkens it. */
fn unseenAt(p: vec3f) -> f32 {
  var x = 1.0;
  let count = u32(F.misc.x);
  for (var i = 0u; i < count; i++) {
    let lt = F.lights[i];
    if (lt.color.w > 2.5 || lt.color.r + lt.color.g + lt.color.b < 0.05) {
      continue;
    }
    x = min(x, length(lt.pos.xyz - p) / (lt.pos.w * 1.6));
  }
  return unseenCurve(x);
}

fn viewRay(fragXY: vec2f) -> vec3f {
  let uv = (fragXY - F.view.xy) / F.view.zw;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let far = F.invViewProj * vec4f(ndc, 1.0, 1.0);
  return normalize(far.xyz / far.w - F.cam.xyz);
}

// ——— wet ground ———
fn puddleMask(xz: vec2f, dx: vec2f, dy: vec2f) -> f32 {
  let coverage = F.wet.y * 0.5;
  // The road's crown sheds water to the gutter, where it pools.
  let gutter = smoothstep(1.6, 0.0, abs(xz.y + 2.7)) * 0.22;
  let n = nt(xz * 0.32 + vec2f(3.1, 7.7), dx * 0.32, dy * 0.32, 0.25).r + gutter;
  let t = 1.0 - coverage * 0.62;
  return smoothstep(t, t + 0.07, n) * smoothstep(0.05, 0.4, F.wet.x);
}
/** Rings from drops landing in standing water: three layers of cells, each with a ring. */
fn ripples(xz: vec2f, t: f32) -> vec2f {
  var g = vec2f(0.0);
  for (var layer = 0; layer < 3; layer++) {
    let fl = f32(layer);
    let scale = 2.6 + fl * 1.3;
    let q = xz * scale + vec2f(fl * 7.3, fl * 3.1);
    let cell = floor(q);
    let h = hash22(cell + fl * 19.0);
    let phase = fract(t * (1.1 + h.x * 0.6) + h.y);
    let c = cell + 0.25 + h * 0.5;
    let d = q - c;
    let r = length(d);
    let ring = phase * 0.62;
    let w = r - ring;
    let env = (1.0 - phase) * (1.0 - phase) * smoothstep(0.62, 0.3, r);
    let wave = sin(w * 38.0) * exp(-w * w * 160.0) * env;
    g += d / max(r, 1e-3) * wave;
  }
  return g * 0.09;
}

fn ground(p: vec3f, nIn: vec3f, sidewalk: bool, dx: vec2f, dy: vec2f) -> Surface {
  var s: Surface;
  let xz = p.xz;
  var n = nIn;
  if (sidewalk) {
    let tile = abs(fract(xz / 1.5 + 0.5) - 0.5) * 1.5;
    let seam = smoothstep(0.012, 0.0, min(tile.x, tile.y));
    s.albedo = vec3f(0.13, 0.125, 0.12) * (0.75 + 0.5 * nt(xz * 1.7, dx * 1.7, dy * 1.7, 0.25).r) * (1.0 - seam * 0.6);
    s.rough = 0.8;
  } else {
    let speck = nt(xz * 37.0, dx * 37.0, dy * 37.0, 1.0 / 64.0).a;
    let blot = nt(xz * 0.6, dx * 0.6, dy * 0.6, 0.25).r;
    s.albedo = vec3f(0.05, 0.049, 0.047) * (0.6 + 0.9 * blot) * (0.85 + 0.3 * speck);
    s.rough = 0.72 + speck * 0.12;
    // Paint: a worn double yellow down the middle and a white edge line by the curb.
    let wear = smoothstep(0.35, 0.6, nt(xz * 3.1 + 11.0, dx * 3.1, dy * 3.1, 0.25).r);
    let yellow = (smoothstep(0.07, 0.06, abs(xz.y - 1.45)) + smoothstep(0.07, 0.06, abs(xz.y - 1.7))) * wear;
    let dash = step(0.5, fract(xz.x / 3.0));
    let white = smoothstep(0.08, 0.07, abs(xz.y + 2.55)) * wear + smoothstep(0.06, 0.05, abs(xz.y - 5.0)) * dash * wear;
    s.albedo = mix(s.albedo, vec3f(0.62, 0.42, 0.06), clamp(yellow, 0.0, 1.0) * 0.8);
    s.albedo = mix(s.albedo, vec3f(0.6, 0.6, 0.58), clamp(white, 0.0, 1.0) * 0.75);
    s.rough = mix(s.rough, 0.55, clamp(yellow + white, 0.0, 1.0));
    // Cracks, where water collects.
    let crack = smoothstep(0.012, 0.0, abs(nt(xz * 0.9 + 4.0, dx * 0.9, dy * 0.9, 0.25).r - 0.5)) * smoothstep(0.4, 0.7, nt(xz * 0.3, dx * 0.3, dy * 0.3, 0.125).g);
    s.albedo *= 1.0 - crack * 0.5;
    // The manhole the steam comes up through.
    let mh = length(xz - vec2f(-1.6, 3.2));
    if (mh < 0.42) {
      let grid = step(0.5, fract((xz.x + xz.y) * 9.0)) * 0.3 + 0.7;
      s.albedo = vec3f(0.035, 0.034, 0.033) * grid;
      s.rough = 0.45;
      s.metal = 0.6;
    }
    s.albedo *= mix(1.0, 0.0, smoothstep(0.43, 0.41, mh) * smoothstep(0.38, 0.4, mh));
  }
  // Wet: darker and glossier, with puddles that are nearly mirrors and ripple in the rain.
  let wet = F.wet.x;
  let pud = puddleMask(xz, dx, dy) * select(1.0, 0.35, sidewalk);
  s.albedo *= mix(1.0, 0.55, wet);
  s.rough = mix(s.rough, mix(0.32, 0.16, wet), wet);
  s.rough = mix(s.rough, 0.025, pud);
  s.albedo *= mix(1.0, 0.6, pud);
  // Bumps break up the reflections into streaks, but flatten under standing water.
  let bump = (vec2f(nt(xz * 23.0, dx * 23.0, dy * 23.0, 1.0 / 64.0).a, nt(xz * 23.0 + 5.3, dx * 23.0, dy * 23.0, 1.0 / 64.0).a) - 0.5) * 0.16 * (1.0 - pud);
  let rip = ripples(xz, F.cam.w) * F.wet.z * (0.25 + pud);
  n = normalize(n + vec3f(bump.x + rip.x, 0.0, bump.y + rip.y));
  // Snow settles where the rain would pool.
  let snow = F.wet.w * smoothstep(0.3, 0.75, nt(xz * 1.3, dx * 1.3, dy * 1.3, 0.25).r + F.wet.w * 0.5);
  s.albedo = mix(s.albedo, vec3f(0.75, 0.78, 0.82), snow);
  s.rough = mix(s.rough, 0.85, snow);
  s.n = mix(n, nIn, snow);
  return s;
}

// ——— surfaces ———
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) lpos: vec3f,
  @location(3) @interpolate(flat) part: u32,
}

@vertex
fn vs_surface(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> VOut {
  let P = parts[ii];
  let h = vec4f(p, 1.0);
  let wp = vec3f(dot(P.m0, h), dot(P.m1, h), dot(P.m2, h));
  let ns = n * P.nrm.xyz;
  let wn = normalize(vec3f(dot(P.m0.xyz, ns), dot(P.m1.xyz, ns), dot(P.m2.xyz, ns)));
  var o: VOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.wpos = wp;
  o.nrm = wn;
  o.lpos = p;
  o.part = ii;
  // Hidden or deleted (faded all the way out): no triangle at all.
  if (objects[u32(P.mat.w)].x < 0.001) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  }
  return o;
}

fn material(P: Part, obj: vec4f, wp: vec3f, lp: vec3f, n: vec3f, dwx: vec3f, dwy: vec3f) -> Surface {
  var s: Surface;
  s.albedo = P.color.rgb;
  s.rough = P.color.a;
  s.metal = P.mat.x;
  s.n = n;
  s.emit = P.emit.rgb * P.mat.y * obj.z;
  let pattern = u32(P.mat.z + 0.5);
  switch pattern {
    case 1u: { // traffic cone: retroreflective white bands
      let band = step(0.30, lp.y) * step(lp.y, 0.40) + step(0.47, lp.y) * step(lp.y, 0.53);
      s.albedo = mix(s.albedo, vec3f(0.8), band);
      s.rough = mix(s.rough, 0.3, band);
    }
    case 2u: { // barrier: diagonal stripes
      let stripe = step(0.5, fract((lp.x * 2.0 + lp.y) * 3.0));
      s.albedo = mix(vec3f(0.85, 0.82, 0.78), vec3f(0.8, 0.18, 0.02), stripe);
    }
    case 3u, 11u: { // facade with windows
      let far = pattern == 11u;
      let w = facadeWindows(wp.x, wp.y, wp.z, far, 0.004);
      let k = vec2f(0.8, 2.5);
      let plaster = 0.7 + 0.3 * nt(wp.xy * k, dwx.xy * k, dwy.xy * k, 0.25).r;
      s.albedo = mix(s.albedo * plaster, vec3f(0.01), w.a);
      s.rough = mix(s.rough, 0.06, w.a);
      s.emit += w.rgb;
      // a ledge at each floor
      let fl = (wp.y - select(3.4, 0.0, far)) / select(3.0, 2.8, far);
      s.albedo *= 1.0 - 0.35 * step(fract(fl), 0.03) * step(0.0, fl);
    }
    case 5u: { // the lit window: warm, with mullions and a curtain's shadow
      let f = lp.xy + 0.5;
      let mull = max(step(abs(f.x - 0.5), 0.025), step(abs(f.y - 0.55), 0.025));
      let frame = 1.0 - step(0.05, f.x) * step(f.x, 0.95) * step(0.05, f.y) * step(f.y, 0.95);
      let curtain = smoothstep(0.32, 0.28, f.x) * (0.75 + 0.25 * sin(f.x * 80.0));
      let glow = (1.0 - max(mull, frame)) * (1.0 - curtain * 0.7) * (0.75 + 0.35 * (1.0 - f.y));
      s.emit = P.emit.rgb * P.mat.y * obj.z * glow;
      s.albedo = mix(vec3f(0.02), vec3f(0.12, 0.1, 0.08), max(mull, frame));
      s.rough = 0.1;
    }
    case 6u: { // propane tank: a painted band and a valve collar
      let band = step(abs(lp.y - 0.62), 0.06);
      s.albedo = mix(s.albedo, vec3f(0.5, 0.06, 0.03), band);
    }
    case 7u: { // car paint: metallic flake under a clear coat
      s.coat = 1.0;
    }
    case 8u: { // lamp head: its underside glows
      let under = step(lp.y, -0.45);
      s.emit = P.emit.rgb * P.mat.y * obj.z * under;
      s.albedo = mix(s.albedo, vec3f(0.3), under);
    }
    case 9u: { // lantern: glass between bars
      let bars = max(step(0.42, abs(lp.x)), step(0.42, abs(lp.z)));
      let cap = step(0.38, abs(lp.y));
      let glass = (1.0 - max(bars, cap));
      s.emit = P.emit.rgb * P.mat.y * obj.z * glass;
      s.albedo = mix(s.albedo, vec3f(0.2, 0.15, 0.08), glass);
    }
    case 12u: { // dark glass
      s.rough = 0.05;
      s.coat = 0.6;
    }
    default: {}
  }
  return s;
}

fn applyWet(s: Surface, wp: vec3f, dwx: vec3f, dwy: vec3f) -> Surface {
  var o = s;
  let up = clamp(s.n.y, 0.0, 1.0);
  let wet = F.wet.x * (0.55 + 0.45 * up);
  o.albedo *= mix(1.0, 0.72, wet * (1.0 - o.metal));
  o.rough = mix(o.rough, o.rough * 0.45, wet);
  let snow = F.wet.w * smoothstep(0.45, 0.85, up) * smoothstep(0.35, 0.6, nt(wp.xz * 4.0, dwx.xz * 4.0, dwy.xz * 4.0, 0.25).r + F.wet.w * 0.4);
  o.albedo = mix(o.albedo, vec3f(0.78, 0.8, 0.85), snow);
  o.rough = mix(o.rough, 0.85, snow);
  o.metal *= 1.0 - snow;
  return o;
}

fn finish(col: vec3f, wp: vec3f, fragXY: vec2f) -> vec4f {
  let toP = wp - F.cam.xyz;
  let dist = length(toP);
  let rd = toP / dist;
  var c = col * (1.0 - unseenAt(wp));
  let fog = fogAlong(F.cam.xyz, rd, min(dist, F.fog.z), ign(fragXY));
  c = c * fog.a + fog.rgb;
  return vec4f(c, 1.0);
}

@fragment
fn fs_surface(in: VOut) -> @location(0) vec4f {
  return surface(in, dpdx(in.wpos), dpdy(in.wpos));
}
/** While an object fades in or out: a dither of its pixels, gone or kept. */
@fragment
fn fs_surface_fade(in: VOut) -> @location(0) vec4f {
  let dwx = dpdx(in.wpos);
  let dwy = dpdy(in.wpos);
  let vis = objects[u32(parts[in.part].mat.w)].x;
  if (vis < 0.999 && ign(in.pos.xy + vec2f(7.0, 3.0)) >= vis) {
    discard;
  }
  return surface(in, dwx, dwy);
}
fn surface(in: VOut, dwx: vec3f, dwy: vec3f) -> vec4f {
  let P = parts[in.part];
  let obj = objects[u32(P.mat.w)];
  let n = normalize(in.nrm);
  let v = normalize(F.cam.xyz - in.wpos);
  let pattern = u32(P.mat.z + 0.5);
  var s: Surface;
  if ((pattern == 4u || pattern == 10u) && n.y > 0.5) {
    s = ground(in.wpos, n, pattern == 10u, dwx.xz, dwy.xz);
  } else {
    s = applyWet(material(P, obj, in.wpos, in.lpos, n, dwx, dwy), in.wpos, dwx, dwy);
  }
  var col = shade(s, in.wpos, v, P.mat.w);
  // Selected: a soft rim in the accent, and a lift so it reads against the dark.
  let hl = obj.y;
  if (hl > 0.001) {
    let rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    col += F.accent.rgb * hl * (rim * 1.6 + 0.05);
  }
  return finish(col, in.wpos, in.pos.xy);
}

// ——— sky ———
struct FullOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FullOut {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: FullOut;
  o.pos = vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 1.0, 1.0);
  o.uv = uv;
  return o;
}

@fragment
fn fs_sky(in: FullOut) -> @location(0) vec4f {
  let rd = viewRay(in.pos.xy);
  var c = skyColor(rd);
  // Cloud: slow fbm on a dome, lit from below by the city and by lightning.
  let dome = rd.xz / max(rd.y + 0.12, 0.05);
  let drift = vec2f(F.cam.w * 0.012, F.cam.w * 0.004);
  let cl = smoothstep(0.35, 0.85, textureSampleLevel(noiseTex, wrap, (dome * 0.55 + drift) * 0.25, 0.0).r);
  let clearSky = 1.0 - F.sky.y;
  // Stars and a moon, only when it's clear and dark.
  let night = smoothstep(0.08, 0.01, luma(rampAt(1.0, F.sky.x).rgb));
  let st = hash12(floor(rd.xy * 900.0 + rd.z * 300.0));
  c += vec3f(0.6, 0.65, 0.8) * step(0.9975, st) * night * clearSky * (1.0 - cl) * smoothstep(0.05, 0.3, rd.y) * 0.25;
  let moonDir = normalize(vec3f(-0.35, 0.42, -0.84));
  let md = dot(rd, moonDir);
  c += vec3f(0.85, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(max(md, 0.0), 180.0) * 0.06) * night * clearSky * (1.0 - cl * 0.8);
  let cloudCol = mix(c * 0.6, c * 1.25 + vec3f(0.02, 0.012, 0.008) * F.ambient.w, 0.5);
  c = mix(c, cloudCol + vec3f(0.6, 0.65, 0.9) * F.sky.z * 1.5, cl * (0.35 + 0.6 * F.sky.y));
  c += vec3f(0.55, 0.6, 0.85) * F.sky.z * (0.4 + 0.6 * cl);
  let fog = fogAlong(F.cam.xyz, rd, F.fog.z, ign(in.pos.xy));
  return vec4f(c * fog.a + fog.rgb, 1.0);
}

// ——— rain and snow ———
struct DropOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec4f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) shape: f32,
}

fn litAt(p: vec3f, rd: vec3f, g: f32) -> vec3f {
  var li = vec3f(0.0);
  let count = u32(F.misc.x);
  for (var i = 0u; i < count; i++) {
    let lt = F.lights[i];
    if (lt.color.r + lt.color.g + lt.color.b < 1e-4) {
      continue;
    }
    let ls = lightAt(i, p);
    let c = dot(ls.l, -rd);
    let hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g + 2.0 * g * c, 1.5));
    li += ls.rad * (hg * 4.0 + 0.12);
  }
  return li;
}

fn offscreen() -> DropOut {
  var o: DropOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  return o;
}

@vertex
fn vs_rain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> DropOut {
  let h = rnd4(ii * 3u + u32(F.rain3.z));
  let h2 = rnd4(ii * 3u + 1u + u32(F.rain3.z));
  let snow = F.rain2.z;
  let H = F.box1.y;
  // Each drop falls at its own pace; the shared fall phase keeps it seamless as speed changes.
  let pace = mix(0.85 + 0.3 * h.w, 0.6 + 0.8 * h.w, snow);
  let fallY = fract(h.y - F.rain.x * pace / H);
  var p = F.box0.xyz + vec3f(h.x, fallY, h.z) * F.box1.xyz;
  let above = p.y - F.box0.y;
  p.x += above * F.rain2.x;
  let sway = F.rain3.w * (0.7 + h2.x * 0.6) + h2.y * 6.28;
  p.x += snow * (sin(sway) * 0.35 + sin(sway * 2.3) * 0.12);
  p.z += snow * cos(sway * 0.8) * 0.3;
  p.x = F.box0.x + fract((p.x - F.box0.x) / F.box1.x) * F.box1.x;
  // Under a roof or inside a wall: no rain there.
  if (p.z < -6.45) {
    return offscreen();
  }
  let toP = p - F.cam.xyz;
  let dist = length(toP);
  let rd = toP / dist;
  let fwd = dot(toP, cross(F.camUp.xyz, F.camRight.xyz));
  if (fwd < 0.35) {
    return offscreen();
  }
  // A streak: from where the drop is back along its motion for one exposure.
  let vel = normalize(vec3f(F.rain2.x, -1.0, 0.0));
  let len = F.rain.z * (1.0 - snow) * (0.8 + 0.4 * h2.z);
  let head = p;
  let tail = p - vel * len;
  let c0 = F.viewProj * vec4f(head, 1.0);
  let c1 = F.viewProj * vec4f(tail, 1.0);
  let half = F.view.zw * 0.5;
  let s0 = c0.xy / c0.w * half;
  let s1 = c1.xy / max(c1.w, 0.05) * half;
  var dir = s1 - s0;
  let l = length(dir);
  dir = select(vec2f(0.0, 1.0), dir / max(l, 1e-4), l > 1e-3);
  let nrm = vec2f(-dir.y, dir.x);
  // Width in pixels; thinner than a pixel keeps one and fades instead, so it never shimmers.
  let worldW = mix(F.rain.w, 0.03, snow) * F.rain3.x * (0.7 + 0.6 * h2.w);
  let pxW = worldW * F.viewProj[1][1] * half.y / c0.w;
  let w = max(pxW, 1.15);
  let thin = min(pxW / 1.15, 1.0);
  var corner = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(1, 1), vec2f(0, -1), vec2f(1, 1), vec2f(0, 1));
  let k = corner[vi];
  let along = k.x;
  let clip = mix(c0, c1, along);
  let ext = dir * (along * 2.0 - 1.0) * w * 0.5 + nrm * k.y * w * 0.5;
  var o: DropOut;
  o.pos = clip + vec4f(ext / half * clip.w, 0.0, 0.0);
  o.uv = vec2f(k.y, along);
  o.shape = snow;
  let lamps = litAt(p, rd, mix(0.6, 0.3, snow));
  let li = lamps + skyColor(vec3f(0.0, 1.0, 0.0)) * F.ambient.rgb * 0.6;
  let vis = mix(1.0, smoothstep(0.003, 0.05, luma(lamps)), F.rain2.y);
  let fogT = exp(-F.fog.x * dist * 0.7);
  let near = smoothstep(0.35, 1.4, fwd);
  let farFade = 1.0 - smoothstep(F.box1.z * 0.7, F.box1.z, dist);
  let a = mix(0.32, 0.8, snow) * vis * thin * fogT * near * farFade * F.rain3.y;
  o.col = vec4f(li * mix(1.6, 2.2, snow) * a, a * mix(0.08, 0.5, snow));
  return o;
}

@fragment
fn fs_rain(in: DropOut) -> @location(0) vec4f {
  let across = 1.0 - in.uv.x * in.uv.x;
  let ends = smoothstep(0.0, 0.25, in.uv.y) * smoothstep(1.0, 0.6, in.uv.y);
  let streak = across * mix(ends, 1.0, 0.25);
  let flake = smoothstep(1.0, 0.2, length(vec2f(in.uv.x, in.uv.y * 2.0 - 1.0)));
  let a = mix(streak, flake, in.shape);
  return in.col * a;
}

// ——— splashes ———
struct SplashOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec4f,
  @location(1) uv: vec2f,
  @location(2) age: f32,
  @location(3) seed: f32,
}

@vertex
fn vs_splash(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SplashOut {
  let h = rnd4(ii * 7u + 11u);
  let rate = F.splash.y * (0.7 + 0.6 * h.x);
  let cyc = F.cam.w * rate + h.y;
  let cycle = floor(cyc);
  let life = F.splash.z;
  let age = fract(cyc) / rate;
  if (age > life || F.splash.x < 1.0) {
    var o: SplashOut;
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return o;
  }
  let at = rnd4(ii * 7u + u32(cycle) * 2654435761u);
  var p = vec3f(mix(-11.0, 12.0, at.x), 0.0, mix(-6.3, 7.5, at.y * at.y));
  if (p.z < -3.0) {
    p.y = 0.15;
  }
  let t = age / life;
  let size = F.splash.w * (0.035 + 0.035 * at.z) * (0.6 + 0.8 * t);
  var corner = array<vec2f, 6>(vec2f(-1, 0), vec2f(1, 0), vec2f(1, 1), vec2f(-1, 0), vec2f(1, 1), vec2f(-1, 1));
  let k = corner[vi];
  let right = normalize(vec3f(F.camRight.x, 0.0, F.camRight.z));
  let wp = p + right * k.x * size + vec3f(0.0, k.y * size * 1.1, 0.0);
  var o: SplashOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.uv = k;
  o.age = t;
  o.seed = at.w;
  let rd = normalize(p - F.cam.xyz);
  let lamps = litAt(p + vec3f(0.0, 0.05, 0.0), rd, 0.3);
  let li = lamps + skyColor(vec3f(0.0, 1.0, 0.0)) * F.ambient.rgb * 0.4;
  let vis = mix(1.0, smoothstep(0.003, 0.05, luma(lamps)), F.rain2.y);
  let dist = length(p - F.cam.xyz);
  let a = 0.75 * vis * exp(-F.fog.x * dist * 0.7) * (1.0 - smoothstep(14.0, 22.0, dist));
  o.col = vec4f(li * 1.8 * a, a * 0.15);
  return o;
}

@fragment
fn fs_splash(in: SplashOut) -> @location(0) vec4f {
  // A drop landing: a brief flash where it hits, and a few droplets thrown up and falling back.
  let base = smoothstep(0.35, 0.0, length(vec2f(in.uv.x * 0.6, in.uv.y * 2.2))) * (1.0 - smoothstep(0.0, 0.35, in.age));
  var drops = 0.0;
  for (var i = 0; i < 5; i++) {
    let fi = f32(i);
    let hx = fract(sin(in.seed * 91.0 + fi * 13.1) * 437.5) * 2.0 - 1.0;
    let up = 0.5 + 0.5 * fract(sin(in.seed * 27.0 + fi * 7.7) * 931.3);
    let dp = vec2f(hx * in.age * 0.9, up * 3.2 * in.age * (1.0 - in.age));
    drops += smoothstep(0.075, 0.015, length(in.uv - dp));
  }
  let a = clamp(base * 0.8 + drops, 0.0, 1.0) * (1.0 - in.age * in.age);
  return in.col * a;
}

// ——— sprites: smoke, fire, embers and drips ———
struct SpriteOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) light: vec3f,
  @location(2) @interpolate(flat) idx: u32,
  @location(3) fogT: f32,
}

@vertex
fn vs_sprite(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SpriteOut {
  let S = sprites[ii];
  var corner = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let k = corner[vi];
  let rot = S.emit.w;
  let cs = vec2f(cos(rot), sin(rot));
  var q = vec2f(k.x * cs.x - k.y * cs.y, k.x * cs.y + k.y * cs.x);
  let kind = u32(S.info.x + 0.5);
  var up = F.camUp.xyz;
  var right = F.camRight.xyz;
  if (kind >= 2u) {
    // Embers and drips stretch along their motion.
    q = vec2f(k.x * 0.35, k.y * (1.0 + S.info.z));
  }
  let wp = S.pos.xyz + (right * q.x + up * q.y) * S.pos.w;
  var o: SpriteOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.uv = k;
  o.idx = ii;
  let rd = normalize(S.pos.xyz - F.cam.xyz);
  o.light = litAt(S.pos.xyz, rd, 0.2) * 0.6 + skyColor(vec3f(0.0, 1.0, 0.0)) * F.ambient.rgb * 0.8;
  o.fogT = exp(-F.fog.x * length(S.pos.xyz - F.cam.xyz) * 0.6);
  return o;
}

@fragment
fn fs_sprite(in: SpriteOut) -> @location(0) vec4f {
  let S = sprites[in.idx];
  let kind = u32(S.info.x + 0.5);
  let r = length(in.uv);
  if (kind >= 2u) {
    let a = smoothstep(1.0, 0.0, r) * S.col.a;
    return vec4f((S.col.rgb * S.emit.x + S.col.rgb * in.light * 0.5) * a * in.fogT, a * 0.3);
  }
  // A puff: a soft ball broken up by noise that drifts with its seed, coloured by the FX tab's
  // smoke-over-life gradient at its age. Warm colours glow (fire); cool and grey ones don't.
  let base = select(S.col.rgb, rampAt(0.0, S.info.w).rgb * S.col.rgb, S.info.w >= 0.0);
  let heat = clamp((base.r - base.b) * 1.8, 0.0, 1.0);
  let n = textureSampleLevel(noiseTex, wrap, (in.uv * 1.6 + vec2f(S.info.y * 17.0, S.info.y * 5.0)) * 0.25, 0.0).r;
  let ball = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7);
  let a = clamp(ball * S.col.a, 0.0, 1.0);
  let lit = base * in.light * (0.65 + 0.7 * n);
  var fire = base * S.emit.x * heat * smoothstep(0.2, 0.9, ball) * (0.6 + 0.8 * n);
  // Hotter burns whiter.
  fire = mix(fire, vec3f(luma(fire)) * vec3f(1.0, 0.94, 0.86) * 1.3, clamp(S.emit.y, 0.0, 0.8));
  return vec4f((lit * a + fire) * in.fogT, a * in.fogT);
}
