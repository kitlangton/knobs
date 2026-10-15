// The lamp scene: a pendant over a floor and a back wall, ray-traced per pixel (4 samples). An
// enamel dome hangs on a cord that sways; under it a frosted bulb with a filament. The bulb lights
// the room through the dome's opening as a spot (the Beam range is its inner and outer cone), its
// fall-off with distance read from the Falloff curve; a ceramic ball on the floor takes the light
// and casts a soft shadow, with a contact occlusion where it sits. Haze in-scatters analytically
// (the closed-form integral of 1/d² along the view ray). Linear HDR out; the post tone-maps.
//
// u.v[0]  cord anchor, cord length
// u.v[1]  swing φ, aim τ (rad), and how far each travels in a shutter (Argon's 1/34 s)
// u.v[2]  light colour (unit luminance), cos(inner)
// u.v[3]  filament radiance (rgb), cos(outer)
// u.v[4]  shade albedo (linear), bulb radiance
// u.v[5]  spot intensity, haze density, theme tone (0 dark → 1 light), samples
// u.v[6]  bounce light
// u.v[7..14]  the falloff curve, 32 samples over RANGE
//
// Swinging, each sample renders the lamp at its own instant across the shutter (φ and τ moved
// along their arcs) and they're averaged under a raised-cosine window, so the dome, bulb, cord,
// beam, pool and shadow all smear along the swing. At rest every instant is the same: crisp.

const CAM = vec3f(0.0, 0.92, 3.4);
const LOOK = vec3f(0.0, 0.92, 0.0);
const FOCAL = 1.5;
const WALL_Z = -1.0;
const BALL = vec4f(0.66, 0.21, -0.3, 0.21);
const RD = 0.2;
const RIM = -0.045;
const RB = 0.058;
const RANGE = 3.2;

var<private> lampTop: vec3f;
var<private> lampAxis: vec3f;
var<private> lampPos: vec3f;

/** The lamp at `tau` of the way across the shutter (−½…½). */
fn pose(tau: f32) {
  let phi = u.v[1].x + u.v[1].z * tau;
  let a = phi + u.v[1].y + u.v[1].w * tau;
  lampTop = u.v[0].xyz + u.v[0].w * vec3f(sin(phi), -cos(phi), 0.0);
  lampAxis = vec3f(sin(a), -cos(a), 0.0);
  lampPos = lampTop + lampAxis * (RD + 0.06);
}

struct Hit {
  t: f32,
  n: vec3f,
  kind: i32, // 0 floor, 1 wall, 2 ball, 3 dome outside, 4 dome inside, 5 bulb, -1 nothing
}

fn curveAt(x: f32) -> f32 {
  let f = sat(x) * 31.0;
  let i = u32(floor(f));
  let j = min(i + 1u, 31u);
  let a = u.v[7u + i / 4u][i % 4u];
  let b = u.v[7u + j / 4u][j % 4u];
  return max(mix(a, b, fract(f)), 0.0);
}

fn sphere(ro: vec3f, rd: vec3f, c: vec3f, r: f32) -> vec2f {
  let oc = ro - c;
  let b = dot(oc, rd);
  let h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) {
    return vec2f(-1.0);
  }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

fn domeCentre() -> vec3f {
  return lampTop + lampAxis * RD;
}

fn trace(ro: vec3f, rd: vec3f) -> Hit {
  var hit = Hit(1e9, vec3f(0.0, 1.0, 0.0), -1);
  if (rd.y < 0.0) {
    let t = -ro.y / rd.y;
    let p = ro + rd * t;
    if (p.z > WALL_Z && t < hit.t) {
      hit = Hit(t, vec3f(0.0, 1.0, 0.0), 0);
    }
  }
  if (rd.z < 0.0) {
    let t = (WALL_Z - ro.z) / rd.z;
    let p = ro + rd * t;
    if (p.y >= 0.0 && t < hit.t) {
      hit = Hit(t, vec3f(0.0, 0.0, 1.0), 1);
    }
  }
  let tb = sphere(ro, rd, BALL.xyz, BALL.w);
  if (tb.x > 0.0 && tb.x < hit.t) {
    hit = Hit(tb.x, normalize(ro + rd * tb.x - BALL.xyz), 2);
  }
  let axis = lampAxis;
  let cs = domeCentre();
  let td = sphere(ro, rd, cs, RD);
  if (td.y > 0.0) {
    let p1 = ro + rd * td.x;
    let p2 = ro + rd * td.y;
    if (td.x > 0.0 && dot(p1 - cs, -axis) >= RIM && td.x < hit.t) {
      hit = Hit(td.x, normalize(p1 - cs), 3);
    } else if (dot(p2 - cs, -axis) >= RIM && td.y < hit.t) {
      hit = Hit(td.y, -normalize(p2 - cs), 4);
    }
  }
  let tl = sphere(ro, rd, lampPos, RB);
  if (tl.x > 0.0 && tl.x < hit.t) {
    hit = Hit(tl.x, normalize(ro + rd * tl.x - lampPos), 5);
  }
  return hit;
}

