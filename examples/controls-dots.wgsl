// The metaball dots on WebGPU: Argon's field and shutter (controls-goo.ts's WebGL shader, ported),
// lit. The union of up to eight stretched dots under a polynomial smooth-min; its coverage is
// integrated across a raised-cosine shutter while anything moves, so trails smear and a resting
// row is razor crisp. The surface is read as a pillow (height from depth inside the field), so
// each dot and every neck between two catches a key light from the upper left, a tight highlight
// and a rim, and lays a soft shadow on the stage. Pearl on dark, black glass on light.
//
// u.v[0..7]   dots: x, y, r, opacity (CSS px)
// u.v[8..15]  direction xy, stretch, shutter travel (px)
// u.v[16..19] per dot: neck share, radial travel (two dots per vec4)
// u.v[20]     smooth-min k, goo (0 apart / 1 joined), shutter samples, dpr
// u.v[21]     ink (linear, already over the stage), tone
// u.v[22]     stage colour (linear), nominal radius

fn smin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) {
    return min(a, b);
  }
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

fn dotK(i: u32) -> vec2f {
  let q = u.v[16u + i / 2u];
  return select(q.zw, q.xy, i % 2u == 0u);
}

struct Field {
  d: f32,
  sub: f32,
  apart: f32,
}

/** The field at p, `tau` of the way across the shutter (−½…½). */
fn field(p: vec2f, tau: f32, invS: f32, aa: f32) -> Field {
  var d = 1e5;
  var subE = 0.0;
  var wsum = 0.0;
  var apart = 0.0;
  for (var i = 0u; i < 8u; i++) {
    let D = u.v[i];
    if (D.z < 0.05) {
      continue;
    }
    let V = u.v[8u + i];
    let K = dotK(i);
    let r = max(0.05, D.z + tau * K.y);
    let q = p - D.xy;
    let dir = V.xy;
    let lq = vec2f(dot(q, dir) - tau * V.w, dot(q, vec2f(-dir.y, dir.x)));
    let a = r * V.z;
    let b = r / sqrt(V.z);
    let di = (length(lq / vec2f(a, b)) - 1.0) * min(a, b);
    d = smin(d, di, u.v[20].x * K.x);
    let stepI = (V.w + abs(K.y)) * invS;
    let wi = exp(-max(di, 0.0) * 0.24);
    subE += stepI * wi;
    wsum += wi;
    let ei = aa + 0.55 * stepI;
    apart = max(apart, D.w * (1.0 - smoothstep(-ei, ei, di)));
  }
  var sub = 0.0;
  if (wsum > 0.0) {
    sub = 0.55 * subE / wsum;
  }
  return Field(d, sub, apart);
}

fn coverage(p: vec2f, tau: f32, invS: f32, aa: f32) -> f32 {
  let f = field(p, tau, invS, aa);
  let e = aa + f.sub;
  let goo = 1.0 - smoothstep(-e, e, f.d);
  return mix(f.apart, goo, u.v[20].y);
}

/** The pillow's height at p (px): a dome over each dot, rising from the edge. */
fn height(p: vec2f) -> f32 {
  let R = max(u.v[22].w, 1.0);
  let s = clamp(-field(p, 0.0, 0.0, 0.5).d, 0.0, R);
  return sqrt(max(s * (2.0 * R - s), 0.0));
}

fn scene(px: vec2f) -> vec3f {
  let dpr = u.v[20].w;
  let p = px / dpr;
  let aa = 0.75 / dpr;
  let samples = u.v[20].z;
  var cov = 0.0;
  if (samples <= 1.5) {
    cov = coverage(p, 0.0, 0.0, aa);
  } else {
    let invS = 1.0 / samples;
    let ign = fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
    var cs = 0.0;
    var ws = 0.0;
    for (var s = 0; s < 14; s++) {
      if (f32(s) >= samples) {
        break;
      }
      let uu = (f32(s) + 0.5 + (ign - 0.5) * 0.25) * invS;
      let tau = uu - 0.5;
      let w = 0.64 + 0.36 * cos(tau * 6.2831853);
      cs += w * coverage(p, tau, invS, aa);
      ws += w;
    }
    cov = cs / ws;
  }
  let tone = u.v[21].w;
  let ink = u.v[21].rgb;
  let bg = u.v[22].rgb;
  let R = max(u.v[22].w, 1.0);
  // A soft shadow below and right, wider than the dot.
  let ds = field(p - vec2f(R * 0.12, R * 0.3), 0.0, 0.0, 0.5).d;
  let shadow = (1.0 - smoothstep(-R * 0.4, R * 0.75, ds)) * mix(0.42, 0.16, tone) * u.v[20].y;
  var under = bg * (1.0 - shadow);
  if (cov <= 0.0005) {
    return under;
  }
  var col = ink;
  let d0 = field(p, 0.0, 0.0, 0.5).d;
  if (d0 < 1.0 && u.v[20].y > 0.5) {
    let e = 0.75;
    let hx = height(p + vec2f(e, 0.0)) - height(p - vec2f(e, 0.0));
    let hy = height(p + vec2f(0.0, e)) - height(p - vec2f(0.0, e));
    let n = normalize(vec3f(-hx / (2.0 * e), -hy / (2.0 * e), 1.0));
    let L = normalize(vec3f(-0.45, -0.62, 0.65));
    let V = vec3f(0.0, 0.0, 1.0);
    let diff = max(dot(n, L), 0.0);
    let spec = pow(max(dot(reflect(-L, n), V), 0.0), mix(28.0, 60.0, tone));
    let rim = pow(1.0 - n.z, 2.0);
    // Pearl on dark: lit body and a cool rim. Black glass on light: a hard highlight and the stage in its rim.
    let pearl = ink * (0.58 + 0.5 * diff) + vec3f(spec * 0.55) + vec3f(0.55, 0.62, 0.75) * rim * 0.22;
    let glass = ink * (0.7 + 0.3 * diff) + vec3f(spec * 0.85) + bg * rim * 0.35;
    col = mix(pearl, glass, tone);
  }
  return mix(under, col, cov);
}
