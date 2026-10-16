// The attractor hero: a few hundred thousand particles riding a strange attractor. A compute pass
// integrates each through the system's field (RK4, a whisper of noise so no setting ever settles
// on a bare loop) and eases what's drawn toward it on a critically damped spring: stiff while it
// flows, slow while the form morphs into another system. Each is then drawn as a short comet
// along its motion, its width opened by depth of field, dimmed by depth fog and coloured by its
// speed, added into a half-float target that controls-post.wgsl blooms and tone-maps.

struct U {
  model: mat4x4f,  // native → world
  remap: mat4x4f,  // the last system's native → this one's (only on the frame it changes)
  view: mat4x4f,   // world → camera (x right, y up, looking down −z)
  sys: vec4f,      // system (0 Lorenz, 1 Aizawa, 2 Thomas, 3 Halvorsen), a, b, noise
  step: vec4f,     // h (sim time a substep), substeps, real dt, sim time per real second
  disp: vec4f,     // spring ω, remap (1), seed count, frame
  life: vec4f,     // shortest life, longest life, escape radius, snap (1)
  proj: vec4f,     // principal point (device px), focal (device px), device px per CSS px
  look: vec4f,     // trail (s), energy a particle, aperture, focus distance
  fog: vec4f,      // fog density, where fog starts, median speed (world/s), widest blur (px)
  size: vec4f,     // target width, height (device px), narrowest half-width, longest trail (px)
  slow: vec4f,
  mid: vec4f,
  fast: vec4f,
}

struct Particle {
  p: vec4f, // native position, age (s)
  d: vec4f, // drawn position (world), life (s)
  v: vec4f, // drawn velocity (world/s), seed
  a: vec4f, // drawn acceleration (world/s²), 0
}

@group(0) @binding(0) var<uniform> u: U;

fn field(p: vec3f) -> vec3f {
  let a = u.sys.y;
  let b = u.sys.z;
  switch (i32(u.sys.x)) {
    case 0: {
      return vec3f(10.0 * (p.y - p.x), p.x * (a - p.z) - p.y, p.x * p.y - b * p.z);
    }
    case 1: {
      let z = p.z;
      let r2 = p.x * p.x + p.y * p.y;
      return vec3f(
        (z - 0.7) * p.x - b * p.y,
        b * p.x + (z - 0.7) * p.y,
        0.6 + a * z - z * z * z / 3.0 - r2 * (1.0 + 0.25 * z) + 0.1 * z * p.x * p.x * p.x,
      );
    }
    case 2: {
      return vec3f(
        sin(p.y) - a * p.x + b * sin(p.z),
        sin(p.z) - a * p.y + b * sin(p.x),
        sin(p.x) - a * p.z + b * sin(p.y),
      );
    }
    default: {
      return vec3f(
        -a * p.x - 4.0 * p.y - b * p.z - p.y * p.y,
        -a * p.y - 4.0 * p.z - b * p.x - p.z * p.z,
        -a * p.z - 4.0 * p.x - b * p.y - p.x * p.x,
      );
    }
  }
}

fn rk4(p: vec3f, h: f32) -> vec3f {
  let k1 = field(p);
  let k2 = field(p + 0.5 * h * k1);
  let k3 = field(p + 0.5 * h * k2);
  let k4 = field(p + h * k3);
  return p + h / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

//#compute
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(2) var<storage, read> seeds: array<vec4f>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(s: ptr<function, u32>) -> f32 {
  *s = pcg(*s);
  return (f32(*s >> 8u) + 0.5) / 16777216.0;
}
fn gauss3(s: ptr<function, u32>) -> vec3f {
  let r0 = sqrt(-2.0 * log(rnd(s)));
  let t0 = 6.2831853 * rnd(s);
  let r1 = sqrt(-2.0 * log(rnd(s)));
  let t1 = 6.2831853 * rnd(s);
  return vec3f(r0 * cos(t0), r0 * sin(t0), r1 * cos(t1));
}

fn toWorld(p: vec3f) -> vec3f {
  return (u.model * vec4f(p, 1.0)).xyz;
}
fn worldVel(p: vec3f) -> vec3f {
  return (u.model * vec4f(field(p), 0.0)).xyz * u.step.w;
}
fn finite(v: vec3f) -> bool {
  return all(abs(v) < vec3f(1e6));
}

@compute @workgroup_size(256)
fn cs_step(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&parts)) {
    return;
  }
  var q = parts[i];
  var s = pcg(i * 9781u + u32(u.disp.w) * 6271u + 17u);
  var p = q.p.xyz;
  if (u.disp.y > 0.5) {
    p = (u.remap * vec4f(p, 1.0)).xyz;
  }
  let dt = u.step.z;
  var age = q.p.w + dt;
  let h = u.step.x;
  let n = i32(u.step.y);
  let kick = u.sys.w * sqrt(abs(h));
  for (var k = 0; k < n; k++) {
    p = rk4(p, h) + kick * gauss3(&s);
  }
  var w = toWorld(p);
  if (age > q.d.w || !finite(p) || length(w) > u.life.z) {
    // Reborn somewhere on the form, unseen: it fades in from here.
    let j = u32(rnd(&s) * u.disp.z) % max(1u, u32(u.disp.z));
    p = seeds[j].xyz + 0.002 * gauss3(&s) / max(1e-4, length(u.model[0].xyz));
    age = 0.0;
    q.d.w = mix(u.life.x, u.life.y, rnd(&s));
    w = toWorld(p);
    q.d = vec4f(w, q.d.w);
    q.v = vec4f(worldVel(p), q.v.w);
    q.a = vec4f(0.0);
  } else if (u.life.w > 0.5) {
    q.d = vec4f(w, q.d.w);
    q.v = vec4f(worldVel(p), q.v.w);
    q.a = vec4f(0.0);
  } else {
    // A critically damped spring toward where the particle is, solved exactly for the step.
    let om = u.disp.x;
    let x0 = q.d.xyz - w;
    let c = q.v.xyz + om * x0;
    let e = exp(-om * dt);
    let x = (x0 + c * dt) * e;
    let v = (q.v.xyz - om * c * dt) * e;
    q.d = vec4f(w + x, q.d.w);
    q.v = vec4f(v, q.v.w);
    q.a = vec4f(-om * om * x - 2.0 * om * v, 0.0);
  }
  q.p = vec4f(p, age);
  parts[i] = q;
}

