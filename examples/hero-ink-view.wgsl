// The ink hero's picture: the dye as light in the dark. Each channel saturates on its own
// (1 − e^−kx), so colours mix richly and only the densest cores go white-hot; a height from the
// density gives a normal, lit from the upper left, so the thick ink has a wet sheen. The whole of
// it fades to exactly the page at the box's edges and away from the composition. Linear HDR into
// the bloom and tone pass (controls-post.wgsl).

struct View {
  size: vec4f,  // device px w, h, then the dye texel (uv)
  page: vec4f,  // the page colour (linear), w: the edge fade (device px)
  look: vec4f,  // x: gain, y: gloss, z: white-hot cores, w: brightness
  pool: vec4f,  // the composition's centre and its reach across and down (device px)
}

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dye: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

fn ink(uv: vec2f) -> vec3f {
  return textureSampleLevel(dye, samp, uv, 0.0).rgb;
}
fn lit(c: vec3f) -> vec3f {
  return 1.0 - exp(-c * V.look.x);
}
fn height(c: vec3f) -> f32 {
  return dot(lit(c), vec3f(0.3, 0.5, 0.2));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = fc.xy;
  let uv = px / V.size.xy;
  let t = V.size.zw * 1.25;
  let d = ink(uv);
  let l = ink(uv - vec2f(t.x, 0.0));
  let r = ink(uv + vec2f(t.x, 0.0));
  let u = ink(uv - vec2f(0.0, t.y));
  let b = ink(uv + vec2f(0.0, t.y));
  // A touch of the neighbours: the upscale reads as smooth liquid, not texels.
  let soft = d * 0.6 + (l + r + u + b) * 0.1;
  var c = lit(soft);
  let h = dot(c, vec3f(0.3, 0.5, 0.2));
  // Where inks overlap they'd wash to grey; a little more chroma keeps the mix rich.
  c = max(mix(vec3f(h), c, 1.3), vec3f(0.0));
  // Thin veils fall away faster than the ink itself: defined wisps on the dark.
  c *= smoothstep(0.0, 0.13, h);
  // White-hot where it's thickest.
  let core = smoothstep(0.55, 1.0, h) * V.look.z;
  c = c * (1.0 + 2.2 * core) + vec3f(core * core * 0.9);
  // The sheen: a normal from the height, a light from the upper left and the viewer above.
  let g = vec2f(height(r) - height(l), height(b) - height(u));
  let n = normalize(vec3f(-g * 7.0, 1.0));
  let light = normalize(vec3f(-0.55, -0.7, 0.75));
  let half = normalize(light + vec3f(0.0, 0.0, 1.0));
  let spec = pow(max(dot(n, half), 0.0), 48.0) * smoothstep(0.08, 0.5, h);
  let rim = 0.82 + 0.3 * dot(n, light);
  c *= mix(1.0, rim, V.look.y);
  let sheen = mix(vec3f(1.0), c / max(h, 0.05) * 0.5 + 0.5, 0.35) * spec * V.look.y * 1.4;
  var o = c * V.look.w + sheen;
  // Away from the composition and towards the box's edges it goes, to exactly the page.
  let q = (px - V.pool.xy) / V.pool.zw;
  let pool = 1.0 - smoothstep(0.7, 1.25, length(q));
  let e = V.page.w;
  let m = smoothstep(vec2f(0.0), vec2f(e), px) * smoothstep(vec2f(0.0), vec2f(e), V.size.xy - px);
  let fade = pool * m.x * m.y;
  return vec4f(V.page.rgb + o * fade, 1.0);
}
