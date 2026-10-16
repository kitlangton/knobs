// MAGI's swarm, a few compute passes a frame (after the common block, hero-magi-common.wgsl):
//
//   splat    each agent adds itself (1, its velocity) bilinearly into a NEAR² grid (atomics)
//   resolve  the grid, tent-filtered, into the near field (density, momentum)
//   far      the near field blurred down to FAR²: the swarm at the scale of its clusters
//   preds    the predators hunt the clusters the tracker has locked
//   advance  each agent steers by the fields: up the far field's slope (cohesion), down the
//            near field's (separation), toward the fields' mean heading (alignment); flees
//            predators, circles the lure, keeps inside the containment ring. It also adds its
//            heading, speed and fear to the frame's statistics.
//   maxima   the far field's peaks: the clusters, with their mass in agents
//   track    six tracks follow the clusters (lock-on, a serial id each), and the statistics go
//            into a history the scope plots
//
// So the swarm costs one splat and one gather an agent, whatever its size.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> aux: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> grid: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> preds: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> stats: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> cand: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> tracks: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> hist: array<vec4f>;
@group(0) @binding(9) var samp: sampler;
@group(1) @binding(0) var nearOut: texture_storage_2d<rgba16float, write>;
@group(1) @binding(1) var nearTex: texture_2d<f32>;
@group(1) @binding(2) var farOut: texture_storage_2d<rgba16float, write>;
@group(1) @binding(3) var farTex: texture_2d<f32>;

/** Fixed point for the grid and the statistics. */
const FIX = 256.0;
const STAT = 1000.0;
// stats: 0–1 summed heading, 2 speed, 3 fear, 4 candidates, 5 the next track's id, 6 frames
const S_CANDS = 4u;
const S_SERIAL = 5u;
const S_FRAME = 6u;

fn agentCount() -> u32 {
  return u32(P.sim3.x);
}

@compute @workgroup_size(64)
fn init(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&agents)) {
    return;
  }
  let a = hash11(i * 3u + 1u) * TAU;
  let r = sqrt(hash11(i * 3u + 2u)) * 0.85;
  let h = hash11(i * 3u + 3u) * TAU;
  agents[i] = vec4f(r * cos(a), r * sin(a), 0.2 * cos(h), 0.2 * sin(h));
  aux[i] = vec4f(0.0, hash11(i * 7u + 5u), 0.0, 0.0);
  if (i < PREDS * 2u) {
    preds[i] = vec4f(0.0);
  }
  if (i < TRACKS * 2u) {
    tracks[i] = vec4f(0.0);
  }
  if (i < HIST + 2u) {
    hist[i] = vec4f(0.0);
  }
}

fn splatAt(c: vec2i, w: f32, v: vec2f) {
  if (any(c < vec2i(0)) || any(c >= vec2i(i32(NEAR)))) {
    return;
  }
  let k = (u32(c.y) * NEAR + u32(c.x)) * 3u;
  atomicAdd(&grid[k], i32(round(w * FIX)));
  atomicAdd(&grid[k + 1u], i32(round(w * v.x * FIX)));
  atomicAdd(&grid[k + 2u], i32(round(w * v.y * FIX)));
}

@compute @workgroup_size(64)
fn splat(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= agentCount()) {
    return;
  }
  let a = agents[i];
  let g = fieldUv(a.xy) * f32(NEAR) - 0.5;
  let c = vec2i(floor(g));
  let f = fract(g);
  splatAt(c, (1.0 - f.x) * (1.0 - f.y), a.zw);
  splatAt(c + vec2i(1, 0), f.x * (1.0 - f.y), a.zw);
  splatAt(c + vec2i(0, 1), (1.0 - f.x) * f.y, a.zw);
  splatAt(c + vec2i(1, 1), f.x * f.y, a.zw);
}

fn cell(c: vec2i) -> vec3f {
  let q = clamp(c, vec2i(0), vec2i(i32(NEAR) - 1));
  let k = (u32(q.y) * NEAR + u32(q.x)) * 3u;
  return vec3f(f32(atomicLoad(&grid[k])), f32(atomicLoad(&grid[k + 1u])), f32(atomicLoad(&grid[k + 2u]))) / FIX;
}

