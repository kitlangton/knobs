// MAGI on screen (after hero-magi-common.wgsl). Three passes into half-float targets:
//
//   trail    the last frame's agents fade (a blend by constant), and this frame's are added:
//            each a short streak along its velocity, emerald cruising, the signal's colour
//            when fast, red when afraid. A phosphor that remembers where the swarm went.
//   hud      the tactical display, reading the simulation: the containment ring, a gauge of
//            the swarm's order round it, three MAGI votes on its statistics, the hex wing,
//            brackets locked on the tracked clusters, the predators, the lure, a scope of the
//            history, a radar of the density, and a trace from each row of the panel into the
//            machine with packets running at its value. Then the trail over it.
//
// Then the catalog's bloom and tone (controls-post.wgsl).

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read> aux: array<vec4f>;
@group(0) @binding(3) var<storage, read> preds: array<vec4f>;
@group(0) @binding(4) var<storage, read> tracks: array<vec4f>;
@group(0) @binding(5) var<storage, read> hist: array<vec4f>;
@group(0) @binding(6) var farTex: texture_2d<f32>;
@group(0) @binding(7) var samp: sampler;
@group(1) @binding(0) var trail: texture_2d<f32>;

struct FullOut {
  @builtin(position) pos: vec4f,
}
@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FullOut {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return FullOut(vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0));
}

/** The trail fades: drawn with a blend that keeps the constant's share of what's there. */
@fragment
fn fs_fade() -> @location(0) vec4f {
  return vec4f(0.0);
}

// ── Agents ──

struct AgentOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) half: f32,
  @location(2) col: vec3f,
}

fn toClip(px: vec2f) -> vec4f {
  let d = px * P.scr0.z / P.scr0.xy;
  return vec4f(d.x * 2.0 - 1.0, 1.0 - d.y * 2.0, 0.0, 1.0);
}

