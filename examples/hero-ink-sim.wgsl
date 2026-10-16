// The ink hero's fluid: stable fluids on a small velocity grid (y down, velocities in grid cells a
// second), carrying dye on a finer one. Each frame: curl, vorticity confinement and viscous
// diffusion, divergence, a Jacobi pressure solve (warm-started from last frame's, decayed), the
// gradient subtracted, then the velocity advects itself and the dye (MacCormack, clamped, so the
// filaments stay thin) with the emitters' jets and the hand's stirs added in. Every pass reads
// one or two textures and writes one; the edges are open (clamped), so a current flows through.

struct Splat {
  // xy: where (uv), z: radius² (in heights²), w: 1 sets the velocity towards `force`, 0 adds it
  at: vec4f,
  // xy: velocity (cells/s), z: how fast a set pulls (1/s)
  force: vec4f,
  // rgb: dye added a second at the centre
  color: vec4f,
}

struct Sim {
  grid: vec4f,   // velocity grid: w, h, 1/w, 1/h
  dyeRes: vec4f, // dye grid: w, h, 1/w, 1/h
  step: vec4f,   // dt, vorticity, diffusion (per step, ≤ .24), velocity dissipation (1/s)
  more: vec4f,   // dye dissipation (1/s), aspect (w/h), splats, pressure decay
  current: vec4f, // xy: a body acceleration (cells/s²), z: haze eaten a second
  splats: array<Splat, 12>,
}

@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcA: texture_2d<f32>;
@group(0) @binding(3) var srcB: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;

fn ld(t: texture_2d<f32>, p: vec2i) -> vec4f {
  let hi = vec2i(textureDimensions(t)) - 1;
  return textureLoad(t, clamp(p, vec2i(0), hi), 0);
}
fn uvOf(p: vec2u, inv: vec2f) -> vec2f {
  return (vec2f(p) + 0.5) * inv;
}
fn inside(p: vec2u) -> bool {
  let d = textureDimensions(dst);
  return p.x < d.x && p.y < d.y;
}

/** The splats' pull on a point (uv), velocity in and out. */
fn splatVelocity(uv: vec2f, v0: vec2f) -> vec2f {
  var v = v0;
  let n = u32(S.more.z);
  let dt = S.step.x;
  for (var i = 0u; i < n; i++) {
    let s = S.splats[i];
    let d = (uv - s.at.xy) * vec2f(S.more.y, 1.0);
    let g = exp(-dot(d, d) / s.at.z);
    if (s.at.w > 0.5) {
      v += (s.force.xy - v) * min(1.0, g * s.force.z * dt);
    } else {
      v += s.force.xy * g;
    }
  }
  return v;
}
fn splatDye(uv: vec2f) -> vec3f {
  var c = vec3f(0.0);
  let n = u32(S.more.z);
  for (var i = 0u; i < n; i++) {
    let s = S.splats[i];
    let d = (uv - s.at.xy) * vec2f(S.more.y, 1.0);
    c += s.color.rgb * exp(-dot(d, d) / s.at.z);
  }
  return c * S.step.x;
}

@compute @workgroup_size(8, 8)
fn curl(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  let l = ld(srcA, p - vec2i(1, 0)).y;
  let r = ld(srcA, p + vec2i(1, 0)).y;
  let b = ld(srcA, p - vec2i(0, 1)).x;
  let t = ld(srcA, p + vec2i(0, 1)).x;
  textureStore(dst, p, vec4f(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0));
}

// A: velocity, B: curl. Vorticity confinement puts back the small eddies the grid smooths away;
// the diffusion is the viscosity (explicit, so it stays under a quarter a step).
@compute @workgroup_size(8, 8)
fn vorticity(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  let cl = abs(ld(srcB, p - vec2i(1, 0)).x);
  let cr = abs(ld(srcB, p + vec2i(1, 0)).x);
  let cb = abs(ld(srcB, p - vec2i(0, 1)).x);
  let ct = abs(ld(srcB, p + vec2i(0, 1)).x);
  let c = ld(srcB, p).x;
  var n = 0.5 * vec2f(ct - cb, cr - cl);
  n /= length(n) + 1e-5;
  let force = vec2f(n.x, -n.y) * c * S.step.y;
  let v = ld(srcA, p).xy;
  let around = ld(srcA, p - vec2i(1, 0)).xy + ld(srcA, p + vec2i(1, 0)).xy +
    ld(srcA, p - vec2i(0, 1)).xy + ld(srcA, p + vec2i(0, 1)).xy;
  var o = v + force * S.step.x + S.step.z * (around - 4.0 * v);
  o = clamp(o, vec2f(-1000.0), vec2f(1000.0));
  textureStore(dst, p, vec4f(o, 0.0, 1.0));
}