@compute @workgroup_size(8, 8)
fn resolve(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= vec2u(NEAR))) {
    return;
  }
  let c = vec2i(id.xy);
  var s = cell(c) * 4.0;
  s += (cell(c + vec2i(1, 0)) + cell(c - vec2i(1, 0)) + cell(c + vec2i(0, 1)) + cell(c - vec2i(0, 1))) * 2.0;
  s += cell(c + vec2i(1, 1)) + cell(c - vec2i(1, 1)) + cell(c + vec2i(1, -1)) + cell(c + vec2i(-1, 1));
  textureStore(nearOut, c, vec4f(s / 16.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn far(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= vec2u(FAR))) {
    return;
  }
  // A 5×5 Gaussian of bilinear taps two near texels apart: about ten near texels across.
  let uv = (vec2f(id.xy) + 0.5) / f32(FAR);
  let t = 2.0 / f32(NEAR);
  var s = vec3f(0.0);
  var wsum = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let w = exp(-f32(x * x + y * y) / 4.0);
      s += w * textureSampleLevel(nearTex, samp, uv + vec2f(f32(x), f32(y)) * t, 0.0).xyz;
      wsum += w;
    }
  }
  textureStore(farOut, vec2i(id.xy), vec4f(s / wsum, 0.0));
}

fn farAt(p: vec2f) -> vec3f {
  return textureSampleLevel(farTex, samp, fieldUv(p), 0.0).xyz;
}
fn nearAt(p: vec2f) -> vec3f {
  return textureSampleLevel(nearTex, samp, fieldUv(p), 0.0).xyz;
}
/** The far field's slope at p (density per world unit, in mean densities). */
fn farSlope(p: vec2f) -> vec2f {
  let e = 2.0 * SPAN / f32(FAR);
  let dx = farAt(p + vec2f(e, 0.0)).x - farAt(p - vec2f(e, 0.0)).x;
  let dy = farAt(p + vec2f(0.0, e)).x - farAt(p - vec2f(0.0, e)).x;
  return vec2f(dx, dy) / (2.0 * e * max(P.sim3.w, 1e-3));
}
/** A wall at the containment ring: how hard it pushes in at p. */
fn wall(p: vec2f, k: f32) -> vec2f {
  let r = length(p);
  let rc = P.sim1.y;
  let edge = rc - 0.07;
  if (r < edge || r < 1e-4) {
    return vec2f(0.0);
  }
  return -p / r * ((r - edge) / 0.07) * k;
}

@compute @workgroup_size(8)
fn hunt(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= PREDS) {
    return;
  }
  let dt = P.sim1.z;
  var a = preds[2u * i];
  var b = preds[2u * i + 1u];
  let on = f32(i) < P.sim1.x;
  b.x = clamp(b.x + select(-dt * 2.0, dt * 1.5, on), 0.0, 1.0);
  if (!on && b.x <= 0.0) {
    // Parked off the ring's edge, ready to come in.
    let ang = f32(i) * 2.39996 + 0.6;
    preds[2u * i] = vec4f(cos(ang), sin(ang), -cos(ang), -sin(ang)) * vec4f(vec2f(P.sim1.y * 0.92), vec2f(0.1));
    preds[2u * i + 1u] = b;
    return;
  }
  // Each hunts a locked cluster (the predators share them out), else climbs the density.
  var alive = 0u;
  for (var t = 0u; t < TRACKS; t++) {
    if (tracks[2u * t + 1u].x > 0.5) {
      alive++;
    }
  }
  var goal = farSlope(a.xy);
  if (alive > 0u) {
    var n = i % alive;
    for (var t = 0u; t < TRACKS; t++) {
      if (tracks[2u * t + 1u].x > 0.5) {
        if (n == 0u) {
          goal = tracks[2u * t].xy - a.xy;
          break;
        }
        n--;
      }
    }
  }
  let sp = cruise(P) * 1.2 + 0.06;
  var acc = goal / (length(goal) + 0.05) * sp * 3.0;
  for (var j = 0u; j < PREDS; j++) {
    let o = preds[2u * j];
    let d = a.xy - o.xy;
    let l = length(d);
    if (j != i && f32(j) < P.sim1.x && l < 0.3 && l > 1e-4) {
      acc += d / l * (1.0 - l / 0.3) * sp * 4.0;
    }
  }
  acc += wall(a.xy, sp * 12.0);
  var v = a.zw + acc * dt;
  let s = length(v);
  if (s > sp) {
    v *= sp / s;
  }
  var p = a.xy + v * dt;
  let r = length(p);
  if (r > P.sim1.y) {
    p *= P.sim1.y / r;
  }
  preds[2u * i] = vec4f(p, v);
  preds[2u * i + 1u] = b;
}