//#draw

@group(0) @binding(1) var<storage, read> drawn: array<Particle>;

const SEG = 3u;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
  // Along the comet from its head (px), and across it (−1 to 1).
  @location(1) st: vec2f,
  // Its half-width and length (px).
  @location(2) @interpolate(flat) wl: vec2f,
}

/** Device pixels (y down) and the distance in front of the camera. */
fn project(w: vec3f) -> vec3f {
  let c = (u.view * vec4f(w, 1.0)).xyz;
  let z = max(-c.z, 0.05);
  return vec3f(u.proj.xy + u.proj.z * vec2f(c.x, -c.y) / z, z);
}

fn palette(t: f32) -> vec3f {
  let a = mix(u.slow.rgb, u.mid.rgb, smoothstep(0.0, 0.55, t));
  return mix(a, u.fast.rgb, smoothstep(0.45, 1.0, t));
}

@vertex
fn vs_particle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let q = drawn[ii];
  var o: VOut;
  let k = vi >> 1u;
  let side = f32(vi & 1u) * 2.0 - 1.0;
  let head = q.d.xyz;
  let vel = q.v.xyz;
  let acc = q.a.xyz;
  let hs = project(head);
  // The trail, held to its longest on screen.
  let T0 = u.look.x;
  let reach = length(project(head - vel * T0 + 0.5 * acc * T0 * T0).xy - hs.xy);
  let T = T0 * min(1.0, u.size.w / max(reach, 1e-3));
  let ts = project(head - vel * T + 0.5 * acc * T * T);
  let len = length(ts.xy - hs.xy);
  let t = f32(k) / f32(SEG) * T;
  let pt = head - vel * t + 0.5 * acc * t * t;
  let ps = project(pt);
  let ahead = project(pt + (vel - acc * t) * 0.004);
  var dir = ps.xy - ahead.xy;
  if (dot(dir, dir) < 1e-8) {
    dir = ts.xy - hs.xy;
  }
  dir = select(vec2f(1.0, 0.0), normalize(dir), dot(dir, dir) > 1e-10);
  // Depth of field: out of focus, a comet widens and its light spreads.
  let coc = min(u.fog.w, u.look.z * u.proj.z * abs(1.0 / u.look.w - 1.0 / hs.z));
  let hw = max(u.size.z, coc);
  var xy = ps.xy + vec2f(-dir.y, dir.x) * hw * side;
  var s = len * f32(k) / f32(SEG);
  if (k == 0u) {
    xy -= dir * hw;
    s = -hw;
  } else if (k == SEG) {
    xy += dir * hw;
    s = len + hw;
  }
  // Born and dying unseen; the far side in a little fog.
  let age = q.p.w;
  let alive = smoothstep(0.0, 0.9, age) * smoothstep(q.d.w, q.d.w - 1.2, age);
  let fog = exp(-u.fog.x * max(0.0, hs.z - u.fog.y));
  let speed = length(vel) / max(1e-4, u.fog.z);
  let tone = clamp(0.5 + 0.42 * log2(max(speed, 1e-3)), 0.0, 1.0);
  let lum = u.look.y * 2.6 / (hw * 2.0 * (len + hw));
  o.col = palette(tone) * (0.75 + 0.5 * tone) * lum * alive * fog;
  o.st = vec2f(s, side);
  o.wl = vec2f(hw, len);
  o.pos = vec4f(xy.x / u.size.x * 2.0 - 1.0, 1.0 - xy.y / u.size.y * 2.0, 0.0, 1.0);
  if (alive <= 0.0) {
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  }
  return o;
}

@fragment
fn fs_particle(in: VOut) -> @location(0) vec4f {
  let hw = in.wl.x;
  let len = in.wl.y;
  let s = in.st.x;
  var a = exp(-3.0 * in.st.y * in.st.y);
  if (s < 0.0) {
    let r = s / hw;
    a *= exp(-3.0 * r * r);
  }
  let along = clamp(s / (len + hw), 0.0, 1.0);
  a *= pow(1.0 - along, 1.6);
  return vec4f(in.col * a, 0.0);
}