// Inigo Quilez's analytic soft shadow and occlusion of a sphere.
fn ballShadow(ro: vec3f, rd: vec3f, dist: f32) -> f32 {
  let oc = ro - BALL.xyz;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - BALL.w * BALL.w;
  let h = b * b - c;
  let d = sqrt(max(0.0, BALL.w * BALL.w - h)) - BALL.w;
  let t = -b - sqrt(max(h, 0.0));
  if (t < 0.0 || t > dist) {
    return 1.0;
  }
  return smoothstep(0.0, 1.0, 2.2 * d / t);
}
fn ballOcclusion(p: vec3f, n: vec3f) -> f32 {
  let r = BALL.xyz - p;
  let l = length(r);
  return sat(dot(n, r) * BALL.w * BALL.w / (l * l * l));
}

fn cone(dir: vec3f) -> f32 {
  return smoothstep(u.v[3].w, u.v[2].w, dot(dir, lampAxis));
}

/** Light from the bulb arriving at p (irradiance colour) and its direction. */
fn direct(p: vec3f, n: vec3f) -> vec4f {
  let L = lampPos - p;
  let d = length(L);
  let l = L / d;
  let e = u.v[5].x * curveAt(d / RANGE) * cone(-l) * max(dot(n, l), 0.0) * ballShadow(p + n * 0.002, l, d);
  return vec4f(l, e);
}

fn ggxSpec(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l);
  let nh = max(dot(n, h), 0.0);
  let a2 = rough * rough * rough * rough;
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  let f = 0.04 + 0.96 * pow(1.0 - max(dot(h, v), 0.0), 5.0);
  return a2 / (PI * dd * dd) * f / (4.0 * max(dot(n, v), 0.15));
}

fn shade(ro: vec3f, rd: vec3f, hit: Hit) -> vec3f {
  let tone = u.v[5].z;
  let lc = u.v[2].rgb;
  let amb = mix(0.006, 0.3, tone) + u.v[6].x;
  let fill = mix(0.02, 0.18, tone);
  let p = ro + rd * hit.t;
  let n = hit.n;
  let v = -rd;
  if (hit.kind == 5) {
    // Frosted glass, brighter where it faces you, with the filament a soft hot line inside.
    let lp = lampPos;
    let axis = lampAxis;
    let side = normalize(vec3f(-axis.y, axis.x, 0.0));
    let a = lp - side * 0.022;
    let ba = side * 0.044;
    let w0 = ro - a;
    let bb = dot(ba, ba);
    let rb = dot(rd, ba);
    let s = clamp((dot(ba, w0) - rb * dot(rd, w0)) / max(bb - rb * rb, 1e-6), 0.0, 1.0);
    let q = a + ba * s;
    let tq = dot(q - ro, rd);
    let dq = length(ro + rd * tq - q);
    let filament = u.v[3].rgb * exp(-dq * dq / (0.011 * 0.011));
    return lc * u.v[4].w * (0.62 + 0.38 * max(dot(n, v), 0.0)) + filament + vec3f(0.02);
  }
  if (hit.kind == 4) {
    // The dome's white enamel inside, lit hard by the bulb an inch away.
    let L = lampPos - p;
    let d2 = max(dot(L, L), 0.004);
    let inner = mix(vec3f(0.86), u.v[4].rgb, 0.25);
    let e = max(dot(n, normalize(L)), 0.0) / d2;
    return inner * (lc * u.v[5].x * 0.035 + u.v[3].rgb * 0.004) * e + inner * amb * 0.4;
  }
  var albedo = vec3f(0.0);
  var rough = 0.6;
  var specK = 0.0;
  if (hit.kind == 0) {
    albedo = mix(vec3f(0.36, 0.34, 0.32), vec3f(0.66, 0.64, 0.61), tone);
    rough = 0.32;
    specK = 0.6;
  } else if (hit.kind == 1) {
    albedo = mix(vec3f(0.44, 0.43, 0.42), vec3f(0.8, 0.79, 0.77), tone);
    rough = 0.85;
    specK = 0.1;
  } else if (hit.kind == 2) {
    albedo = vec3f(0.78, 0.74, 0.68);
    rough = 0.22;
    specK = 1.0;
  } else {
    albedo = u.v[4].rgb;
    rough = 0.35;
    specK = 0.8;
  }
  // Occlusion: the ball's, and where floor meets wall.
  var ao = 1.0 - 0.9 * ballOcclusion(p, n);
  if (hit.kind == 0) {
    ao *= 1.0 - 0.38 * exp(-(p.z - WALL_Z) * 6.0);
  } else if (hit.kind == 1) {
    ao *= 1.0 - 0.38 * exp(-p.y * 6.0);
  }
  var col = albedo * amb * ao * (0.82 + 0.18 * n.y);
  col += albedo * fill * (0.35 + 0.65 * max(dot(n, v), 0.0)) * ao;
  if (hit.kind != 3) {
    let dl = direct(p, n);
    col += (albedo / PI + specK * ggxSpec(n, v, dl.xyz, rough)) * lc * dl.w;
  } else {
    // The enamel outside: a soft neutral key from the room (a window off to the left) so its
    // own hue reads under the warm bulb, a glossy streak of that window, and a sheen in its rim.
    let key = normalize(vec3f(-0.6, 0.55, 0.6));
    let env = mix(0.16, 0.42, tone);
    col += albedo * env * (0.25 + 0.75 * max(dot(n, key), 0.0));
    col += vec3f(env * 0.7 * ggxSpec(n, v, key, 0.28));
    let fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    col += vec3f(fr * (amb + env * 0.5));
  }
  return col;
}

