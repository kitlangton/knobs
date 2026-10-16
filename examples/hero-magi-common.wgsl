// MAGI's shared block: the swarm's parameters and the display's layout, written once a frame.
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
  scr3: vec4f, // the panel's left edge (px), rows, the hovered or held row (-1 none), power (0–1)
  pal0: vec4f, // signal: the display's main colour (linear), its brightness
  pal1: vec4f, // the second colour (linear)
  pal2: vec4f, // the alert colour (linear)
  page: vec4f, // the page (linear)
  rows: array<vec4f, 8>, // each row: its y (px), its value (0–1), its glow, 0
}

const NEAR = 192u;
const FAR = 48u;
const SPAN = 1.1;
const TRACKS = 6u;
const CANDS = 32u;
const HIST = 256u;
const PREDS = 8u;
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
/** World to the near and far fields' uv. */
fn fieldUv(p: vec2f) -> vec2f {
  return (p + SPAN) / (2.0 * SPAN);
}
