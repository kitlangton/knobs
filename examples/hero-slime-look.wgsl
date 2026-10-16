// The slime mould's look, in linear HDR for controls-post.wgsl to bloom and tone. The trail field
// becomes light: a soft exposure curve turns it into veins, whose slope lights them as raised
// tubes (a key from the upper left, a glint along each ridge, a shadow on the substrate below),
// coloured by a ramp from deep through body to a hot core, and by age: the slow channel marks
// the highways the mould has kept, which take the palette's second ramp. A gentle pulse travels
// out from the food along the network. At the stage's edges everything fades to the page.

struct Look {
  res: vec4f,          // canvas w, h (device px), grid W, H (cells)
  view: vec4f,         // gain (1 / level), relief, time (s), presence (the entrance, 0 to 1)
  page: vec4f,         // the page (linear), the edge it fades over (device px)
  food: vec4f,         // the food (device px), its mark, the pulse
  pal: array<vec4f, 6>, // fresh: deep, body, core; kept: deep, body, core (linear)
  more: vec4f,         // the kept channel's gain, shadow, glow, device px per CSS px
}

@group(0) @binding(0) var<uniform> U: Look;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct FullOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullOut {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: FullOut;
  o.pos = vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  o.uv = uv;
  return o;
}

fn sat(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}
fn at(uv: vec2f) -> vec2f {
  return textureSampleLevel(field, samp, uv, 0.0).rg;
}
fn expose(v: f32) -> f32 {
  return 1.0 - exp(-max(v, 0.0) * U.view.x);
}

@fragment
fn fs(in: FullOut) -> @location(0) vec4f {
  let uv = in.uv;
  let px = in.pos.xy;
  let cell = 1.0 / U.res.zw;
  let s = at(uv);
  let t = expose(s.r);
  // The slope, over a cell each way: the veins as raised tubes.
  let gx = expose(at(uv + vec2f(cell.x, 0.0)).r) - expose(at(uv - vec2f(cell.x, 0.0)).r);
  let gy = expose(at(uv + vec2f(0.0, cell.y)).r) - expose(at(uv - vec2f(0.0, cell.y)).r);
  let n = normalize(vec3f(-vec2f(gx, gy) * U.view.y, 1.0));
  let key = normalize(vec3f(-0.5, -0.66, 0.56));
  let diffuse = sat(dot(n, key));
  let glint = pow(sat(dot(n, normalize(key + vec3f(0.0, 0.0, 1.0)))), 40.0);
  // Age: highways the mould has kept a while take the second ramp.
  let kept = smoothstep(0.06, 0.75, 1.0 - exp(-max(s.g, 0.0) * U.view.x * U.more.x));
  let deep = mix(U.pal[0].rgb, U.pal[3].rgb, kept);
  let body = mix(U.pal[1].rgb, U.pal[4].rgb, kept);
  let core = mix(U.pal[2].rgb, U.pal[5].rgb, kept);
  let ramp = mix(mix(deep, body, smoothstep(0.0, 0.55, t)), core, smoothstep(0.5, 1.0, t));
  // The pulse: a slow wave outward from the food, as the mould's streaming shuttles.
  let dpr = U.more.w;
  let d = length(px - U.food.xy) / dpr;
  let pulse = 1.0 + U.food.w * (0.5 + 0.5 * sin(U.view.z * 1.7 - d * 0.021)) * smoothstep(0.15, 0.7, t);
  var light = ramp * pow(t, 1.3) * (0.42 + 0.85 * diffuse) * pulse + core * glint * t * 0.7;
  light *= U.more.z;
  // The substrate: a shadow where a vein stands between it and the key.
  let towards = vec2f(-1.5, -2.0) * cell;
  let shade = sat(expose(at(uv + towards).r) - t) * U.more.y;
  // The food's mark: a point of light in a hairline ring.
  let f = length(px - U.food.xy) / dpr;
  let ring = (f - 11.0) / 0.9;
  light += core * U.food.z * (1.4 * exp(-f * f / 7.0) + 0.22 * exp(-ring * ring));
  // Everything fades to the page at the stage's edges.
  let e = min(min(px.x, U.res.x - px.x), min(px.y, U.res.y - px.y));
  let edge = smoothstep(0.0, 1.0, sat(e / U.page.w));
  let fade = edge * edge * U.view.w;
  let c = U.page.rgb * (1.0 - 0.55 * shade * fade) + light * fade;
  return vec4f(max(c, vec3f(0.0)), 1.0);
}
