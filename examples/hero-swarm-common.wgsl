// The swarm's shared block: its parameters and the display's layout, written once a frame.
// World: the containment disc has radius 1 at the origin, y down (as the screen). Screen lengths
// are CSS px unless named otherwise.
struct Params {
  sim0: vec4f, // cohesion, alignment, separation, speed (0–1 each)
  sim1: vec4f, // predators (count), containment radius (world), dt (s), time (s)
  sim2: vec4f, // lure (world xy), lure strength, pull (the pointer held, 0–1)
  sim3: vec4f, // agents, frame, mean near density, mean far density
  scr0: vec4f, // canvas (device px), dpr, the trail's decay this frame
  scr1: vec4f, // the ring's centre (px), its radius R (px), the arrival (0–1)
  scr2: vec4f, // the instrument column: left, top, width, height (px; width 0: none)
  scr3: vec4f, // the panel's left edge (px), rows, 0, 0
  // The scheme (linear colours):
  pal0: vec4f, // the frame: rings, bezel, wires, brackets acquiring; its brightness
  pal1: vec4f, // the swarm cruising, the gauges and the radar; the agents' gain
  pal2: vec4f, // the alert: predators and the fear they spread; 0
  pal3: vec4f, // the swarm at speed; the bloom's mix (for the post pass)
  pal4: vec4f, // the hex lattice's tint; how much the trail reads as heat (0–1)
  page: vec4f, // the page (linear)
  rows: array<vec4f, 8>, // each row: its y (px), its value (0–1), its glow, what its wire lands on
}

const NEAR = 192u;
const FAR = 48u;
const SPAN = 1.1;
const TRACKS = 6u;
const CANDS = 32u;
const HIST = 256u;
const PREDS = 8u;
/**
 * After the history and the latest statistics: three wire ends that move (Cohesion's,
 * Separation's and Predators'), two vec4s each: (px, glide 0–1, target id), (px it left from).
 */
const ANCH = HIST + 2u;
const ANCHORS = 3u;
/** Half the span of the order and pace arcs (rad). */
const ARC = 0.44;
const TAU = 6.28318531;
const PI = 3.14159265;

fn sat(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}
fn hash11(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}
/** The speed the swarm cruises at (world/s). */
fn cruise(p: Params) -> f32 {
  return mix(0.08, 0.5, p.sim0.w);
}
/** A cluster's bracket: half its side (px), closing in on the cluster as the lock completes. */
fn bracketSize(tp: vec4f) -> f32 {
  let lock = tp.w * tp.w * (3.0 - 2.0 * tp.w);
  return mix(54.0, 9.0 + sqrt(tp.z) * 1.15, lock);
}
/** Where predator i waits off duty: just inside the ring's edge. */
fn parked(i: u32, rc: f32) -> vec2f {
  let a = f32(i) * 2.39996 + 0.6;
  return vec2f(cos(a), sin(a)) * rc * 0.92;
}
/** World to the near and far fields' uv. */
fn fieldUv(p: vec2f) -> vec2f {
  return (p + SPAN) / (2.0 * SPAN);
}
