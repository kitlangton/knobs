// The catalog's previews, after their scene: bloom down and up a chain of half-size targets (a
// 13-tap filter down, Karis-weighted on the first level so a hot pixel can't flicker; a 3×3 tent
// up, added onto the level above by the blend state), then exposure, a tone curve and blue-noise
// dither into the canvas. AgX for lit scenes; for flat UI scenes a curve that leaves everything
// under 0.8 exactly as drawn and only rolls highlights off. A scene on a base colour (its page)
// has its bloom fade out before the canvas's edge, and no dither where it's exactly that colour.

struct Post {
  texel: vec4f,  // the source's texel size (xy)
  params: vec4f, // x: 1 on the first level down, y: upsample radius, z: bloom mix, w: exposure
  look: vec4f,   // x: tone (0 AgX, 1 neutral), y: vignette, z: saturation, w: 1 with a base
  base: vec4f,   // the base colour (linear), w: the edge the bloom fades over (fraction of a side)
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> P: Post;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var noise: texture_2d<f32>;

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
  if (P.params.x > 0.5) {
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

@fragment
fn fs_up(in: FullOut) -> @location(0) vec4f {
  let t = P.texel.xy * P.params.y;
  let uv = in.uv;
  var o = tap(uv) * 4.0;
  o += (tap(uv + vec2f(-t.x, 0.0)) + tap(uv + vec2f(t.x, 0.0)) + tap(uv + vec2f(0.0, -t.y)) + tap(uv + vec2f(0.0, t.y))) * 2.0;
  o += tap(uv + vec2f(-t.x, -t.y)) + tap(uv + vec2f(t.x, -t.y)) + tap(uv + vec2f(-t.x, t.y)) + tap(uv + vec2f(t.x, t.y));
  return vec4f(o / 16.0, 1.0);
}

// A temporal view's history: this frame folded into the last at `params.x`. With `params.y`,
// the last is first clipped to this frame's 3×3 neighbourhood (its mean ± `params.z` deviations,
// in a range-compressed space so an LED can't dominate), so anything that changed or moved
// takes its new look within a frame or two instead of ghosting; static edges keep their history.
fn squash(c: vec3f) -> vec3f {
  return c / (1.0 + dot(c, vec3f(0.2126, 0.7152, 0.0722)));
}
fn unsquash(c: vec3f) -> vec3f {
  return c / max(1.0 - dot(c, vec3f(0.2126, 0.7152, 0.0722)), 1e-4);
}
@fragment
fn fs_taa(in: FullOut) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy);
  let now = textureLoad(src, p, 0).rgb;
  let k = P.params.x;
  if (k >= 1.0) {
    return vec4f(now, 1.0);
  }
  var last = squash(textureLoad(bloomTex, p, 0).rgb);
  let c = squash(now);
  if (P.params.y > 0.5) {
    let hi = vec2i(textureDimensions(src)) - 1;
    var m1 = vec3f(0.0);
    var m2 = vec3f(0.0);
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let s = squash(textureLoad(src, clamp(p + vec2i(x, y), vec2i(0), hi), 0).rgb);
        m1 += s;
        m2 += s * s;
      }
    }
    let mean = m1 / 9.0;
    let dev = sqrt(max(m2 / 9.0 - mean * mean, vec3f(0.0)));
    last = clamp(last, mean - P.params.z * dev, mean + P.params.z * dev);
  }
  return vec4f(unsquash(mix(last, c, k)), 1.0);
}

// AgX (Troy Sobotka's), in Benjamin Wrensch's minimal fit: hues hold as they brighten to white.
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn agx(c: vec3f) -> vec3f {
  let m = mat3x3f(
    vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
    vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
    vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
  );
  let lo = -12.47393;
  let hi = 4.026069;
  var x = clamp(log2(max(m * c, vec3f(1e-10))), vec3f(lo), vec3f(hi));
  x = (x - lo) / (hi - lo);
  let y = agxContrast(x);
  let mi = mat3x3f(
    vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
    vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
    vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
  );
  return pow(max(mi * y, vec3f(0.0)), vec3f(2.2));
}
// Exactly the input below 0.8; above, a Khronos-neutral style shoulder towards white.
fn neutral(c0: vec3f) -> vec3f {
  let knee = 0.8;
  let peak = max(c0.r, max(c0.g, c0.b));
  if (peak <= knee) {
    return c0;
  }
  let d = 1.0 - knee;
  let np = 1.0 - d * d / (peak + d - knee);
  let c = c0 * (np / peak);
  let g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3f(np), g);
}
fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment
fn fs_composite(in: FullOut) -> @location(0) vec4f {
  let scene = textureSampleLevel(src, samp, in.uv, 0.0).rgb;
  // Five levels were summed into the first, so a flat field blooms to itself: no veil.
  let bloom = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * 0.2;
  var c = mix(scene, bloom, P.params.z);
  if (P.look.w > 0.5) {
    let e = P.base.w;
    let m = smoothstep(vec2f(0.0), vec2f(e), in.uv) * smoothstep(vec2f(0.0), vec2f(e), 1.0 - in.uv);
    c = mix(scene, c, m.x * m.y);
  }
  c *= P.params.w;
  let d = in.uv - 0.5;
  c *= 1.0 - P.look.y * dot(d, d) * 1.6;
  if (P.look.x < 0.5) {
    c = agx(c);
    let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3f(l), c, P.look.z), vec3f(0.0));
  } else {
    c = neutral(c);
  }
  var o = toSrgb(clamp(c, vec3f(0.0), vec3f(1.0)));
  // Blue noise, a different phase per channel, by a code value: gradients never band.
  let p = vec2i(in.pos.xy);
  let n = vec3f(
    textureLoad(noise, p % 64, 0).r,
    textureLoad(noise, (p + vec2i(23, 41)) % 64, 0).r,
    textureLoad(noise, (p + vec2i(47, 11)) % 64, 0).r,
  );
  var amount = 1.0;
  if (P.look.w > 0.5) {
    // Flat page stays its exact code value; the dither comes in as the signal leaves it.
    let d = abs(o - toSrgb(P.base.rgb));
    amount = smoothstep(0.25 / 255.0, 2.0 / 255.0, max(d.r, max(d.g, d.b)));
  }
  o += (n - 0.5) / 255.0 * amount;
  return vec4f(o, 1.0);
}
