// The swarm on screen (after hero-swarm-common.wgsl). Into half-float targets:
//
//   trail    the last frame's agents fade (a blend by constant), and this frame's are added:
//            each a short streak along its velocity, bone cruising, the signal's colour when
//            fast, the counter-accent when afraid. A phosphor that remembers where they went.
//   hud      the tactical display, reading the simulation: the containment ring in its bezel,
//            two arcs (the swarm's order above, its pace below), the hex wing, brackets locked
//            on the tracked clusters, the predators, the lure, a scope of the history and a
//            radar of the density. Then the trail over it.
//   wires    from each row of the panel, a curve of light that lands on what the row drives,
//            with packets running along it at the row's value, and a dot at each end.
//
// Then the catalog's bloom and tone (controls-post.wgsl). Every region fades into the night:
// nothing ends on a hard edge.

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

fn toClip(px: vec2f) -> vec4f {
  let d = px * P.scr0.z / P.scr0.xy;
  return vec4f(d.x * 2.0 - 1.0, 1.0 - d.y * 2.0, 0.0, 1.0);
}
fn dir(a: f32) -> vec2f {
  return vec2f(cos(a), sin(a));
}

// ── Agents ──

struct AgentOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) half: f32,
  @location(2) col: vec3f,
}

@vertex
fn vs_agent(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AgentOut {
  var o: AgentOut;
  let a = agents[ii];
  let R = P.scr1.z;
  let s = P.scr1.xy + a.xy * R;
  let vel = a.zw * R;
  let sp = length(vel);
  let fwd = select(vec2f(1.0, 0.0), vel / sp, sp > 1e-4);
  // A streak as long as the agent travels in a sixtieth of a second.
  let half = clamp(sp * 0.016, 0.5, 4.5);
  let corner = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[vi];
  let local = corner * vec2f(half + 1.5, 2.0);
  o.pos = toClip(s + fwd * local.x + vec2f(-fwd.y, fwd.x) * local.y);
  o.local = local;
  o.half = half;
  let fast = smoothstep(0.55, 1.15, length(a.zw) / (cruise(P) * 2.2));
  var c = mix(P.pal1.rgb, P.pal0.rgb, fast);
  c = mix(c, P.pal2.rgb, sat(aux[ii].x * 1.4));
  // A long streak spreads the same light thinner; each frame adds what the trail lets fade, so
  // an agent holds its brightness and a moving one leaves a tail.
  o.col = c * 0.2 * P.scr1.w * (1.0 - P.scr0.w) * 7.0 / (1.0 + half * 0.18);
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
/** The hexagon round p (cells `s` px apart): xy from its centre, zw its centre (in cells). */
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
/** A seven-segment digit, 4 × 7 units from its top left. */
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
      c = max(c, line(seg(p, a[i], b[i]), 0.85));
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
/** A box's outline, drawn only near its corners and fading out along each side. */
fn corners(q: vec2f, half: vec2f, arm: f32) -> f32 {
  let b = abs(q) - half;
  return line(max(b.x, b.y), 1.2) * sat(1.0 + min(b.x, b.y) / arm);
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
  // The oldest of it fades out at the left.
  return line((p.y - ya) / sqrt(1.0 + slope * slope), 1.3) * smoothstep(0.0, 0.3, u);
}

fn hud(p: vec2f) -> vec3f {
  let c = P.scr1.xy;
  let R = P.scr1.z;
  let t = P.sim1.w;
  let prim = P.pal0.rgb * P.pal0.w;
  let sec = P.pal1.rgb;
  let alert = P.pal2.rgb;
  let bone = vec3f(0.86, 0.83, 0.77);
  let now = hist[HIST];
  let eased = hist[HIST + 1u];
  let order = eased.z;
  let fear = now.w;
  let q = p - c;
  let r = length(q);
  let rn = r / R;
  let ang = atan2(q.y, q.x);
  var col = vec3f(0.0);
  let rc = P.sim1.y;

  // ── The ring: the containment, the zone it gives up, the bezel, the arcs ──
  if (rn < 1.2) {
    // A faint floor inside the containment, so the arena reads.
    col += sec * 0.012 * smoothstep(rc, rc - 0.25, rn);
    col += prim * 1.1 * line(r - rc * R, 1.6);
    let tk = fract((ang + PI) / TAU * 120.0);
    col += sec * 0.4 * line((tk - 0.5) * r * TAU / 120.0, 1.0) * step(rc * R - 7.0, r) * step(r, rc * R - 2.5);
    // Past the containment, hatched off, softly at both edges.
    if (rn > rc && rn < 1.0) {
      let h = fract((q.x + q.y) / 7.0);
      let zone = smoothstep(rc, rc + 0.04, rn) * smoothstep(1.0, 0.96, rn);
      col += alert * 0.12 * line((h - 0.5) * 7.0, 1.0) * zone;
    }
    // The bezel, in the signal's colour.
    col += prim * 0.3 * line(r - R, 1.0);
    // Its ticks: a long one every 15°.
    if (rn > 1.03 && rn < 1.08) {
      let f = fract((ang + PI * 0.5) / TAU);
      let k = fract(f * 96.0);
      let major = abs(fract(f * 24.0 + 0.5) - 0.5) < 0.01;
      let tick = line((k - 0.5) * r * TAU / 96.0, 1.2) * step(1.035, rn) * step(rn, select(1.06, 1.075, major));
      col += sec * select(0.1, 0.32, major) * tick;
    }
    // The arcs: the swarm's order above (the signal's colour), its pace below (bone), each a
    // run of twelve cells lit as far as its value.
    if (rn > 1.085 && rn < 1.17) {
      for (var i = 0u; i < 2u; i++) {
        let centre = select(PI * 0.5, -PI * 0.5, i == 0u);
        let value = sat(select(eased.w, eased.z, i == 0u));
        let hue = select(sec, prim, i == 0u);
        var da = ang - centre;
        da = da - TAU * round(da / TAU);
        if (abs(da) < ARC + 0.08) {
          let ends = smoothstep(ARC + 0.07, ARC - 0.02, abs(da));
          col += sec * 0.22 * ends * (line(r - R * 1.095, 1.0) + line(r - R * 1.155, 1.0));
          let u = (da + ARC) / (2.0 * ARC);
          let cellPx = 2.0 * ARC / 12.0 * r;
          let cell = floor(u * 12.0);
          let dx = (abs(fract(u * 12.0) - 0.5) - 0.34) * cellPx;
          let dy = abs(r - R * 1.125) - R * 0.019;
          let inCell = fill(max(dx, dy)) * step(abs(da), ARC);
          let lit = sat(value * 12.0 - cell);
          col += mix(hue * 0.07, hue * 1.15, lit) * inCell;
        }
      }
    }
  }

  // ── The hex wing, left of the ring: the more the swarm agrees, the more cells answer ──
  let colRight = select(-1e5, P.scr2.x + P.scr2.z, P.scr2.z > 0.0);
  if (rn > 1.22 && rn < 1.62 && cos(ang) < -0.68 && abs(q.y) < R * 1.15) {
    let hc = hexCell(p, 12.0);
    // The cell's id, exact: its centre sits on a half-cell grid, and hashing it unrounded split
    // cells and streaked whole columns.
    let id = round(vec2f(hc.z * 2.0, hc.w / 0.8660254));
    let h = hash21(id);
    let wing = smoothstep(-0.7, -0.82, cos(ang)) * smoothstep(1.22, 1.32, rn) * smoothstep(1.62, 1.5, rn) *
      smoothstep(R * 1.15, R * 0.95, abs(q.y)) * smoothstep(colRight + 6.0, colRight + 46.0, p.x);
    let pulse = 0.5 + 0.5 * sin(t * 2.0 + h * 9.0 - length(id) * 0.2);
    var cc = mix(sec, prim, step(0.55, h)) * 0.1;
    if (h < order * 0.4 + 0.04) {
      cc = mix(sec, prim, step(0.5, h)) * (0.3 + 0.6 * pulse);
    }
    if (h > 1.0 - fear * 0.6) {
      cc = alert * (0.5 + 0.7 * pulse);
    }
    col += cc * wing * line(hexagon(hc.xy, 4.8), 1.0);
    if (h < 0.07) {
      col += prim * wing * fill(abs(hc.x) + abs(hc.y) - 1.6);
    }
  }

  // Brackets, predators and the lure all live in the ring (and a bracket's reach past it).
  let inRing = rn < 1.0 + 90.0 / R;
  // ── Clusters: brackets close in on each as it's locked, with its id ──
  for (var i = 0u; i < select(0u, TRACKS, inRing); i++) {
    let tp = tracks[2u * i];
    let ta = tracks[2u * i + 1u];
    if (ta.x <= 0.01) {
      continue;
    }
    let s = c + tp.xy * R;
    let lock = tp.w * tp.w * (3.0 - 2.0 * tp.w);
    let size = bracketSize(tp);
    let lq = abs(p - s);
    if (max(lq.x, lq.y) > size + 30.0) {
      continue;
    }
    let edge = max(lq.x, lq.y) - size;
    let arm = min(size * 0.45, 9.0);
    let corner = step(size - arm, lq.x) * step(size - arm, lq.y);
    let hue = mix(prim * 1.5, sec * 1.2, lock);
    col += hue * ta.x * line(edge, 1.5) * corner;
    // Acquiring: a diamond turning in.
    let dq = p - s;
    let rot = vec2f(dq.x + dq.y, dq.x - dq.y) * 0.7071;
    col += prim * ta.x * (1.0 - lock) * line(max(abs(rot.x), abs(rot.y)) - size * 0.75, 1.0);
    // Locked: a pip at the centre, the id over the top right corner.
    col += sec * ta.x * lock * fill(length(dq) - 1.4);
    let id = u32(ta.y);
    let at = (p - (s + vec2f(size + 4.0, -size - 3.0))) / 1.3;
    let num = max(digit(at, id / 10u), digit(at - vec2f(6.0, 0.0), id));
    col += hue * ta.x * 1.2 * num;
  }

  // ── Predators: chevrons in the counter-accent, each in its ring of fear ──
  for (var i = 0u; i < select(0u, PREDS, inRing); i++) {
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
    let fwd = select(vec2f(1.0, 0.0), normalize(v), length(v) > 1e-5);
    let lq = vec2f(dot(dq, fwd), dot(dq, vec2f(-fwd.y, fwd.x)));
    let chev = max(abs(lq.y) * 0.9 + lq.x * 0.75 - 4.2, -lq.x - 3.6 + abs(lq.y) * 0.4);
    col += alert * 2.0 * on * fill(chev);
    let fa = atan2(dq.y, dq.x);
    let dash = step(0.5, fract(fa / TAU * 36.0 + t * 0.4));
    col += alert * 0.26 * on * line(dl - 0.32 * R, 1.0) * dash;
  }

  // ── The lure: a reticle, brighter while it's held ──
  if (inRing) {
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

  // ── The instrument column: the scope over the radar ──
  let cl = P.scr2;
  if (cl.z > 0.0 && p.x > cl.x - 12.0 && p.x < cl.x + cl.z + 12.0 && p.y > cl.y - 12.0 && p.y < cl.y + cl.w + 12.0) {
    // The scope: order (signal), pace (bone), fear (counter-accent), clusters (dim, stepped).
    let sh = cl.w * 0.29;
    let half = vec2f(cl.z, sh) * 0.5;
    let sq = p - vec2f(cl.x, cl.y) - half;
    if (abs(sq.y) < half.y + 6.0) {
      col += prim * 0.8 * corners(sq, half, 14.0);
      let b = max(abs(sq.x) - half.x, abs(sq.y) - half.y);
      if (b < 0.0) {
        let inner = smoothstep(0.0, 20.0, -b);
        let lp = sq + half;
        let g = abs(fract(vec2f(lp.x / (cl.z / 8.0), lp.y / (sh / 4.0)) + 0.5) - 0.5) * vec2f(cl.z / 8.0, sh / 4.0);
        col += bone * 0.05 * inner * (line(g.x, 1.0) + line(g.y, 1.0));
        col += prim * 1.5 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 0u);
        col += sec * 1.0 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 1u);
        col += alert * 1.2 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 3u);
        col += bone * 0.3 * scopeTrace(p, cl.x, cl.y, cl.z, sh, 2u);
        // The write head, at the right, fading toward the top and bottom.
        col += prim * 0.5 * line(sq.x - half.x + 1.5, 1.0) * smoothstep(half.y, half.y - 14.0, abs(sq.y));
      }
    }
    // The radar: the swarm's density as a matrix of dots, swept; everything in it fades
    // before the rim.
    let rr = min(cl.z * 0.5 - 4.0, cl.w * 0.22);
    let rcen = vec2f(cl.x + cl.z * 0.5, cl.y + cl.w - rr - 2.0);
    let lp = (p - rcen) / rr;
    let lr = length(lp);
    if (lr < 1.08) {
      col += prim * 0.6 * line((lr - 1.0) * rr, 1.2);
      let soft = smoothstep(1.0, 0.75, lr);
      col += bone * 0.1 * soft * (line((lr - 0.66) * rr, 1.0) + line((lr - 0.33) * rr, 1.0));
      col += bone * 0.09 * soft * (line(p.x - rcen.x, 1.0) + line(p.y - rcen.y, 1.0));
      let sa = t * 1.3;
      let behind = fract((sa - atan2(lp.y, lp.x)) / TAU);
      let sweep = exp(-behind * 4.5);
      if (lr < 1.0) {
        let rim = smoothstep(1.0, 0.85, lr);
        col += sec * 0.06 * sweep * rim;
        col += sec * 0.7 * line(behind * lr * rr * TAU, 1.0) * step(behind, 0.5) * rim;
        let pitch = 4.0;
        let cc = (floor((p - rcen) / pitch) + 0.5) * pitch;
        let world = cc / rr;
        let dens = textureSampleLevel(farTex, samp, fieldUv(world), 0.0).x / max(P.sim3.w, 1e-3);
        let dotR = clamp(dens * 0.45, 0.0, 1.7);
        let dcol = mix(sec * 0.8, prim, smoothstep(1.5, 4.0, dens));
        col += dcol * (0.25 + 0.95 * sweep) * rim * fill(length(p - rcen - cc) - dotR) * step(0.3, dens);
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
            col += alert * 1.6 * on * fill(length(p - (rcen + preds[2u * i].xy * rr)) - 1.6);
          }
        }
      }
    }
  }

  // ── The frame: corner brackets fading along their sides, registration marks, a ruler ──
  let left = select(c.x - R * 1.5, cl.x - 22.0, cl.z > 0.0);
  let right = c.x + R * 1.36;
  let top = c.y - R * 1.3;
  let bottom = c.y + R * 1.3;
  let fc = vec2f(left + right, top + bottom) * 0.5;
  let fh = vec2f(right - left, bottom - top) * 0.5;
  col += prim * 0.6 * corners(p - fc, fh, 22.0);
  col += bone * 0.35 * mark(abs(p - fc) - fh - vec2f(12.0));
  if (abs(p.y - top) < 6.0) {
    let i = round(p.x / 10.0);
    let major = abs(i - 5.0 * round(i / 5.0)) < 0.5;
    let ends = smoothstep(left + 40.0, left + 110.0, p.x) * smoothstep(right - 40.0, right - 110.0, p.x);
    col += bone * 0.16 * ends * line(p.x - i * 10.0, 1.0) * step(p.y - top, select(2.5, 5.0, major)) * step(0.0, p.y - top);
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
  var col = vec3f(0.0);
  // Under the panel and past it there's nothing to draw.
  if (P.scr3.y < 0.5 || p.x < P.scr3.x + 1.0) {
    col = hud(p) * shown;
  }
  col += textureLoad(trail, vec2i(in.pos.xy), 0).rgb;
  // Every edge of the frame is the page.
  let size = P.scr0.xy / dpr;
  let edge = smoothstep(0.0, 40.0, p.x) * smoothstep(0.0, 40.0, size.x - p.x) *
    smoothstep(0.0, 30.0, p.y) * smoothstep(0.0, 30.0, size.y - p.y);
  return vec4f(page + col * edge, 1.0);
}