var<workgroup> red: array<vec4f, 64>;

@compute @workgroup_size(64)
fn advance(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  let i = id.x;
  var out = vec4f(0.0);
  if (i < agentCount()) {
    let dt = P.sim1.z;
    var a = agents[i];
    var x = aux[i];
    let p = a.xy;
    var v = a.zw;
    let sp = cruise(P);
    let k = sp * 2.6;
    let speed = max(length(v), 1e-5);
    let dir = v / speed;
    // The fields here.
    let n0 = nearAt(p);
    let f0 = farAt(p);
    let e = 2.0 * SPAN / f32(NEAR);
    let gn = vec2f(nearAt(p + vec2f(e, 0.0)).x - nearAt(p - vec2f(e, 0.0)).x,
      nearAt(p + vec2f(0.0, e)).x - nearAt(p - vec2f(0.0, e)).x) / max(P.sim3.z, 1e-3);
    let gf = farSlope(p);
    var acc = vec2f(0.0);
    // Cohesion: up the slope of the swarm at its own scale.
    acc += gf / (length(gf) + 2.0) * P.sim0.x * k * 2.2;
    // Separation: down the slope of the crowd right round it.
    acc -= gn / (length(gn) + 1.5) * P.sim0.z * k * 3.2;
    // Alignment: toward the heading round it.
    let m = n0.yz + f0.yz * 3.0;
    let ml = length(m);
    if (ml > 1e-4) {
      acc += (m / ml * speed - v) * P.sim0.y * 3.5;
    }
    // A little wander, less the more they align.
    let wob = hash11(i * 977u + u32(P.sim3.y) * 13u) - 0.5;
    acc += vec2f(-dir.y, dir.x) * wob * k * (1.6 - P.sim0.y) * 2.5;
    // The cruise.
    acc += dir * (sp - speed) * 2.0;
    // Predators: flee, hardest close.
    var fear = 0.0;
    for (var j = 0u; j < PREDS; j++) {
      let o = preds[2u * j];
      let on = preds[2u * j + 1u].x;
      let d = p - o.xy;
      let l = length(d);
      if (on > 0.05 && l < 0.32 && l > 1e-4) {
        let f = (1.0 - l / 0.32) * on;
        acc += d / l * f * f * k * 9.0;
        fear = max(fear, f);
      }
    }
    // The lure: a pull and a swirl round it, strongest while it's held.
    let ld = P.sim2.xy - p;
    let lr = length(ld);
    if (lr > 1e-4) {
      let pull = P.sim2.z * (1.0 + 2.5 * P.sim2.w);
      let f = exp(-lr * lr / 0.09) * pull;
      acc += (ld / lr * 1.4 + vec2f(-ld.y, ld.x) / lr * 1.1) * f * k;
    }
    acc += wall(p, k * 10.0);
    v += acc * dt;
    let s = length(v);
    let top = sp * (2.2 + 1.5 * fear);
    if (s > top) {
      v *= top / s;
    }
    if (s < 0.01) {
      v = dir * 0.01;
    }
    var q = p + v * dt;
    let r = length(q);
    if (r > P.sim1.y) {
      let nrm = q / r;
      q = nrm * P.sim1.y;
      v -= nrm * max(dot(v, nrm), 0.0) * 1.6;
    }
    x.x = max(fear, x.x - dt * 1.2);
    agents[i] = vec4f(q, v);
    aux[i] = x;
    let h = v / max(length(v), 1e-5);
    out = vec4f(h, length(v) / (cruise(P) * 2.2), x.x);
  }
  // The frame's statistics, summed in the group, then added once.
  red[li] = out;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s >>= 1u) {
    if (li < s) {
      red[li] += red[li + s];
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let t = red[0];
    atomicAdd(&stats[0], i32(round(t.x * STAT)));
    atomicAdd(&stats[1], i32(round(t.y * STAT)));
    atomicAdd(&stats[2], i32(round(t.z * STAT)));
    atomicAdd(&stats[3], i32(round(t.w * STAT)));
  }
}

