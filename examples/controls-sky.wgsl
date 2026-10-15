// The sky scene: the hour's colour from the gradient, made into a sky. A deeper zenith and a
// brighter horizon, warmed on the sun's side when it's low; an HDR sun with a soft limb and a
// two-lobe glow that blooms; banded clouds lit from the sun's side; stars where the sky is dark
// enough; two ranges of hills, the far one hazed into the horizon. Nothing in it depends on time,
// so a still sky costs nothing. Linear HDR; the post tone-maps with AgX.
//
// u.v[0]  sky colour at the hour (linear): the horizon; daylight (0 at 6h, 1 at 18h)
// u.v[1]  sun colour × intensity (linear), elevation (−1…1)
// u.v[2]  stars, cloud cover, tone, seed
// u.v[3]  the ramp two hours further from noon (linear): the zenith

const HORIZON = -0.2;

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash12(i);
  let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0));
  let d = hash12(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2f(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}

fn ridge(x: f32, far: bool) -> f32 {
  if (far) {
    return HORIZON + 0.06 + 0.035 * sin(x * 3.1 + 1.0) + 0.022 * sin(x * 7.3 + 2.1) + 0.008 * sin(x * 19.0);
  }
  return HORIZON - 0.04 + 0.05 * sin(x * 2.3 + 0.4) + 0.028 * sin(x * 5.9 + 1.7) + 0.009 * sin(x * 15.0 + 0.3);
}

fn scene(px: vec2f) -> vec3f {
  let res = u.frame.xy;
  let uv = (px - 0.5 * res) / res.y * vec2f(1.0, -1.0);
  let aspect = res.x / res.y;
  let pix = 1.0 / res.y;
  let sky = u.v[0].rgb;
  let day = u.v[0].w;
  let sunCol = u.v[1].rgb;
  let elev = u.v[1].w;
  let stars = u.v[2].x;
  let clouds = u.v[2].y;
  let sunPos = vec2f(mix(-0.4, 0.4, sat(day)) * aspect, HORIZON + elev * 0.56);
  let toSun = uv - sunPos;
  let ds = length(toSun * vec2f(1.0, 1.15));
  let low = 1.0 - sat(elev * 2.2);
  let up = sat((uv.y - HORIZON) / 0.75);

  // The dome: deeper overhead, lighter and warmer low, warmest towards the sun when it's low.
  let zenith = u.v[3].rgb * 0.7 + vec3f(0.0, 0.002, 0.008);
  let side = exp(-abs(uv.x - sunPos.x) * 1.6) * low * sat(elev + 0.25);
  let horizon = sky * 1.1 + vec3f(0.015) * sat(elev + 0.2) + sunCol * 0.06 * side;
  var col = mix(horizon, zenith, pow(up, 0.55));

  // Stars, where the sky is dark enough to show them.
  let lum = dot(zenith, vec3f(0.2126, 0.7152, 0.0722));
  let starVis = stars * sat(1.0 - lum * 18.0) * smoothstep(HORIZON, HORIZON + 0.25, uv.y);
  if (starVis > 0.001) {
    let g = uv * 90.0;
    let cell = floor(g);
    let h = hash12(cell + u.v[2].w);
    if (h > 0.972) {
      let c = vec2f(hash12(cell * 1.31), hash12(cell * 2.17));
      let d = length(fract(g) - c);
      let b = (h - 0.972) / 0.028;
      col += vec3f(0.9, 0.95, 1.0) * starVis * b * b * 0.6 * exp(-d * d * 60.0);
    }
  }

  // The sun: a soft-limbed HDR disc and a glow that blooms, its warmth from its height.
  let vis = smoothstep(-0.08, 0.02, elev);
  col += sunCol * (0.8 * exp(-ds * 10.0) + 0.22 * exp(-ds * 2.6)) * vis;
  let r = 0.032;
  col += sunCol * 9.0 * (1.0 - smoothstep(r - pix, r + pix, ds)) * (1.0 - 0.35 * sat(ds / r)) * vis;

  // Clouds in a band above the hills, lit from the sun's side, dark against the night.
  if (clouds > 0.001) {
    let q = vec2f(uv.x * 1.6, (uv.y - HORIZON) * 5.0);
    let n = fbm(q * vec2f(1.0, 1.6) + vec2f(u.v[2].w * 0.01, 0.0));
    let band = smoothstep(0.0, 0.12, uv.y - HORIZON) * (1.0 - smoothstep(0.3, 0.62, uv.y - HORIZON));
    let dens = smoothstep(0.62 - clouds * 0.32, 0.86, n) * band;
    let lit = 0.45 + 0.55 * exp(-max(ds - 0.05, 0.0) * 2.2);
    let cloud = sky * 0.75 + sunCol * 0.11 * lit * vis + vec3f(0.01);
    col = mix(col, cloud, dens * 0.85);
  }

  // Two ranges of hills: the far one hazed into the horizon, the near one nearly black.
  let farY = ridge(uv.x, true);
  let nearY = ridge(uv.x, false);
  let farCol = mix(horizon * 0.42, zenith * 0.2, 0.4) + sunCol * 0.012 * side;
  let nearCol = zenith * 0.06 + vec3f(0.002);
  col = mix(col, farCol, 1.0 - smoothstep(farY - pix, farY + pix, uv.y));
  col = mix(col, nearCol, 1.0 - smoothstep(nearY - pix, nearY + pix, uv.y));
  // A haze that hangs low in the valley.
  col += horizon * 0.12 * exp(-max(uv.y - (HORIZON - 0.12), 0.0) * 14.0) * (1.0 - smoothstep(nearY - 0.02, farY + 0.01, uv.y));
  return col;
}
