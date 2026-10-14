import { DIE, DIE_LIFT, DIE_PERSPECTIVE, FACES, PIPS } from "../die.js"

// Ray-traces the same six faces the DOM folds into a CSS 3D cube: the eye sits `perspective` px in
// front of the icon plane, the front face rests in that plane, faces facing away are culled (a cube
// is convex, so the rest never overlap). Face coordinates are Phosphor icon units; antialiasing comes
// from the face-space size of a pixel, found by tracing two neighbours (no derivatives needed).

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n))
const rad = (deg: number) => f(+((deg * Math.PI) / 180).toFixed(6))

const pipBranches = FACES.map(({ value }, i) => {
  const d = PIPS[value]!.map(([x, y]) => `length(uv - vec2f(${f(x)}, ${f(y)}))`)
  const body = d.reduce((acc, e) => `min(${acc}, ${e})`)
  return `  if (face == ${i}u) { return ${body} - ${f(DIE.pip)}; }`
}).join("\n")

const faceRot = FACES.map(({ face }) => `vec2f(${rad(face[0])}, ${rad(face[1])})`).join(", ")

export const DIE_WGSL = /* wgsl */ `
const DIE_FACE_ROT = array<vec2f, 6>(${faceRot});
const DIE_LIGHT = vec3f(-0.4818, -0.6424, 0.5961);

// CSS rotateX(a.x) rotateY(a.y) on a vector (y down, z towards the viewer).
fn die_rot(v: vec3f, a: vec2f) -> vec3f {
  let cy = cos(a.y); let sy = sin(a.y);
  let x1 = v.x * cy + v.z * sy;
  let z1 = -v.x * sy + v.z * cy;
  let cx = cos(a.x); let sx = sin(a.x);
  return vec3f(x1, v.y * cx - z1 * sx, v.y * sx + z1 * cx);
}

fn die_round_rect(p: vec2f, half: f32, r: f32) -> f32 {
  let q = abs(p) - vec2f(half - r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn die_pips(face: u32, uv: vec2f) -> f32 {
${pipBranches}
  return 1e9;
}

// Face-space (icon units) point where the ray through pixel offset p meets the face plane.
fn die_uv(p: vec2f, q: vec3f, n: vec3f, xa: vec3f, ya: vec3f, eye: f32, unit: f32) -> vec2f {
  let e = vec3f(0.0, 0.0, eye);
  let d = vec3f(p, -eye);
  let t = dot(n, q - e) / dot(n, d);
  if (t <= 0.0) { return vec2f(1e4); } // the plane is behind the eye along this ray
  let h = e + t * d - q;
  return vec2f(dot(h, xa), dot(h, ya)) / unit;
}

// p: offset from the die centre in px (y down); size: icon box in px; rot: cube rotation (radians);
// energy: spin 0…1. Returns (outline + pip coverage, fill alpha).
fn die_coverage(p: vec2f, size: f32, rot: vec2f, energy: f32) -> vec2f {
  let unit = size / 256.0;
  let half = ${f(DIE.half)} * unit;
  let eye = size * ${f(DIE_PERSPECTIVE)};
  let centre = vec3f(0.0, 0.0, size * ${f(DIE_LIFT)} * energy - half);
  var line = 0.0;
  var fill = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let n = die_rot(die_rot(vec3f(0.0, 0.0, 1.0), DIE_FACE_ROT[i]), rot);
    let q = centre + n * half;
    let facing = dot(n, normalize(vec3f(0.0, 0.0, eye) - q));
    if (facing <= 0.0) { continue; }
    // Nearly edge-on a face covers under a pixel; fading it avoids a smeared antialiasing streak.
    let edgeOn = smoothstep(0.0, 0.06, facing);
    let xa = die_rot(die_rot(vec3f(1.0, 0.0, 0.0), DIE_FACE_ROT[i]), rot);
    let ya = die_rot(die_rot(vec3f(0.0, 1.0, 0.0), DIE_FACE_ROT[i]), rot);
    let uv = die_uv(p, q, n, xa, ya, eye, unit);
    let w = max(
      length(die_uv(p + vec2f(1.0, 0.0), q, n, xa, ya, eye, unit) - uv),
      length(die_uv(p + vec2f(0.0, 1.0), q, n, xa, ya, eye, unit) - uv),
    );
    let outline = abs(die_round_rect(uv, ${f(DIE.half - DIE.stroke / 2)}, ${f(DIE.radius - DIE.stroke / 2)})) - ${f(DIE.stroke / 2)};
    let ink = min(outline, die_pips(i, uv));
    line += clamp(0.5 - ink / w, 0.0, 1.0) * edgeOn;
    let inside = clamp(0.5 - die_round_rect(uv, ${f(DIE.half)}, ${f(DIE.radius)}) / w, 0.0, 1.0);
    fill += inside * edgeOn * energy * (0.1 + 0.22 * max(0.0, dot(n, DIE_LIGHT)));
  }
  return vec2f(min(line, 1.0), min(fill, 1.0));
}
`
