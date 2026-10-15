// The object scene: one ray-marched shape on an infinite studio cove. Its SDF is a blend of a
// sphere, a rounded cube and a torus (the Shape choice, morphing), scaled per axis, turned by Spin
// and placed by Position; the Slice range cuts it between two heights and shows the cut face; a
// Truchet pattern from the seed is inlaid on it (tri-planar), each tile turning 90° to the next
// seed's. The key light comes from the Light pad, with soft shadows and occlusion on the floor.
// Moving, it renders five instants across a shutter (Argon's 1/34 s) and averages them: real
// motion blur that is exactly none at rest, where four sub-pixel samples anti-alias it instead.
//
// u.v[0]  position (world), spin (rad)
// u.v[1]  velocity (world/s), spin velocity (rad/s)
// u.v[2]  scale xyz, shutter (s)
// u.v[3]  shape weights (sphere, cube, torus), tone
// u.v[4]  albedo (linear), samples
// u.v[5]  light direction, pattern turn (0 → 1)
// u.v[6]  slice low, high (object y, −1…1), seed from, seed to
// u.v[7]  roughness, inlay strength

const CAM = vec3f(0.0, 0.55, 4.6);
const LOOK = vec3f(0.0, -0.05, 0.0);
const FOCAL = 1.75;
const FLOOR_Y = -1.12;
const TILT = -0.32;

struct Pose {
  pos: vec3f,
  spin: f32,
}
var<private> pose: Pose;

fn rotY(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
fn rotX(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}
/** World to the object's own unit space (before scale). */
fn local(p: vec3f) -> vec3f {
  return rotX(rotY(p - pose.pos, -pose.spin), -TILT);
}

fn sdShape(q: vec3f) -> f32 {
  let w = u.v[3].xyz / max(u.v[3].x + u.v[3].y + u.v[3].z, 1e-4);
  let sphere = length(q) - 0.82;
  let b = abs(q) - vec3f(0.6);
  let cube = length(max(b, vec3f(0.0))) + min(max(b.x, max(b.y, b.z)), 0.0) - 0.12;
  let tq = vec2f(length(q.xz) - 0.58, q.y);
  let torus = length(tq) - 0.26;
  return w.x * sphere + w.y * cube + w.z * torus;
}

/** Distance, and 1 where the slice's cut face is the surface. */
fn map(p: vec3f) -> vec2f {
  let sc = u.v[2].xyz;
  let q = local(p) / sc;
  let k = min(sc.x, min(sc.y, sc.z));
  let d = sdShape(q) * k;
  let lo = (u.v[6].x - q.y) * sc.y;
  let hi = (q.y - u.v[6].y) * sc.y;
  let cut = max(lo, hi);
  if (cut > d) {
    return vec2f(cut, 1.0);
  }
  return vec2f(d, 0.0);
}

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.0015, -0.0015);
  return normalize(
    e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x,
  );
}

fn march(ro: vec3f, rd: vec3f) -> vec2f {
  var t = 1.0;
  for (var i = 0; i < 96; i++) {
    let h = map(ro + rd * t).x;
    if (h < 0.0008 * t) {
      return vec2f(t, 1.0);
    }
    t += h * 0.9;
    if (t > 9.0) {
      break;
    }
  }
  return vec2f(t, 0.0);
}

fn softShadow(ro: vec3f, rd: vec3f) -> f32 {
  var res = 1.0;
  var t = 0.02;
  for (var i = 0; i < 40; i++) {
    let h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.002 || t > 5.0) {
      break;
    }
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}

fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var o = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = 0.04 * f32(i) * f32(i);
    o += w * (h - map(p + n * h).x);
    w *= 0.6;
  }
  return clamp(1.0 - 1.6 * o, 0.0, 1.0);
}

fn hash2(c: vec2f, seed: f32) -> f32 {
  return hash12(c + vec2f(seed * 0.0123, seed * 0.0071));
}

/** One plane of Truchet arcs: 1 on a line. Tiles that differ between seeds turn as `turn` runs. */
fn truchet(uv: vec2f) -> f32 {
  let cell = floor(uv);
  var f = fract(uv) - 0.5;
  let a = hash2(cell, u.v[6].z) < 0.5;
  let b = hash2(cell, u.v[6].w) < 0.5;
  if (a) {
    f.x = -f.x;
  }
  if (a != b) {
    // A sweep across the surface: each tile turns in its own moment.
    let lt = smoothstep(0.0, 1.0, clamp(u.v[5].w * 1.8 - hash12(cell * 1.7 + 3.1) * 0.8, 0.0, 1.0));
    let ang = lt * PI * 0.5 * select(1.0, -1.0, a);
    let c = cos(ang);
    let s = sin(ang);
    f = vec2f(c * f.x - s * f.y, s * f.x + c * f.y);
  }
  let d = min(abs(length(f - vec2f(0.5)) - 0.5), abs(length(f + vec2f(0.5)) - 0.5));
  return 1.0 - smoothstep(0.045, 0.085, d);
}

