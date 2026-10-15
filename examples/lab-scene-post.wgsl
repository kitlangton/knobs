// The Lab's night street, after the scene: bloom down and up a chain of half-size targets, then
// exposure, a filmic tone curve, vignette and dither into the canvas.

struct Post {
  texel: vec4f,  // the source's texel size, and the target's
  params: vec4f, // exposure (linear), bloom strength, grain seed, upsample radius
  extra: vec4f,  // vignette, unused, unused, view count (composite)
  viewExposure: vec4f,
  viewRect: array<vec4f, 4>, // uv min.xy, max.xy
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> P: Post;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;

struct FullOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FullOut {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: FullOut;
  o.pos = vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  o.uv = uv;
  return o;
}

fn tap(uv: vec2f) -> vec3f {
  return textureSampleLevel(src, samp, uv, 0.0).rgb;
}
fn karis(c: vec3f) -> f32 {
  return 1.0 / (1.0 + dot(c, vec3f(0.2126, 0.7152, 0.0722)));
}

/** 13 taps (Jimenez, CoD: AW). The first level weighs each group by its brightness, so a lone hot
 *  pixel can't flicker into a big blob. */
@fragment
fn fs_down(in: FullOut) -> @location(0) vec4f {
  let t = P.texel.xy;
  let uv = in.uv;
  let a = tap(uv + t * vec2f(-2.0, -2.0));
  let b = tap(uv + t * vec2f(0.0, -2.0));
  let c = tap(uv + t * vec2f(2.0, -2.0));
  let d = tap(uv + t * vec2f(-2.0, 0.0));
  let e = tap(uv);
  let f = tap(uv + t * vec2f(2.0, 0.0));
  let g = tap(uv + t * vec2f(-2.0, 2.0));
  let h = tap(uv + t * vec2f(0.0, 2.0));
  let i = tap(uv + t * vec2f(2.0, 2.0));
  let j = tap(uv + t * vec2f(-1.0, -1.0));
  let k = tap(uv + t * vec2f(1.0, -1.0));
  let l = tap(uv + t * vec2f(-1.0, 1.0));
  let m = tap(uv + t * vec2f(1.0, 1.0));
  if (P.params.w < 0.0) {
    let g0 = (a + b + d + e) * 0.25;
    let g1 = (b + c + e + f) * 0.25;
    let g2 = (d + e + g + h) * 0.25;
    let g3 = (e + f + h + i) * 0.25;
    let g4 = (j + k + l + m) * 0.25;
    let w0 = karis(g0) * 0.125;
    let w1 = karis(g1) * 0.125;
    let w2 = karis(g2) * 0.125;
    let w3 = karis(g3) * 0.125;
    let w4 = karis(g4) * 0.5;
    let sum = g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4;
    return vec4f(sum / max(w0 + w1 + w2 + w3 + w4, 1e-4), 1.0);
  }
  var o = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  return vec4f(o, 1.0);
}

/** A 3×3 tent from the smaller level, added onto the larger one by the blend state. */
@fragment
fn fs_up(in: FullOut) -> @location(0) vec4f {
  let t = P.texel.xy * P.params.w;
  let uv = in.uv;
  var o = tap(uv) * 4.0;
  o += (tap(uv + vec2f(-t.x, 0.0)) + tap(uv + vec2f(t.x, 0.0)) + tap(uv + vec2f(0.0, -t.y)) + tap(uv + vec2f(0.0, t.y))) * 2.0;
  o += tap(uv + vec2f(-t.x, -t.y)) + tap(uv + vec2f(t.x, -t.y)) + tap(uv + vec2f(-t.x, t.y)) + tap(uv + vec2f(t.x, t.y));
  return vec4f(o / 16.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fs_composite(in: FullOut) -> @location(0) vec4f {
  let scene = textureSampleLevel(src, samp, in.uv, 0.0).rgb;
  let bloom = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb;
  // Each view keeps its own exposure: an A/B snapshot, a grid cell.
  var exposure = 1.0;
  for (var i = 0u; i < u32(P.extra.w); i++) {
    let r = P.viewRect[i];
    if (all(in.uv >= r.xy) && all(in.uv < r.zw)) {
      exposure = P.viewExposure[i];
    }
  }
  var c = mix(scene, bloom, P.params.y) * P.params.x * exposure;
  let d = in.uv - 0.5;
  c *= 1.0 - P.extra.x * dot(d, d) * 1.6;
  c = aces(c);
  var o = toSrgb(c);
  // Dither by a fraction of a code value, so the night sky's gradients never band.
  let n = hash(in.pos.xy + P.params.z) + hash(in.pos.xy * 1.37 - P.params.z) - 1.0;
  o += n / 255.0;
  return vec4f(o, 1.0);
}