/** The light the haze scatters towards you between the eye and `tMax`. */
fn haze(ro: vec3f, rd: vec3f, tMax: f32) -> vec3f {
  let lp = lampPos;
  let tc = dot(lp - ro, rd);
  let closest = ro + rd * tc;
  let h = max(length(closest - lp), 0.025);
  let along = (atan((tMax - tc) / h) - atan(-tc / h)) / h;
  let dir = normalize(closest - lp + rd * 0.02);
  return u.v[2].rgb * u.v[5].x * u.v[5].y * along * cone(dir) * (1.4 / (4.0 * PI));
}

/** The cord: its coverage of this ray and how far along it. */
fn cord(ro: vec3f, rd: vec3f) -> vec2f {
  let a = u.v[0].xyz;
  let ba = lampTop - a;
  let w0 = ro - a;
  let bb = dot(ba, ba);
  let rb = dot(rd, ba);
  let s = clamp((dot(ba, w0) - rb * dot(rd, w0)) / max(bb - rb * rb, 1e-6), 0.0, 1.0);
  let q = a + ba * s;
  let t = dot(q - ro, rd);
  let d = length(ro + rd * t - q);
  let foot = t / (FOCAL * u.frame.y);
  return vec2f(sat((0.0065 - d) / foot + 0.5), t);
}

fn render(px: vec2f) -> vec3f {
  let res = u.frame.xy;
  let uv = (px - 0.5 * res) / res.y * vec2f(1.0, -1.0);
  let fwd = normalize(LOOK - CAM);
  let right = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, fwd);
  let rd = normalize(uv.x * right + uv.y * up + FOCAL * fwd);
  let hit = trace(CAM, rd);
  var col = vec3f(0.0);
  var tMax = 30.0;
  if (hit.kind >= 0) {
    col = shade(CAM, rd, hit);
    tMax = hit.t;
  }
  col += haze(CAM, rd, tMax);
  let c = cord(CAM, rd);
  if (c.y < tMax) {
    let tone = u.v[5].z;
    col = mix(col, vec3f(mix(0.012, 0.09, tone)), c.x);
  }
  return col;
}

fn scene(px: vec2f) -> vec3f {
  let n = max(i32(u.v[5].w), 1);
  let moving = abs(u.v[1].z) + abs(u.v[1].w) > 0.0;
  let j = hash12(px);
  var c = vec3f(0.0);
  var ws = 0.0;
  for (var i = 0; i < n; i++) {
    let fi = f32(i);
    // Sub-pixel offsets on a golden-angle spiral; instants stratified across the shutter.
    let ang = fi * 2.39996 + j * 6.2831853;
    let off = vec2f(cos(ang), sin(ang)) * sqrt((fi + 0.5) / f32(n)) * 0.5;
    var tau = 0.0;
    var w = 1.0;
    if (moving) {
      tau = (fi + 0.5 + (hash12(px.yx + fi) - 0.5) * 0.6) / f32(n) - 0.5;
      w = 0.64 + 0.36 * cos(tau * 6.2831853);
    }
    pose(tau);
    c += w * render(px + off);
    ws += w;
  }
  return c / ws;
}