// ── Wires: each row of the panel to what it drives ──

/** A wire: a cubic from the row (a) to what it lands on (d). */
struct Wire {
  a: vec2f,
  b: vec2f,
  c: vec2f,
  d: vec2f,
}
const SEGS = 48u;

/**
 * Where row i's wire lands, by its kind (rows[i].w): 0 the heaviest cluster's bracket, 1 the
 * tip of the order arc, 2 the next cluster's bracket, 3 the tip of the pace arc, 4 a predator,
 * 5 the containment ring, 6 the bezel, 7 the lure's reticle. It arrives along the normal of
 * what it lands on (or from the panel's side, inside the ring).
 */
fn wire(i: u32) -> Wire {
  let row = P.rows[i];
  let c = P.scr1.xy;
  let R = P.scr1.z;
  let a = vec2f(P.scr3.x - 2.0, row.x);
  let kind = u32(row.w + 0.5);
  let m = hist[HIST + 1u];
  var end = c;
  var n = vec2f(1.0, 0.0);
  var reach = 120.0;
  switch kind {
    case 0u, 2u, 4u: {
      end = hist[ANCH + kind].xy;
      n = normalize(vec2f(1.0, 0.0) + normalize(a - end + vec2f(1e-3, 0.0)));
    }
    case 1u: {
      n = dir(-PI * 0.5 - ARC + 2.0 * ARC * sat(m.z));
      end = c + n * R * 1.168;
      reach = 56.0;
    }
    case 3u: {
      n = dir(PI * 0.5 - ARC + 2.0 * ARC * sat(m.w));
      end = c + n * R * 1.168;
      reach = 56.0;
    }
    case 5u: {
      n = dir(0.12);
      end = c + n * R * P.sim1.y;
    }
    case 6u: {
      n = dir(-0.22);
      end = c + n * R;
    }
    case 7u: {
      let lure = c + P.sim2.xy * R;
      n = normalize(vec2f(1.0, 0.0) + normalize(a - lure + vec2f(1e-3, 0.0)));
      end = lure + n * 6.0;
    }
    default: {
      end = a - vec2f(1.0, 0.0);
    }
  }
  let L = length(a - end);
  return Wire(a, a - vec2f(0.42 * L, 0.0), end + n * min(0.38 * L, reach), end);
}
fn bez(w: Wire, t: f32) -> vec2f {
  let s = 1.0 - t;
  return s * s * s * w.a + 3.0 * s * s * t * w.b + 3.0 * s * t * t * w.c + t * t * t * w.d;
}
fn bezSlope(w: Wire, t: f32) -> vec2f {
  let s = 1.0 - t;
  return 3.0 * s * s * (w.b - w.a) + 6.0 * s * t * (w.c - w.b) + 3.0 * t * t * (w.d - w.c);
}
/** How far the wires have drawn on (0 none, 1 all), panel end first, as the display arrives. */
fn drawn() -> f32 {
  return sat((P.scr1.w - 0.35) / 0.55);
}