@vertex
fn vs_agent(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AgentOut {
  var o: AgentOut;
  let a = agents[ii];
  let R = P.scr1.z;
  let s = P.scr1.xy + a.xy * R;
  let vel = a.zw * R;
  let sp = length(vel);
  let dir = select(vec2f(1.0, 0.0), vel / sp, sp > 1e-4);
  // A streak as long as the agent travels in a 50th of a second.
  let half = clamp(sp * 0.02, 0.6, 7.0);
  let corner = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[vi];
  let local = corner * vec2f(half + 1.5, 2.0);
  o.pos = toClip(s + dir * local.x + vec2f(-dir.y, dir.x) * local.y);
  o.local = local;
  o.half = half;
  let fast = smoothstep(0.55, 1.15, length(a.zw) / (cruise(P) * 2.2));
  var c = mix(P.pal1.rgb, P.pal0.rgb, fast);
  c = mix(c, P.pal2.rgb * 1.3, sat(aux[ii].x * 1.4));
  // A long streak spreads the same light thinner; each frame adds what the trail lets fade, so
  // an agent holds its brightness and a moving one leaves a tail.
  o.col = c * 0.62 * P.scr1.w * (1.0 - P.scr0.w) * 7.0 / (1.0 + half * 0.18);
  return o;
}

@fragment
fn fs_agent(in: AgentOut) -> @location(0) vec4f {
  let d = length(vec2f(max(abs(in.local.x) - in.half, 0.0), in.local.y));
  let cov = sat((0.75 - d) * P.scr0.z + 0.5);
  return vec4f(in.col * cov, 0.0);
}

// ── The display ──

var<private> aa: f32;

/** A rule `w` px wide along a distance (px). */
fn line(d: f32, w: f32) -> f32 {
  let ww = max(w, aa);
  return sat((ww * 0.5 - abs(d)) / aa + 0.5) * min(w / aa, 1.0);
}
fn fill(d: f32) -> f32 {
  return sat(0.5 - d / aa);
}
fn seg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * sat(dot(pa, ba) / dot(ba, ba)));
}
fn hexCell(p: vec2f, s: f32) -> vec4f {
  let r = vec2f(1.0, 1.7320508);
  let h = r * 0.5;
  let a = (p / s) - r * floor((p / s) / r) - h;
  let b = (p / s) - h - r * floor(((p / s) - h) / r) - h;
  var g = b;
  if (dot(a, a) < dot(b, b)) {
    g = a;
  }
  return vec4f(g * s, (p / s) - g);
}
fn hexagon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var q = abs(p.yx);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2f(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/** A seven-segment digit, 4 × 7 px from its top left. */
fn digit(p: vec2f, n: u32) -> f32 {
  let bits = array(0x3Fu, 0x06u, 0x5Bu, 0x4Fu, 0x66u, 0x6Du, 0x7Du, 0x07u, 0x7Fu, 0x6Fu)[n % 10u];
  if (p.x < -1.0 || p.y < -1.0 || p.x > 5.0 || p.y > 8.0) {
    return 0.0;
  }
  let a = array(vec2f(0.6, 0.0), vec2f(4.0, 0.6), vec2f(4.0, 4.1), vec2f(0.6, 7.0), vec2f(0.0, 4.1), vec2f(0.0, 0.6), vec2f(0.6, 3.5));
  let b = array(vec2f(3.4, 0.0), vec2f(4.0, 2.9), vec2f(4.0, 6.4), vec2f(3.4, 7.0), vec2f(0.0, 6.4), vec2f(0.0, 2.9), vec2f(3.4, 3.5));
  var c = 0.0;
  for (var i = 0u; i < 7u; i++) {
    if ((bits & (1u << i)) != 0u) {
      c = max(c, line(seg(p, a[i], b[i]), 1.0));
    }
  }
  return c;
}
/** The registration mark: a cross in a ring. */
fn mark(q: vec2f) -> f32 {
  if (max(abs(q.x), abs(q.y)) > 9.0) {
    return 0.0;
  }
  let cross = max(line(q.x, 1.0) * step(abs(q.y), 7.0), line(q.y, 1.0) * step(abs(q.x), 7.0));
  return max(cross, line(length(q) - 3.2, 1.0));
}
fn histAt(i: f32) -> vec4f {
  let head = u32(hist[HIST].x);
  let i0 = u32(clamp(floor(i), 0.0, f32(HIST - 2u)));
  let f = clamp(i - f32(i0), 0.0, 1.0);
  return mix(hist[(head + 1u + i0) % HIST], hist[(head + 2u + i0) % HIST], f);
}
fn scopeTrace(p: vec2f, x0: f32, y0: f32, w: f32, h: f32, ch: u32) -> f32 {
  let u = sat((p.x - x0) / w);
  let fi = u * f32(HIST - 2u);
  let px = 1.0 / w * f32(HIST - 2u);
  let a = histAt(fi)[ch];
  let b = histAt(fi + px * 2.0)[ch];
  let ya = y0 + h * (0.9 - 0.8 * sat(a));
  let yb = y0 + h * (0.9 - 0.8 * sat(b));
  let slope = (yb - ya) / 2.0;
  return line((p.y - ya) / sqrt(1.0 + slope * slope), 1.3);
}

fn hud(p: vec2f) -> vec3f {
  let c = P.scr1.xy;
  let R = P.scr1.z;
  let t = P.sim1.w;
  let prim = P.pal0.rgb * P.pal0.w;
  let sec = P.pal1.rgb;
  let alert = P.pal2.rgb;
  let bone = vec3f(0.78, 0.8, 0.86);
  let now = hist[HIST];
  let order = now.y;
  let speed = now.z;
  let fear = now.w;
  let live = hist[HIST + 1u].x;
  let q = p - c;
  let r = length(q);
  let rn = r / R;
  let ang = atan2(q.y, q.x);
  var col = vec3f(0.0);
  let rc = P.sim1.y;

  // ── The ring: containment, its exclusion zone, the order gauge, the votes ──
  if (rn < 1.2) {
    // A faint floor inside the containment, so the arena reads.
    col += sec * 0.012 * smoothstep(rc, rc - 0.25, rn);
    col += prim * 1.1 * line(r - rc * R, 1.6);
    let tk = fract((ang + PI) / TAU * 120.0);
    col += sec * 0.45 * line((tk - 0.5) * r * TAU / 120.0, 1.0) * step(rc * R - 7.0, r) * step(r, rc * R - 2.5);
    // Past the ring, hatched off.
    if (rn > rc && rn < 1.0) {
      let h = fract((q.x + q.y) / 7.0);
      col += alert * 0.13 * line((h - 0.5) * 7.0, 1.0);
    }
    col += bone * 0.22 * line(r - R, 1.0);
    // The gauge of order: lit round from twelve as the swarm lines up.
    if (rn > 1.03 && rn < 1.08) {
      let f = fract((ang + PI * 0.5) / TAU);
      let k = fract(f * 96.0);
      let tick = line((k - 0.5) * r * TAU / 96.0, 1.4) * step(1.035, rn) * step(rn, 1.07);
      let lit = step(f, order);
      col += mix(sec * 0.14, sec * 1.5, lit) * tick;
    }
    // MAGI: three votes on what the swarm is doing. Melchior (top) on its order, Balthasar
    // (left) on its pace, Casper (bottom) on its calm. Green is yes, red no.
    if (rn > 1.09 && rn < 1.16) {
      let centres = array(-PI * 0.5, PI, PI * 0.5);
      let calm = 1.0 - sat(fear * 3.0);
      let values = array(order, sat(speed), calm);
      for (var i = 0u; i < 3u; i++) {
        var da = ang - centres[i];
        da = da - TAU * round(da / TAU);
        if (abs(da) < 0.44) {
          let band = line(r - R * 1.095, 1.2) + line(r - R * 1.155, 1.2);
          col += alert * 0.8 * band;
          let u = (da + 0.44) / 0.88;
          let cells = fract(u * 12.0);
          let inCell = step(0.12, cells) * step(cells, 0.88) * step(1.105, rn) * step(rn, 1.145);
          let filled = step(u, values[i]);
          let yes = mix(alert * 1.3, sec * 1.4, smoothstep(0.42, 0.58, values[i]));
          col += mix(yes * 0.1, yes, filled) * inCell;
        }
      }
    }
  }

  // ── The hex wing, left of the ring: the more the swarm agrees, the more cells answer ──
  if (rn > 1.22 && rn < 1.8 && cos(ang) < -0.5 && p.x > P.scr2.x + P.scr2.z + 14.0) {
    let hc = hexCell(p, 12.0);
    let h = hash21(hc.zw);
    let wing = smoothstep(-0.5, -0.62, cos(ang)) * smoothstep(1.22, 1.3, rn) * smoothstep(1.8, 1.68, rn);
    let pulse = 0.5 + 0.5 * sin(t * 2.0 + h * 9.0 - length(hc.zw) * 0.3);
    var cc = mix(sec, prim, step(0.55, h)) * 0.3;
    if (h < order * 0.6 + 0.05) {
      cc = mix(sec, prim, step(0.5, h)) * (0.6 + 0.8 * pulse);
    }
    if (h > 1.0 - fear * 0.6) {
      cc = alert * (0.6 + 0.8 * pulse);
    }
    col += cc * wing * line(hexagon(hc.xy, 4.8), 1.0);
    if (h < 0.07) {
      col += prim * wing * fill(abs(hc.x) + abs(hc.y) - 1.6);
    }
  }

  // ── Clusters: brackets close in on each as it's locked, with its id ──
  for (var i = 0u; i < TRACKS; i++) {
    let tp = tracks[2u * i];
    let ta = tracks[2u * i + 1u];
    if (ta.x <= 0.01) {
      continue;
    }
    let s = c + tp.xy * R;
    let lock = tp.w * tp.w * (3.0 - 2.0 * tp.w);
    let size = mix(54.0, 9.0 + sqrt(tp.z) * 1.15, lock);
    let lq = abs(p - s);
    if (max(lq.x, lq.y) > size + 30.0) {
      continue;
    }
    let edge = max(lq.x, lq.y) - size;
    let arm = min(size * 0.45, 9.0);
    let corner = step(size - arm, lq.x) * step(size - arm, lq.y);
    let hue = mix(prim * 1.6, sec * 1.3, lock);
    col += hue * ta.x * line(edge, 1.5) * corner;
    // Acquiring: a diamond turning in.
    let dq = p - s;
    let rot = vec2f(dq.x + dq.y, dq.x - dq.y) * 0.7071;
    col += prim * ta.x * (1.0 - lock) * line(max(abs(rot.x), abs(rot.y)) - size * 0.75, 1.0);
    // Locked: a pip at the centre, the id at the corner.
    col += sec * ta.x * lock * fill(length(dq) - 1.4);
    let id = u32(ta.y);
    let at = p - (s + vec2f(size + 4.0, -size - 1.0));
    let num = max(digit(at, id / 10u), digit(at - vec2f(6.0, 0.0), id));
    col += hue * ta.x * 1.2 * num;
  }

  // ── Predators: red chevrons, each in its ring of fear ──
  for (var i = 0u; i < PREDS; i++) {
    let on = preds[2u * i + 1u].x;
    if (on <= 0.01) {
      continue;
    }
    let a = preds[2u * i];
    let s = c + a.xy * R;
    let dq = p - s;
    let dl = length(dq);
    if (dl > 0.34 * R) {
      continue;
    }
    let v = a.zw;
    let dir = select(vec2f(1.0, 0.0), normalize(v), length(v) > 1e-5);
    let lq = vec2f(dot(dq, dir), dot(dq, vec2f(-dir.y, dir.x)));
    let chev = max(abs(lq.y) * 0.9 + lq.x * 0.75 - 4.2, -lq.x - 3.6 + abs(lq.y) * 0.4);
    col += alert * 2.2 * on * fill(chev);
    let fa = atan2(dq.y, dq.x);
    let dash = step(0.5, fract(fa / TAU * 36.0 + t * 0.4));
    col += alert * 0.28 * on * line(dl - 0.32 * R, 1.0) * dash;
  }

  // ── The lure: a reticle, brighter while it's held ──
  {
    let s = c + P.sim2.xy * R;
    let dq = p - s;
    let dl = length(dq);
    if (dl < 26.0) {
      let held = P.sim2.w;
      let k = prim * (0.9 + 1.4 * held);
      col += k * line(dl - 6.0, 1.3);
      let fa = atan2(dq.y, dq.x) - t * 0.8;
      let gap = step(0.18, abs(fract(fa / TAU * 4.0) - 0.5) * 2.0);
      col += k * 0.6 * line(dl - 14.0 - 2.0 * held, 1.0) * gap;
      let tick = max(line(dq.x, 1.0) * step(abs(abs(dq.y) - 20.0), 3.0), line(dq.y, 1.0) * step(abs(abs(dq.x) - 20.0), 3.0));
      col += k * tick;
    }
  }

  // ── The panel's rows, each a trace into the machine, packets at its value ──
  let rows = u32(P.scr3.y);
  let panelX = P.scr3.x;
  if (rows > 0u && p.x > c.x + R * 1.12 && p.x < panelX + 1.0) {
    for (var i = 0u; i < rows; i++) {
      let row = P.rows[i];
      let a = mix(-0.5, 0.5, (f32(i) + 0.5) / f32(rows));
      let dirA = vec2f(cos(a), sin(a));
      let port = c + dirA * R * 1.2;
      let bend = c + dirA * R * 1.3;
      let end = vec2f(panelX, row.x);
      let d1 = seg(p, port, bend);
      let d2 = seg(p, bend, end);
      let glow = row.z;
      let k = prim * (0.22 + 0.9 * glow);
      col += k * line(min(d1, d2), 1.0 + glow * 0.4);
      col += prim * (0.8 + glow) * fill(max(abs(p.x - port.x), abs(p.y - port.y)) - 2.2);
      // Packets, from the panel in, quicker the higher the row's value.
      let along = length(p - end);
      let bead = fract(along / 34.0 + t * (0.25 + 1.4 * row.y));
      col += prim * 1.6 * smoothstep(0.86, 1.0, bead) * line(d2, 2.6);
    }
  }

  // ── The instrument column: the scope over the radar ──
  let cl = P.scr2;
  if (cl.z > 0.0 && p.x > cl.x - 12.0 && p.x < cl.x + cl.z + 12.0 && p.y > cl.y - 12.0 && p.y < cl.y + cl.w + 12.0) {
    // The scope: order (signal), pace (emerald), fear (red), clusters (bone, stepped).
    let sh = cl.w * 0.4;
    let sq = p - vec2f(cl.x, cl.y);
    if (sq.y > -6.0 && sq.y < sh + 6.0) {
      let b = max(abs(sq.x - cl.z * 0.5) - cl.z * 0.5, abs(sq.y - sh * 0.5) - sh * 0.5);
      let corner = step(cl.z * 0.5 - 10.0, abs(sq.x - cl.z * 0.5)) * step(sh * 0.5 - 10.0, abs(sq.y - sh * 0.5));
      col += prim * 0.9 * line(b, 1.2) * corner;
      col += bone * 0.14 * line(b, 1.0);
      if (b < 0.0) {
        let g = abs(fract(vec2f(sq.x / (cl.z / 8.0), sq.y / (sh / 4.0)) + 0.5) - 0.5) * vec2f(cl.z / 8.0, sh / 4.0);
        col += bone * 0.05 * (line(g.x, 1.0) + line(g.y, 1.0));
        col += prim * 1.5 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 0u);
        col += sec * 1.1 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 1u);
        col += alert * 1.2 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 3u);
        col += bone * 0.35 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 2u);
        // The write head, at the right.
        col += prim * 0.5 * line(sq.x - cl.z + 1.5, 1.0);
      }
    }
    // The radar: the swarm's density as a matrix of dots, swept.
    let rr = min(cl.z * 0.5 - 4.0, cl.w * 0.3);
    let rcen = vec2f(cl.x + cl.z * 0.5, cl.y + cl.w - rr - 2.0);
    let lp = (p - rcen) / rr;
    let lr = length(lp);
    if (lr < 1.08) {
      col += prim * 0.8 * line((lr - 1.0) * rr, 1.2);
      col += bone * 0.12 * (line((lr - 0.66) * rr, 1.0) + line((lr - 0.33) * rr, 1.0));
      col += bone * 0.1 * (line(p.x - rcen.x, 1.0) + line(p.y - rcen.y, 1.0)) * step(lr, 1.0);
      let sa = t * 1.3;
      let behind = fract((sa - atan2(lp.y, lp.x)) / TAU);
      let sweep = exp(-behind * 4.5);
      if (lr < 1.0) {
        col += sec * 0.08 * sweep;
        col += sec * 0.9 * line((behind - 0.0) * lr * rr * TAU, 1.0) * step(behind, 0.5);
        let pitch = 4.0;
        let cc = (floor((p - rcen) / pitch) + 0.5) * pitch;
        let world = cc / rr;
        let dens = textureSampleLevel(farTex, samp, fieldUv(world), 0.0).x / max(P.sim3.w, 1e-3);
        let dotR = clamp(dens * 0.45, 0.0, 1.7);
        let dcol = mix(sec, prim, smoothstep(1.5, 4.0, dens));
        col += dcol * (0.25 + 0.95 * sweep) * fill(length(p - rcen - cc) - dotR) * step(0.3, dens);
        for (var i = 0u; i < TRACKS; i++) {
          let ta = tracks[2u * i + 1u];
          if (ta.x > 0.5) {
            let bq = abs(p - (rcen + tracks[2u * i].xy * rr));
            col += prim * ta.x * line(max(bq.x, bq.y) - 3.5, 1.0);
          }
        }
        for (var i = 0u; i < PREDS; i++) {
          let on = preds[2u * i + 1u].x;
          if (on > 0.01) {
            col += alert * 1.8 * on * fill(length(p - (rcen + preds[2u * i].xy * rr)) - 1.6);
          }
        }
      }
    }
  }

  // ── The frame: corner brackets, registration marks, a ruler along the top ──
  let left = select(c.x - R * 1.5, cl.x - 22.0, cl.z > 0.0);
  let right = c.x + R * 1.36;
  let top = c.y - R * 1.3;
  let bottom = c.y + R * 1.3;
  let fc = vec2f(left + right, top + bottom) * 0.5;
  let fh = vec2f(right - left, bottom - top) * 0.5;
  let fq = abs(p - fc) - fh;
  let fb = max(fq.x, fq.y);
  col += prim * 0.7 * line(fb, 1.2) * step(-16.0, fq.x) * step(-16.0, fq.y);
  col += bone * 0.4 * mark(abs(p - fc) - fh - vec2f(12.0));
  if (abs(p.y - top) < 6.0 && p.x > left + 40.0 && p.x < right - 40.0) {
    let i = round(p.x / 10.0);
    let major = abs(i - 5.0 * round(i / 5.0)) < 0.5;
    col += bone * 0.16 * line(p.x - i * 10.0, 1.0) * step(p.y - top, select(2.5, 5.0, major)) * step(0.0, p.y - top);
  }
  return col;
}

@fragment
fn fs_hud(in: FullOut) -> @location(0) vec4f {
  let dpr = P.scr0.z;
  aa = 1.0 / dpr;
  let p = in.pos.xy / dpr;
  let page = P.page.rgb;
  // Drawn on from the ring out as it arrives.
  let arrive = P.scr1.w;
  let reach = arrive * P.scr1.z * 3.2;
  let shown = smoothstep(reach, reach - 60.0, length(p - P.scr1.xy));
  var col = hud(p) * shown;
  col += textureLoad(trail, vec2i(in.pos.xy), 0).rgb;
  // Every edge of the frame is the page.
  let size = P.scr0.xy / dpr;
  let edge = smoothstep(0.0, 40.0, p.x) * smoothstep(0.0, 40.0, size.x - p.x) *
    smoothstep(0.0, 30.0, p.y) * smoothstep(0.0, 30.0, size.y - p.y);
  return vec4f(page + col * edge, 1.0);
}