@compute @workgroup_size(8, 8)
fn maxima(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= vec2u(FAR))) {
    return;
  }
  let c = vec2i(id.xy);
  let hi = vec2i(i32(FAR) - 1);
  let v = textureLoad(farTex, c, 0).x;
  let mean = max(P.sim3.w, 1e-3);
  if (v < mean * 2.4) {
    return;
  }
  var mass = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2i(x, y);
      let w = textureLoad(farTex, clamp(c + o, vec2i(0), hi), 0).x;
      // A peak: above every neighbour (ties go to the later one).
      let later = y > 0 || (y == 0 && x > 0);
      if ((x != 0 || y != 0) && (w > v || (w == v && later))) {
        return;
      }
      mass += w;
    }
  }
  let k = u32(atomicAdd(&stats[S_CANDS], 1));
  if (k < CANDS) {
    let world = (vec2f(c) + 0.5) / f32(FAR) * 2.0 * SPAN - SPAN;
    // Each far texel is (NEAR / FAR)² near cells' worth of agents.
    let cells = f32(NEAR / FAR) * f32(NEAR / FAR);
    cand[k] = vec4f(world, mass * cells, 0.0);
  }
}

@compute @workgroup_size(1)
fn track() {
  let dt = P.sim1.z;
  let n = min(u32(atomicLoad(&stats[S_CANDS])), CANDS);
  var taken: array<bool, 32>;
  for (var c = 0u; c < CANDS; c++) {
    taken[c] = false;
  }
  // Held tracks follow their nearest peak; lost ones fade.
  var live = 0.0;
  for (var t = 0u; t < TRACKS; t++) {
    var tp = tracks[2u * t];
    var ta = tracks[2u * t + 1u];
    if (ta.x <= 0.0) {
      continue;
    }
    var best = -1;
    var bd = 0.2;
    for (var c = 0u; c < n; c++) {
      let d = length(cand[c].xy - tp.xy);
      if (!taken[c] && d < bd) {
        bd = d;
        best = i32(c);
      }
    }
    if (best >= 0) {
      let c = cand[u32(best)];
      taken[u32(best)] = true;
      tp = vec4f(mix(tp.xy, c.xy, 1.0 - exp(-dt * 7.0)), mix(tp.z, c.z, 1.0 - exp(-dt * 4.0)), min(tp.w + dt * 1.4, 1.0));
      ta = vec4f(min(ta.x + dt * 5.0, 1.0), ta.y, 0.0, 0.0);
    } else {
      ta.z += dt;
      if (ta.z > 0.4) {
        ta.x = max(ta.x - dt * 3.0, 0.0);
      }
    }
    if (ta.x > 0.5) {
      live += 1.0;
    }
    tracks[2u * t] = tp;
    tracks[2u * t + 1u] = ta;
  }
  // Free tracks take the heaviest peaks no one holds.
  for (var t = 0u; t < TRACKS; t++) {
    if (tracks[2u * t + 1u].x > 0.0) {
      continue;
    }
    var best = -1;
    var bm = P.sim3.x * 0.012 + 20.0;
    for (var c = 0u; c < n; c++) {
      if (!taken[c] && cand[c].z > bm && length(cand[c].xy) < P.sim1.y) {
        bm = cand[c].z;
        best = i32(c);
      }
    }
    if (best < 0) {
      break;
    }
    let c = cand[u32(best)];
    taken[u32(best)] = true;
    let serial = f32(atomicAdd(&stats[S_SERIAL], 1) % 99 + 1);
    tracks[2u * t] = vec4f(c.xy, c.z, 0.0);
    tracks[2u * t + 1u] = vec4f(0.001, serial, 0.0, 0.0);
  }
  // The statistics: now, and into the history every other frame.
  let count = max(P.sim3.x, 1.0);
  let order = length(vec2f(f32(atomicLoad(&stats[0])), f32(atomicLoad(&stats[1])))) / STAT / count;
  let speed = f32(atomicLoad(&stats[2])) / STAT / count;
  let fear = f32(atomicLoad(&stats[3])) / STAT / count;
  let clusters = live / f32(TRACKS);
  let frame = u32(atomicAdd(&stats[S_FRAME], 1));
  var head = u32(hist[HIST].x);
  if (frame % 2u == 0u) {
    head = (head + 1u) % HIST;
    hist[head] = vec4f(order, speed, clusters, fear);
  }
  hist[HIST] = vec4f(f32(head), order, speed, fear);
  hist[HIST + 1u] = vec4f(live, f32(n), 0.0, 0.0);
  for (var s = 0u; s <= S_CANDS; s++) {
    atomicStore(&stats[s], 0);
  }
}