struct WireOut {
  @builtin(position) pos: vec4f,
  @location(0) across: f32,
  @location(1) t: f32,
  @location(2) @interpolate(flat) info: vec4f,
}

@vertex
fn vs_wire(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> WireOut {
  var o: WireOut;
  let w = wire(ii);
  let corner = array(vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[vi % 6u];
  let t = (f32(vi / 6u) + corner.x) / f32(SEGS);
  let d = bezSlope(w, t);
  let tng = select(vec2f(1.0, 0.0), normalize(d), length(d) > 1e-4);
  let hw = 6.0;
  o.pos = toClip(bez(w, t) + vec2f(-tng.y, tng.x) * corner.y * hw);
  o.across = corner.y * hw;
  o.t = t;
  o.info = vec4f(P.rows[ii].z, P.rows[ii].y, length(w.d - w.a) * 1.15, 0.0);
  return o;
}

@fragment
fn fs_wire(in: WireOut) -> @location(0) vec4f {
  let a = abs(in.across);
  let dpr = P.scr0.z;
  // A hairline of light in a soft glow, like the desk's wires.
  let core = sat((0.6 - a) * dpr + 0.5);
  let halo = exp(-a * a / 7.0) * 0.2;
  let glow = in.info.x;
  var k = (core + halo) * (0.2 + 0.85 * glow);
  // Packets, from the row to what it drives, quicker the higher its value.
  let s = in.t * in.info.z / 72.0 - P.sim1.w * (0.25 + 1.1 * in.info.y);
  k += smoothstep(0.9, 1.0, fract(s)) * exp(-a * a / 2.5) * (0.4 + 0.9 * glow);
  let on = smoothstep(in.t, in.t + 0.04, drawn() * 1.04);
  return vec4f(P.pal0.rgb * k * on, 0.0);
}

struct CapOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) info: vec2f,
}

@vertex
fn vs_cap(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> CapOut {
  var o: CapOut;
  let w = wire(ii / 2u);
  let landing = ii % 2u == 1u;
  let corner = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[vi];
  o.local = corner * 9.0;
  o.pos = toClip(select(w.a, w.d, landing) + o.local);
  o.info = vec2f(P.rows[ii / 2u].z, select(0.0, 1.0, landing));
  return o;
}

/** A dot at each end of a wire; where it lands, a socket ring round the dot too. */
@fragment
fn fs_cap(in: CapOut) -> @location(0) vec4f {
  let d = length(in.local);
  let dpr = P.scr0.z;
  let pip = sat((2.2 - d) * dpr + 0.5);
  let ring = sat((0.55 - abs(d - 4.6)) * dpr + 0.5) * in.info.y * 0.55;
  let halo = exp(-d * d / 9.0) * 0.25;
  let glow = in.info.x;
  let on = select(smoothstep(0.0, 0.1, drawn()), smoothstep(0.95, 1.0, drawn()), in.info.y > 0.5);
  return vec4f(P.pal0.rgb * (pip + ring + halo) * (0.5 + 0.6 * glow) * on, 0.0);
}
