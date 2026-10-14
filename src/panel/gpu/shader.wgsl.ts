export const FLOATS_PER_PRIM = 40

export const panelWgsl = /* wgsl */ `
struct Prim {
  rect: vec4f,    // x, y, w, h in viewport CSS px
  clip: vec4f,    // minX, minY, maxX, maxY in viewport CSS px
  uv: vec4f,      // u0, v0, u1, v1 (atlas UVs), or corner radii tl, tr, br, bl when motion.w = 1
  color: vec4f,   // primary r, g, b, a
  color2: vec4f,  // secondary r, g, b, a (border / handle / thumb / glow)
  look: vec4f,    // radius, strokeWidth, glowOrBlur, kind
  motion: vec4f,  // blurX, blurY, stretchX, cornersInUv
  extra: vec4f,   // kind-specific params
  aux: vec4f,     // kind-specific params
  aux2: vec4f,    // kind-specific color
}

struct View {
  size: vec2f,
  dpr: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> prims: array<Prim>;
@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var labels: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) screenPx: vec2f,
  @location(1) @interpolate(flat) id: u32,
  @location(2) @interpolate(flat) rect: vec4f,
}

@vertex fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let p = prims[i];
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let c = corners[v];

  var r = p.rect;
  if (p.motion.z < -0.01) {
    r.x += p.motion.z;
    r.z -= p.motion.z;
  } else if (p.motion.z > 0.01) {
    r.z += p.motion.z;
  }

  // Shadows and the pill/switch glows reach ~14px past their shapes.
  let wide = p.look.w == 0.0 || p.look.w == 3.0 || p.look.w == 4.0;
  let padGlow = select(p.look.z * 1.6, p.look.z * 2.2 + 8.0, wide);
  let pad = vec2f(padGlow + 2.0) + abs(p.motion.xy) * 0.65;
  let screenPx = (r.xy - pad) + c * (r.zw + pad * 2.0);

  var o: Out;
  o.pos = vec4f(screenPx / view.size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  o.screenPx = screenPx;
  o.id = i;
  o.rect = r;
  return o;
}

fn roundedBox(p: vec2f, size: vec2f, r: f32) -> f32 {
  let rad = min(r, min(size.x, size.y) * 0.5);
  let q = abs(p - size * 0.5) - size * 0.5 + rad;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - rad;
}

// Per-corner radii (tl, tr, br, bl), e.g. the first and last rows of a grouped card.
fn roundedBox4(p: vec2f, size: vec2f, radii: vec4f) -> f32 {
  let c = p - size * 0.5;
  let top = select(radii.x, radii.y, c.x > 0.0);
  let bottom = select(radii.w, radii.z, c.x > 0.0);
  let rad = min(select(top, bottom, c.y > 0.0), min(size.x, size.y) * 0.5);
  let q = abs(c) - size * 0.5 + rad;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - rad;
}

fn radiiOf(p: Prim) -> vec4f {
  return select(vec4f(p.look.x), p.uv, p.motion.w > 0.5);
}

fn covSd(dist: f32) -> f32 {
  return clamp(0.5 - dist * view.dpr, 0.0, 1.0);
}

fn hairline(dist: f32, w: f32) -> f32 {
  return clamp(0.5 - (abs(dist + w * 0.5) - w * 0.5) * view.dpr, 0.0, 1.0);
}

fn premul(c: vec4f) -> vec4f {
  return vec4f(c.rgb * c.a, c.a);
}

fn over(dst: vec4f, src: vec4f) -> vec4f {
  return src + dst * (1.0 - src.a);
}

fn hash21(q: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(q, vec2f(0.06711056, 0.00583715))));
}

// kind 0: Panel card surface + elevation shadow + border + specular top catchlight
fn shadePanel(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let r = p.look.x;
  let dist = roundedBox(local, size, r);
  var out = vec4f(0.0);

  // Floating drop shadow when glowOrBlur (look.z) > 0
  if (p.look.z > 0.5 && dist > -1.0) {
    let shDist = roundedBox(local - vec2f(0.0, 6.0), size, r);
    let shBlur = max(p.look.z, 2.0);
    let shA = pow(clamp(1.0 - smoothstep(-shBlur * 0.3, shBlur * 1.5, shDist), 0.0, 1.0), 1.8) * p.extra.x;
    out = vec4f(0.0, 0.0, 0.0, shA);
  }

  let bodyCov = covSd(dist);
  if (bodyCov <= 0.0) { return out; }

  let topSheen = (1.0 - smoothstep(0.0, min(size.y * 0.35, 36.0), local.y)) * p.extra.y;
  let bodyRgb = clamp(p.color.rgb + vec3f(topSheen * 0.025), vec3f(0.0), vec3f(1.0));
  var card = vec4f(bodyRgb * p.color.a, p.color.a) * bodyCov;

  // 1px outer hairline border + top specular rim
  let strokeW = max(p.look.y, 1.0);
  let borderCov = hairline(dist, strokeW);
  let rimBoost = (1.0 - smoothstep(0.0, 18.0, local.y)) * p.extra.y * 0.35;
  let borderCol = vec4f(clamp(p.color2.rgb + vec3f(rimBoost), vec3f(0.0), vec3f(1.0)), min(1.0, p.color2.a + rimBoost * 0.5));
  card = over(card, premul(borderCol) * borderCov);

  return over(out, card);
}

// kind 1: Control surface (slider track, button, preset strip, segmented tray)
fn shadeTrack(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let dist = roundedBox4(local, size, radiiOf(p));
  var out = vec4f(0.0);

  // Focus ring + optical glow
  let focus = clamp(p.extra.y, 0.0, 1.0);
  if (focus > 0.005) {
    let glowR = max(2.0, p.look.z);
    if (dist > -2.0 && dist < glowR * 2.2) {
      let halo = exp(-max(dist, 0.0) / (glowR * 0.55)) * 0.24 * focus * clamp(p.look.z / 8.0, 0.0, 1.5);
      out = over(out, vec4f(p.color2.rgb * halo, halo));
    }
  }

  let cov = covSd(dist);
  if (cov > 0.0) {
    let hover = clamp(p.extra.x, 0.0, 1.0);
    let top = 1.0 - smoothstep(0.0, size.y * 0.65, local.y);
    let rgb = clamp(p.color.rgb + vec3f(hover * 0.03 + top * 0.012), vec3f(0.0), vec3f(1.0));
    let a = clamp(p.color.a + hover * 0.035, 0.0, 1.0);
    out = over(out, vec4f(rgb * a, a) * cov);

    if (p.look.y > 0.0) {
      let bCov = hairline(dist, p.look.y);
      out = over(out, premul(p.color2) * bCov);
    }
  }

  if (focus > 0.005) {
    let ringCov = clamp(0.5 - (abs(dist + 0.75) - 0.85) * view.dpr, 0.0, 1.0) * focus;
    out = over(out, vec4f(p.color2.rgb * ringCov, ringCov));
  }
  return out;
}

// Single sample of slider fill + handle at local coordinate
fn sampleSliderAt(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let fillRatio = clamp(p.extra.x, 0.0, 1.0);
  let fillX = fillRatio * size.x;
  var out = vec4f(0.0);

  // Accent-tinted fill; its leading 24px brighten toward the edge (look.y = edge alpha), and the
  // whole fill fades to 40% under the readout (aux.x = readout zone width from the right).
  let fillCov = clamp(0.5 - (local.x - fillX) * view.dpr, 0.0, 1.0);
  if (fillCov > 0.0) {
    let edge = (1.0 - clamp((fillX - local.x) / 24.0, 0.0, 1.0)) * p.look.y;
    let zone = mix(0.4, 1.0, clamp((size.x - p.aux.x - local.x) / 16.0, 0.0, 1.0));
    out = over(premul(p.color), vec4f(p.color2.rgb * edge, edge)) * fillCov * zone;
  }

  // Handle pill at fillX
  let handleScale = clamp(p.extra.y, 0.0, 1.0);
  if (handleScale > 0.01) {
    let dodge = select(1.0, 0.28, fillRatio < 0.22 || fillRatio > 0.78);
    let hScaleY = select(1.0, 0.76, fillRatio < 0.22 || fillRatio > 0.78);
    // Like the CSS handle: 3px wide at rest, scaled from 25% width as it appears.
    let hw = 3.0 * clamp(0.25 + handleScale * 1.15, 0.25, 1.0);
    let hh = max(6.0, (size.y - 12.0) * hScaleY);
    let hp = local - vec2f(fillX - hw * 0.5, (size.y - hh) * 0.5);
    let hDist = roundedBox(hp, vec2f(hw, hh), hw * 0.5);
    let hCov = covSd(hDist);
    let hAlpha = p.color2.a * handleScale * dodge;
    if (hCov > 0.0) {
      out = over(out, vec4f(p.color2.rgb * hAlpha * hCov, hAlpha * hCov));
    }
    // Subtle handle glow when active/moving
    if (p.look.z > 0.1 && hDist > 0.0 && hDist < 12.0) {
      let glow = exp(-hDist / 3.5) * 0.18 * handleScale * dodge * clamp(p.look.z, 0.0, 1.5);
      out = over(out, vec4f(p.color2.rgb * glow, glow));
    }
  }
  return out;
}

// kind 2: Slider fill + tick marks + hairline handle with horizontal motion blur
fn shadeSlider(p: Prim, local: vec2f, size: vec2f, fragPos: vec2f) -> vec4f {
  let trackDist = roundedBox4(local, size, radiiOf(p));
  let trackCov = covSd(trackDist);
  if (trackCov <= 0.0) { return vec4f(0.0); }

  let blurX = p.motion.x;
  var acc = vec4f(0.0);
  if (abs(blurX) < 0.6) {
    acc = sampleSliderAt(p, local, size);
  } else {
    let n = clamp(i32(abs(blurX) / 1.8) + 3, 4, 14);
    let j = hash21(fragPos);
    for (var k = 0; k < n; k++) {
      let f = (f32(k) + j) / f32(n) - 0.5;
      acc += sampleSliderAt(p, local - vec2f(blurX * f, 0.0), size);
    }
    acc = acc / f32(n);
  }

  // Tick marks on hover/drag
  let tickAlpha = clamp(p.extra.w, 0.0, 1.0);
  let tickCount = p.extra.z;
  if (tickAlpha > 0.01 && tickCount >= 2.0) {
    let padX = 1.0;
    let span = max(1.0, size.x - padX * 2.0);
    let u = clamp((local.x - padX) / span, 0.0, 1.0);
    let stepU = 1.0 / (tickCount - 1.0);
    let nearestIdx = round(u / stepU);
    let tickX = padX + nearestIdx * stepU * span;
    let dx = abs(local.x - tickX);
    let dy = abs(local.y - size.y * 0.5);
    let tDist = max(dx - 0.5, dy - 3.5);
    let tCov = covSd(tDist);
    if (tCov > 0.0) {
      let ta = tCov * tickAlpha * 0.22;
      acc = over(acc, vec4f(p.color2.rgb * ta, ta));
    }
  }

  // Default notch: a 1×5 px tick rising from the bottom edge (aux.y = position, aux.z = opacity).
  if (p.aux.z > 0.005) {
    let nx = clamp(p.aux.y * size.x, 1.0, size.x - 1.0);
    let nCov = covSd(roundedBox(local - vec2f(nx - 0.5, size.y - 5.0), vec2f(1.0, 6.0), 0.5));
    let na = nCov * p.aux2.a * p.aux.z;
    acc = over(acc, vec4f(p.aux2.rgb * na, na));
  }

  return acc * trackCov;
}

// Single sample of a morphing pill
fn samplePillAt(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let r = p.look.x;
  let dist = roundedBox(local, size, r);
  var out = vec4f(0.0);
  if (p.look.z > 0.05 && dist > -1.0 && dist < 14.0) {
    let glow = exp(-max(dist, 0.0) / 4.5) * 0.16 * clamp(p.look.z, 0.0, 1.5) * p.color.a;
    out = vec4f(p.color2.rgb * glow, glow);
  }
  let cov = covSd(dist);
  if (cov <= 0.0) { return out; }
  let top = 1.0 - smoothstep(0.0, size.y * 0.6, local.y);
  let rgb = clamp(p.color.rgb + vec3f(top * 0.035), vec3f(0.0), vec3f(1.0));
  var pill = vec4f(rgb * p.color.a, p.color.a) * cov;
  let rimCov = hairline(dist, 1.0) * (0.35 + top * 0.35);
  pill = over(pill, vec4f(p.color2.rgb * p.color2.a * rimCov, p.color2.a * rimCov));
  return over(out, pill);
}

// kind 3: Morphing pill indicator (preset selector pill, segmented control active pill)
fn shadePill(p: Prim, local: vec2f, size: vec2f, fragPos: vec2f) -> vec4f {
  let blur = p.motion.xy;
  let len = length(blur);
  if (len < 0.6) {
    return samplePillAt(p, local, size);
  }
  let n = clamp(i32(len / 1.8) + 3, 4, 14);
  let j = hash21(fragPos);
  var acc = vec4f(0.0);
  for (var k = 0; k < n; k++) {
    let f = (f32(k) + j) / f32(n) - 0.5;
    acc += samplePillAt(p, local - blur * f, size);
  }
  return acc / f32(n);
}

// kind 4: Toggle switch track + spring-driven thumb with velocity elongation
fn shadeToggle(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let r = size.y * 0.5;
  let trackDist = roundedBox(local, size, r);
  var out = vec4f(0.0);

  let prog = clamp(p.extra.x, 0.0, 1.0);
  if (prog > 0.05 && p.look.z > 0.05 && trackDist > -1.0 && trackDist < 14.0) {
    let glow = exp(-max(trackDist, 0.0) / 4.2) * 0.22 * prog * clamp(p.look.z, 0.0, 1.5);
    out = over(out, vec4f(p.color.rgb * glow, glow));
  }

  let focus = clamp(p.extra.y, 0.0, 1.0);
  if (focus > 0.005) {
    let ringCov = clamp(0.5 - (abs(trackDist + 0.5) - 0.85) * view.dpr, 0.0, 1.0) * focus;
    out = over(out, vec4f(p.color2.rgb * ringCov, ringCov));
  }

  let trackCov = covSd(trackDist);
  if (trackCov <= 0.0) { return out; }

  out = over(out, premul(p.color) * trackCov);

  // Thumb capsule inside track
  let stretch = clamp(abs(p.motion.x) * 0.25, 0.0, 5.5);
  let pad = 2.0;
  let baseD = max(8.0, size.y - pad * 2.0);
  let thumbW = baseD + stretch;
  let travel = max(0.0, size.x - pad * 2.0 - thumbW);
  let thumbX = pad + prog * travel;
  let tp = local - vec2f(thumbX, pad);
  let tDist = roundedBox(tp, vec2f(thumbW, baseD), baseD * 0.5);

  // Subtle thumb drop shadow
  let shDist = roundedBox(tp - vec2f(0.0, 1.0), vec2f(thumbW, baseD), baseD * 0.5);
  let shA = smoothstep(2.0, -0.5, shDist) * 0.25 * trackCov;
  out = over(out, vec4f(0.0, 0.0, 0.0, shA));

  let tCov = covSd(tDist) * trackCov;
  if (tCov > 0.0) {
    out = over(out, premul(p.color2) * tCov);
  }
  return out;
}

fn sampleAtlasAlpha(p: Prim, local: vec2f, size: vec2f) -> f32 {
  if (any(local < vec2f(0.0)) || any(local > size)) { return 0.0; }
  let uv = mix(p.uv.xy, p.uv.zw, local / size);
  return textureSampleLevel(labels, smp, uv, 0.0).a;
}

// kind 5: Native-rasterized atlas text & hint badges with directional motion blur
fn shadeText(p: Prim, local: vec2f, size: vec2f, fragPos: vec2f) -> vec4f {
  let blur = p.motion.xy;
  let len = length(blur);
  var a = 0.0;
  if (len < 0.45) {
    a = sampleAtlasAlpha(p, local, size);
  } else {
    let n = clamp(i32(len / 1.5) + 3, 4, 12);
    let j = hash21(fragPos);
    for (var k = 0; k < n; k++) {
      let f = (f32(k) + j) / f32(n) - 0.5;
      a += sampleAtlasAlpha(p, local - blur * f, size);
    }
    a = a / f32(n);
  }
  let finalA = a * p.color.a;
  return vec4f(p.color.rgb * finalA, finalA);
}

// kind 7: Anti-aliased SDF dot with subtle radial bloom
fn shadeDot(p: Prim, local: vec2f, size: vec2f) -> vec4f {
  let center = size * 0.5;
  let r = min(size.x, size.y) * 0.5;
  let d = length(local - center) - r;
  let cov = covSd(d);
  let glow = exp(-max(d, 0.0) / max(1.2, p.look.z)) * 0.32 * clamp(p.look.z * 0.5, 0.0, 1.0);
  let a = clamp(cov + glow, 0.0, 1.0) * p.color.a;
  return vec4f(p.color.rgb * a, a);
}

@fragment fn fs_main(in: Out) -> @location(0) vec4f {
  let p = prims[in.id];
  let clipDist = min(
    min(in.screenPx.x - p.clip.x, p.clip.z - in.screenPx.x),
    min(in.screenPx.y - p.clip.y, p.clip.w - in.screenPx.y)
  );
  let clipCov = clamp(clipDist * view.dpr + 0.5, 0.0, 1.0);
  if (clipCov <= 0.0) { return vec4f(0.0); }

  let local = in.screenPx - in.rect.xy;
  let size = max(in.rect.zw, vec2f(1.0));
  let kind = i32(p.look.w + 0.5);

  var out = vec4f(0.0);
  switch (kind) {
    case 0: { out = shadePanel(p, local, size); }
    case 1: { out = shadeTrack(p, local, size); }
    case 2: { out = shadeSlider(p, local, size, in.pos.xy); }
    case 3: { out = shadePill(p, local, size, in.pos.xy); }
    case 4: { out = shadeToggle(p, local, size); }
    case 5: {
      out = shadeText(p, local, size, in.pos.xy);
      // Feathered slot for rolling digits: fade toward the clip's top and bottom edges.
      if (p.extra.x > 0.0) {
        let edge = min(in.screenPx.y - p.clip.y, p.clip.w - in.screenPx.y);
        out = out * smoothstep(0.0, p.extra.x, edge);
      }
    }
    default: { out = shadeDot(p, local, size); }
  }
  return out * clipCov;
}
`
