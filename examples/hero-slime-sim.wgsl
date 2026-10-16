// The slime mould (Physarum polycephalum, after Jeff Jones's agent model): a million agents on a
// trail field. Each step an agent smells the field at three sensors ahead of it, turns toward the
// strongest, moves on and leaves a little trail behind; then the field blurs and fades. The field
// they smell also holds what the page puts there: the food (a row, where the pointer leaves it),
// a faint scent wherever the pointer hovers, a ring around the panel and one around the title,
// whose insides they shun. The field wraps at its edges, so nothing piles up there (the render
// fades them out). Each agent carries its own random state.

struct Sim {
  grid: vec4f,   // W, H (cells), agents moving, cells per CSS px
  steer: vec4f,  // sense angle (rad), sense distance (cells), turn (rad), speed (cells a step)
  field: vec4f,  // what a step keeps (1 − decay), deposit, blur mix, the slow channel's rate
  food: vec4f,   // where (cells), how strongly, radius (cells)
  hover: vec4f,  // the pointer (cells), how strongly (0 away), radius
  panel: vec4f,  // the panel's box (cells): x0, y0, x1, y1
  title: vec4f,  // the title's box (cells): x0, y0, x1, y1
  shape: vec4f,  // the boxes' corner radius, the panel's pull (0 with none), the title's, level
  seed: vec4f,   // remapping: the x and y scale (xy); the chance an agent respawns a step (z); a seed (w)
}

@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read> trailIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> trailOut: array<f32>;
@group(0) @binding(4) var<storage, read_write> deposit: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> slow: array<f32>;
@group(0) @binding(6) var look: texture_storage_2d<rgba16float, write>;

const TAU = 6.28318531;
const FIXED = 1024.0;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn unit(r: u32) -> f32 {
  return f32(r >> 8u) / 16777216.0;
}
fn dir(a: f32) -> vec2f {
  return vec2f(cos(a), sin(a));
}
fn bump(p: vec2f, c: vec2f, r: f32) -> f32 {
  let d = p - c;
  return exp(-dot(d, d) / (r * r));
}
fn box(p: vec2f, b: vec4f, r: f32) -> f32 {
  let c = (b.xy + b.zw) * 0.5;
  let h = (b.zw - b.xy) * 0.5 - vec2f(r);
  let q = abs(p - c) - h;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

/** What an agent smells at `p`: the trail, plus everything the page adds. */
fn smell(p: vec2f) -> f32 {
  let W = i32(S.grid.x);
  let H = i32(S.grid.y);
  let q = (vec2i(floor(p)) % vec2i(W, H) + vec2i(W, H)) % vec2i(W, H);
  var v = trailIn[q.y * W + q.x];
  let L = S.shape.w;
  let k = S.grid.w;
  // The food: a broad scent with a strong heart.
  v += L * S.food.z * (0.25 * bump(p, S.food.xy, S.food.w * 4.0) + bump(p, S.food.xy, S.food.w));
  v += L * S.hover.z * bump(p, S.hover.xy, S.hover.w);
  // The panel and the title: a band of scent just outside each, and nothing to go for inside.
  if (S.shape.y > 0.0) {
    let d = box(p, S.panel, S.shape.x);
    let band = (d - 18.0 * k) / (12.0 * k);
    v += L * S.shape.y * exp(-band * band) - L * 2.0 * smoothstep(0.0, -24.0 * k, d);
  }
  if (S.title.z > S.title.x) {
    let d = box(p, S.title, 10.0 * k);
    let band = (d - 10.0 * k) / (6.0 * k);
    v += L * S.shape.z * exp(-band * band) - L * 6.0 * smoothstep(4.0 * k, -8.0 * k, d);
  }
  return v;
}

@compute @workgroup_size(256)
fn crawl(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u32(S.grid.z)) {
    return;
  }
  var a = agents[i];
  var p = a.xy;
  var h = a.z;
  var r = pcg(bitcast<u32>(a.w));
  let sa = S.steer.x;
  let sd = S.steer.y;
  let ra = S.steer.z;
  let f = smell(p + sd * dir(h));
  let fl = smell(p + sd * dir(h - sa));
  let fr = smell(p + sd * dir(h + sa));
  let coin = unit(r);
  r = pcg(r);
  // A little wobble in every turn keeps the network from locking to the grid.
  let wobble = (unit(r) - 0.5) * 0.25 * ra;
  r = pcg(r);
  if (f > fl && f > fr) {
    h += wobble * 0.3;
  } else if (f < fl && f < fr) {
    h += select(-ra, ra, coin < 0.5) + wobble;
  } else if (fl > fr) {
    h -= ra + wobble;
  } else if (fr > fl) {
    h += ra + wobble;
  } else {
    h += wobble;
  }
  p += S.steer.w * dir(h);
  // Now and then an agent starts again anywhere, as a spore: more while the mould changes its
  // habit (a preset, Random), so the old network dissolves into the new rather than lingering.
  if (unit(r) < S.seed.z) {
    r = pcg(r);
    let x = unit(r);
    r = pcg(r);
    p = vec2f(x, unit(r)) * S.grid.xy;
    r = pcg(r);
    h = unit(r) * TAU;
  }
  r = pcg(r);
  let W = S.grid.x;
  let H = S.grid.y;
  p = p - S.grid.xy * floor(p / S.grid.xy);
  p = min(p, S.grid.xy - 0.001);
  agents[i] = vec4f(p, h - TAU * floor(h / TAU), bitcast<f32>(r));
  let q = vec2u(p);
  atomicAdd(&deposit[q.y * u32(W) + q.x], u32(S.field.y * FIXED));
}

@compute @workgroup_size(16, 16)
fn diffuse(@builtin(global_invocation_id) id: vec3u) {
  let W = i32(S.grid.x);
  let H = i32(S.grid.y);
  let c = vec2i(id.xy);
  if (c.x >= W || c.y >= H) {
    return;
  }
  var sum = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = (c + vec2i(x, y) + vec2i(W, H)) % vec2i(W, H);
      sum += trailIn[q.y * W + q.x];
    }
  }
  let i = c.y * W + c.x;
  let v = mix(trailIn[i], sum / 9.0, S.field.z) * S.field.x
    + f32(atomicExchange(&deposit[i], 0u)) / FIXED;
  trailOut[i] = v;
  let s = mix(slow[i], v, S.field.w);
  slow[i] = s;
  textureStore(look, c, vec4f(v, s, 0.0, 0.0));
}

/** Every agent placed afresh, anywhere on the stage, facing anywhere. */
@compute @workgroup_size(256)
fn seed(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&agents)) {
    return;
  }
  var r = pcg(i * 9781u + u32(S.seed.w));
  let x = unit(r);
  r = pcg(r);
  let y = unit(r);
  r = pcg(r);
  let p = vec2f(x, y) * (S.grid.xy - 0.001);
  let h = unit(r) * TAU;
  r = pcg(r);
  agents[i] = vec4f(p, h, bitcast<f32>(r));
}

/** The stage resized: every agent keeps its place in it. */
@compute @workgroup_size(256)
fn remap(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&agents)) {
    return;
  }
  var a = agents[i];
  a = vec4f(clamp(a.xy * S.seed.xy, vec2f(0.5), S.grid.xy - 0.5), a.z, a.w);
  agents[i] = a;
}