@compute @workgroup_size(8, 8)
fn divergence(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  let l = ld(srcA, p - vec2i(1, 0)).x;
  let r = ld(srcA, p + vec2i(1, 0)).x;
  let b = ld(srcA, p - vec2i(0, 1)).y;
  let t = ld(srcA, p + vec2i(0, 1)).y;
  textureStore(dst, p, vec4f(0.5 * (r - l + t - b), 0.0, 0.0, 1.0));
}

// Last frame's pressure, decayed: a warm start for the solve.
@compute @workgroup_size(8, 8)
fn decay(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  textureStore(dst, p, vec4f(ld(srcA, p).x * S.more.w, 0.0, 0.0, 1.0));
}

// A: pressure, B: divergence.
@compute @workgroup_size(8, 8)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  let l = ld(srcA, p - vec2i(1, 0)).x;
  let r = ld(srcA, p + vec2i(1, 0)).x;
  let b = ld(srcA, p - vec2i(0, 1)).x;
  let t = ld(srcA, p + vec2i(0, 1)).x;
  let d = ld(srcB, p).x;
  textureStore(dst, p, vec4f((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0));
}

// A: pressure, B: velocity.
@compute @workgroup_size(8, 8)
fn gradient(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let p = vec2i(id.xy);
  let l = ld(srcA, p - vec2i(1, 0)).x;
  let r = ld(srcA, p + vec2i(1, 0)).x;
  let b = ld(srcA, p - vec2i(0, 1)).x;
  let t = ld(srcA, p + vec2i(0, 1)).x;
  let v = ld(srcB, p).xy - 0.5 * vec2f(r - l, t - b);
  textureStore(dst, p, vec4f(v, 0.0, 1.0));
}

// A: velocity. It carries itself, loses a little, drifts with the current and takes the splats.
@compute @workgroup_size(8, 8)
fn advectVelocity(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let uv = uvOf(id.xy, S.grid.zw);
  let dt = S.step.x;
  let back = uv - dt * textureSampleLevel(srcA, samp, uv, 0.0).xy * S.grid.zw;
  var v = textureSampleLevel(srcA, samp, back, 0.0).xy;
  v /= 1.0 + S.step.w * dt;
  v += S.current.xy * dt;
  v = splatVelocity(uv, v);
  textureStore(dst, vec2i(id.xy), vec4f(v, 0.0, 1.0));
}

// A: dye, B: velocity. Back along the flow, forward again to estimate the error, half of it
// corrected and clamped to what the four texels around the source held (no new extremes).
@compute @workgroup_size(8, 8)
fn advectDye(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let uv = uvOf(id.xy, S.dyeRes.zw);
  let dt = S.step.x;
  let vel = textureSampleLevel(srcB, samp, uv, 0.0).xy * S.grid.zw;
  let back = uv - dt * vel;
  let there = textureSampleLevel(srcA, samp, back, 0.0).rgb;
  let fwd = back + dt * textureSampleLevel(srcB, samp, back, 0.0).xy * S.grid.zw;
  let again = textureSampleLevel(srcA, samp, fwd, 0.0).rgb;
  let here = textureSampleLevel(srcA, samp, uv, 0.0).rgb;
  var c = there + 0.5 * (here - again);
  let q = vec2i(floor(back * S.dyeRes.xy - 0.5));
  let a = ld(srcA, q).rgb;
  let b = ld(srcA, q + vec2i(1, 0)).rgb;
  let e = ld(srcA, q + vec2i(0, 1)).rgb;
  let f = ld(srcA, q + vec2i(1, 1)).rgb;
  c = clamp(c, min(min(a, b), min(e, f)), max(max(a, b), max(e, f)));
  c /= 1.0 + S.more.x * dt;
  // The faintest haze goes outright, so the dark stays dark between the filaments.
  c = max(c - vec3f(S.current.z * dt), vec3f(0.0));
  c += splatDye(uv);
  textureStore(dst, vec2i(id.xy), vec4f(max(c, vec3f(0.0)), 1.0));
}

// A: a field, resampled onto a grid of another size (on resize, so nothing is lost).
@compute @workgroup_size(8, 8)
fn resample(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id.xy)) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(textureDimensions(dst));
  textureStore(dst, vec2i(id.xy), textureSampleLevel(srcA, samp, uv, 0.0));
}