fn inlay(q: vec3f, n: vec3f) -> f32 {
  var w = pow(abs(n), vec3f(4.0));
  w /= w.x + w.y + w.z;
  let s = 3.0;
  return truchet(q.yz * s) * w.x + truchet(q.zx * s) * w.y + truchet(q.xy * s) * w.z;
}

fn ggx(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l);
  let nh = max(dot(n, h), 0.0);
  let a2 = rough * rough * rough * rough;
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * dd * dd) / (4.0 * max(dot(n, v), 0.2));
}

fn backdrop(rd: vec3f) -> vec3f {
  let tone = u.v[3].w;
  let dark = mix(vec3f(0.006), vec3f(0.014), sat(rd.y * 2.0 + 0.6));
  let light = mix(vec3f(0.56), vec3f(0.72), sat(rd.y * 2.0 + 0.6));
  return mix(dark, light, tone);
}

fn render(px: vec2f, tau: f32) -> vec3f {
  pose = Pose(u.v[0].xyz + u.v[1].xyz * tau, u.v[0].w + u.v[1].w * tau);
  let res = u.frame.xy;
  let uv = (px - 0.5 * res) / res.y * vec2f(1.0, -1.0);
  let fwd = normalize(LOOK - CAM);
  let right = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, fwd);
  let rd = normalize(uv.x * right + uv.y * up + FOCAL * fwd);
  let tone = u.v[3].w;
  let l = u.v[5].xyz;
  let hit = march(CAM, rd);
  let tf = select(1e9, (FLOOR_Y - CAM.y) / rd.y, rd.y < 0.0);
  if (hit.y > 0.5 && hit.x < tf) {
    let p = CAM + rd * hit.x;
    let n = normalAt(p);
    let v = -rd;
    let cutFace = map(p).y > 0.5;
    let q = local(p) / u.v[2].xyz;
    let qn = rotX(rotY(n, -pose.spin), -TILT);
    var albedo = u.v[4].rgb;
    var rough = u.v[7].x;
    let line = inlay(q, qn) * u.v[7].y;
    if (cutFace) {
      albedo = mix(albedo, vec3f(0.9), 0.55);
      rough = 0.8;
    }
    albedo = mix(albedo, mix(albedo * 0.35, vec3f(0.95), 0.35), line);
    let sh = softShadow(p + n * 0.004, l);
    let ao = occlusion(p, n);
    let ndl = max(dot(n, l), 0.0);
    let amb = mix(0.07, 0.3, tone);
    var col = albedo * (1.05 * ndl * sh + amb * ao * (0.6 + 0.4 * n.y));
    // A soft fill from the camera side, so nothing goes black.
    col += albedo * mix(0.04, 0.1, tone) * max(dot(n, v), 0.0) * ao;
    let fr = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    col += vec3f(fr * ggx(n, v, l, rough) * 1.4 * ndl * sh);
    // A clear coat: a tight highlight, and the studio in the rim.
    col += vec3f(fr * ggx(n, v, l, 0.12) * 0.5 * ndl * sh * (1.0 - line * 0.7));
    col += backdrop(reflect(rd, n)) * fr * ao * 1.2;
    return col;
  }
  if (rd.y < 0.0) {
    let p = CAM + rd * tf;
    let n = vec3f(0.0, 1.0, 0.0);
    let sh = softShadow(p + n * 0.003, l);
    let ao = occlusion(p, n);
    // The cove: the floor fades into the backdrop with distance.
    let base = backdrop(vec3f(rd.x, -0.15, rd.z));
    var col = base * mix(0.55, 1.0, sh) * mix(0.35, 1.0, ao);
    // The object's colour bleeds onto the floor beneath it.
    col += u.v[4].rgb * (1.0 - ao) * mix(0.02, 0.12, tone);
    let fade = sat((p.z + 6.0) / 4.0);
    return mix(backdrop(rd), col, fade);
  }
  return backdrop(rd);
}

fn scene(px: vec2f) -> vec3f {
  let n = i32(u.v[4].w);
  let shutter = u.v[2].w;
  var c = vec3f(0.0);
  for (var i = 0; i < n; i++) {
    let fi = f32(i);
    // Sub-pixel offsets on a rotated grid, and instants across the shutter, interleaved.
    let a = fi * 2.39996 + hash12(px) * 6.283;
    let r = sqrt((fi + 0.5) / f32(n)) * 0.5;
    let tau = (((fi + hash12(px.yx)) / f32(n)) - 0.5) * shutter;
    c += render(px + vec2f(cos(a), sin(a)) * r, tau);
  }
  return c / f32(max(n, 1));
}
