// The night street's contents: unit meshes, the objects the outliner lists (by their labels) built
// from parts, the shadow spheres each casts, and a ray pick against their bounds.
// Coordinates: metres, y up; the road runs along x, the far sidewalk and the facade lie toward −z.

export type Vec3 = [number, number, number]
export type MeshKind = "cone" | "cylinder" | "sphere" | "box"
export const MESHES: readonly MeshKind[] = ["cone", "cylinder", "sphere", "box"]

export interface Mesh {
  vertices: Float32Array<ArrayBuffer> // position xyz, normal xyz
  indices: Uint16Array<ArrayBuffer>
  ranges: Record<MeshKind, { first: number; count: number }>
}

export function buildMeshes(): Mesh {
  const v: number[] = []
  const idx: number[] = []
  const ranges = {} as Mesh["ranges"]
  const vert = (p: Vec3, n: Vec3) => {
    v.push(...p, ...n)
    return v.length / 6 - 1
  }
  const begin = (kind: MeshKind) => ({ kind, first: idx.length })
  const end = (r: { kind: MeshKind; first: number }) => {
    ranges[r.kind] = { first: r.first, count: idx.length - r.first }
  }
  // A ring-swept surface: radius and height pairs, smooth normals along the profile.
  const lathe = (profile: [number, number][], seg: number) => {
    const base = v.length / 6
    for (let i = 0; i < profile.length; i++) {
      const [r, y] = profile[i]!
      const prev = profile[Math.max(0, i - 1)]!
      const next = profile[Math.min(profile.length - 1, i + 1)]!
      const dr = next[0] - prev[0]
      const dy = next[1] - prev[1]
      const len = Math.hypot(dr, dy) || 1
      const [nr, ny] = [dy / len, -dr / len]
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2
        const [c, si] = [Math.cos(a), Math.sin(a)]
        vert([r * c, y, r * si], [nr * c, ny, nr * si])
      }
    }
    for (let i = 0; i < profile.length - 1; i++)
      for (let s = 0; s < seg; s++) {
        const a = base + i * (seg + 1) + s
        const b = a + seg + 1
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
  }
  const disc = (y: number, r: number, up: boolean, seg: number) => {
    const c = vert([0, y, 0], [0, up ? 1 : -1, 0])
    const base = v.length / 6
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      vert([r * Math.cos(a), y, r * Math.sin(a)], [0, up ? 1 : -1, 0])
    }
    for (let s = 0; s < seg; s++)
      up ? idx.push(c, base + s + 1, base + s) : idx.push(c, base + s, base + s + 1)
  }
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) => {
    const i = [vert(a, n), vert(b, n), vert(c, n), vert(d, n)]
    idx.push(i[0]!, i[1]!, i[2]!, i[0]!, i[2]!, i[3]!)
  }
  const boxFaces = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0])
    quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0])
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0])
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0])
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1])
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1])
  }

  // A traffic cone, in metres: a square foot and a tapered body.
  let r = begin("cone")
  boxFaces(-0.19, 0, -0.19, 0.19, 0.03, 0.19)
  lathe(
    [
      [0.17, 0.03],
      [0.03, 0.7],
      [0.0, 0.705],
    ],
    28,
  )
  end(r)
  // Unit cylinder: radius 0.5, y −0.5…0.5, capped.
  r = begin("cylinder")
  lathe(
    [
      [0.5, -0.5],
      [0.5, 0.5],
    ],
    28,
  )
  disc(0.5, 0.5, true, 28)
  disc(-0.5, 0.5, false, 28)
  end(r)
  // Unit sphere: radius 0.5.
  r = begin("sphere")
  lathe(
    Array.from({ length: 15 }, (_, i) => {
      const a = (i / 14) * Math.PI
      return [Math.sin(a) * 0.5, -Math.cos(a) * 0.5] as [number, number]
    }),
    24,
  )
  end(r)
  // Unit box: −0.5…0.5.
  r = begin("box")
  boxFaces(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5)
  end(r)
  return { vertices: new Float32Array(v), indices: new Uint16Array(idx), ranges }
}

export interface PartDef {
  mesh: MeshKind
  pos: Vec3
  scale: Vec3
  /** Euler angles (radians), applied y, then x, then z. */
  rot?: Vec3
  color: Vec3
  rough: number
  metal?: number
  pattern?: number
  emit?: Vec3
  emitStrength?: number
}
export interface ObjectDef {
  key: string
  /** Where the object stands and which way it faces; its parts are relative to that. */
  at: Vec3
  yaw?: number
  parts: PartDef[]
  /** Shadow and occlusion spheres, relative: x, y, z, radius. */
  occluders?: [number, number, number, number][]
  /** The light it carries, by slot. */
  light?: number
  /** It can be copied (a duplicate stands beside it). */
  copyable?: boolean
}

export const P = {
  plain: 0,
  cone: 1,
  barrier: 2,
  facade: 3,
  asphalt: 4,
  window: 5,
  tank: 6,
  paint: 7,
  lampHead: 8,
  lantern: 9,
  sidewalk: 10,
  skyline: 11,
  glass: 12,
}
const lin = (hex: number): Vec3 => {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((x) => {
    const s = x / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return c as Vec3
}
export const SODIUM: Vec3 = [1, 0.5, 0.16]
const LANTERN: Vec3 = [1, 0.58, 0.26]
const WINDOW: Vec3 = [1, 0.6, 0.3]

const metal = lin(0x2a2f2c)
const cone = (n: number, at: Vec3, yaw: number): ObjectDef => ({
  key: `Cone #${n}`,
  at,
  yaw,
  copyable: true,
  parts: [
    {
      mesh: "cone",
      pos: [0, 0, 0],
      scale: [1, 1, 1],
      color: lin(0xe8501a),
      rough: 0.55,
      pattern: P.cone,
    },
  ],
  occluders: [
    [0, 0.2, 0, 0.15],
    [0, 0.45, 0, 0.08],
  ],
})
const person = (key: string, at: Vec3, yaw: number, coat: number, tall: number): ObjectDef => ({
  key,
  at,
  yaw,
  copyable: true,
  parts: [
    {
      mesh: "cylinder",
      pos: [0, 0.44 * tall, 0],
      scale: [0.3, 0.88 * tall, 0.22],
      color: lin(0x1b1d22),
      rough: 0.85,
    },
    {
      mesh: "cylinder",
      pos: [0, 1.18 * tall, 0],
      scale: [0.44, 0.62 * tall, 0.27],
      color: lin(coat),
      rough: 0.7,
    },
    {
      mesh: "sphere",
      pos: [0, 1.5 * tall, 0],
      scale: [0.44, 0.2, 0.27],
      color: lin(coat),
      rough: 0.7,
    },
    {
      mesh: "sphere",
      pos: [0, 1.7 * tall, 0.01],
      scale: [0.21, 0.26, 0.23],
      color: lin(0x6b4a3a),
      rough: 0.6,
    },
  ],
  occluders: [
    [0, 0.55 * tall, 0, 0.19],
    [0, 1.25 * tall, 0, 0.25],
  ],
})

/** Everything in the street. The first entry is the set (ground, sidewalk, facades), never listed. */
export const WORLD: ObjectDef[] = [
  {
    key: "static",
    at: [0, 0, 0],
    parts: [
      {
        mesh: "box",
        pos: [0, 0.075, -4.75],
        scale: [90, 0.15, 3.5],
        color: lin(0x5a5752),
        rough: 0.8,
        pattern: P.sidewalk,
      },
      {
        mesh: "box",
        pos: [0, 3.5, -7.0],
        scale: [40, 7, 1],
        color: lin(0x6b4f40),
        rough: 0.9,
        pattern: P.facade,
      },
      {
        mesh: "box",
        pos: [0, 7.1, -6.95],
        scale: [40, 0.3, 1.2],
        color: lin(0x2a2522),
        rough: 0.8,
      },
      {
        mesh: "box",
        pos: [-2.6, 1.25, -6.47],
        scale: [1.1, 2.2, 0.1],
        color: lin(0x2a1a12),
        rough: 0.6,
      },
      {
        mesh: "box",
        pos: [-2.6, 2.42, -6.3],
        scale: [1.6, 0.08, 0.5],
        color: lin(0x222222),
        rough: 0.6,
      },
      {
        mesh: "box",
        pos: [-2.6, 0.22, -6.2],
        scale: [1.6, 0.14, 0.6],
        color: lin(0x5a5752),
        rough: 0.85,
      },
      {
        mesh: "box",
        pos: [3.6, 0.95, -6.4],
        scale: [1.9, 0.1, 0.2],
        color: lin(0x777065),
        rough: 0.7,
      },
      {
        mesh: "box",
        pos: [-13, 5.5, -17],
        scale: [9, 11, 6],
        color: lin(0x30302f),
        rough: 0.9,
        pattern: P.skyline,
      },
      {
        mesh: "box",
        pos: [3, 7, -24],
        scale: [11, 14, 6],
        color: lin(0x2b2c30),
        rough: 0.9,
        pattern: P.skyline,
      },
      {
        mesh: "box",
        pos: [16, 4.75, -16],
        scale: [9, 9.5, 6],
        color: lin(0x34302c),
        rough: 0.9,
        pattern: P.skyline,
      },
      {
        mesh: "box",
        pos: [-27, 6.5, -24],
        scale: [12, 13, 6],
        color: lin(0x2b2b2b),
        rough: 0.9,
        pattern: P.skyline,
      },
      {
        mesh: "box",
        pos: [29, 6, -27],
        scale: [14, 12, 6],
        color: lin(0x2b2b2b),
        rough: 0.9,
        pattern: P.skyline,
      },
      {
        mesh: "box",
        pos: [0, -0.05, 0],
        scale: [120, 0.1, 90],
        color: lin(0x111111),
        rough: 0.75,
        pattern: P.asphalt,
      },
    ],
    occluders: [],
  },
  {
    key: "2100K Sodium streetlamp",
    at: [1.6, 0, -3.35],
    light: 0,
    parts: [
      {
        mesh: "cylinder",
        pos: [0, 0.3, 0],
        scale: [0.26, 0.6, 0.26],
        color: metal,
        rough: 0.5,
        metal: 0.4,
      },
      {
        mesh: "cylinder",
        pos: [0, 2.9, 0],
        scale: [0.12, 5.8, 0.12],
        color: metal,
        rough: 0.45,
        metal: 0.5,
      },
      {
        mesh: "box",
        pos: [0, 5.72, 0.7],
        scale: [0.08, 0.08, 1.45],
        color: metal,
        rough: 0.45,
        metal: 0.5,
      },
      {
        mesh: "box",
        pos: [0, 5.64, 1.4],
        scale: [0.36, 0.14, 0.72],
        color: metal,
        rough: 0.4,
        metal: 0.5,
        pattern: P.lampHead,
        emit: SODIUM,
        emitStrength: 40,
      },
    ],
    // A thin pole's sphere shadows read as blobs, so it casts none.
    occluders: [],
  },
  {
    key: "Porch post lantern",
    at: [-3.7, 0.15, -5.9],
    light: 1,
    parts: [
      {
        mesh: "cylinder",
        pos: [0, 0.9, 0],
        scale: [0.08, 1.8, 0.08],
        color: lin(0x1a1a1a),
        rough: 0.5,
        metal: 0.6,
      },
      {
        mesh: "box",
        pos: [0, 1.98, 0],
        scale: [0.24, 0.34, 0.24],
        color: lin(0x1a1a1a),
        rough: 0.4,
        metal: 0.6,
        pattern: P.lantern,
        emit: LANTERN,
        emitStrength: 14,
      },
      {
        mesh: "box",
        pos: [0, 2.19, 0],
        scale: [0.3, 0.05, 0.3],
        color: lin(0x1a1a1a),
        rough: 0.4,
        metal: 0.6,
      },
    ],
    occluders: [[0, 0.8, 0, 0.06]],
  },
  {
    key: "Window glow",
    at: [3.6, 1.75, -6.46],
    light: 2,
    parts: [
      {
        mesh: "box",
        pos: [0, 0, 0],
        scale: [1.7, 1.5, 0.06],
        color: lin(0x222222),
        rough: 0.1,
        pattern: P.window,
        emit: WINDOW,
        emitStrength: 5,
      },
    ],
  },
  cone(91, [-2.6, 0, 2.6], 0.3),
  cone(92, [-1.3, 0, 2.05], 1.1),
  cone(93, [0.0, 0, 1.55], 0.2),
  cone(94, [1.25, 0, 1.05], 0.9),
  cone(95, [2.5, 0, 0.6], 0.5),
  {
    key: "Propane tank #96",
    at: [-5.3, 0.15, -5.5],
    copyable: true,
    parts: [
      {
        mesh: "cylinder",
        pos: [0, 0.62, 0],
        scale: [0.62, 0.9, 0.62],
        color: lin(0xd8d6cf),
        rough: 0.45,
        pattern: P.tank,
      },
      {
        mesh: "sphere",
        pos: [0, 1.07, 0],
        scale: [0.62, 0.42, 0.62],
        color: lin(0xd8d6cf),
        rough: 0.45,
      },
      {
        mesh: "sphere",
        pos: [0, 0.17, 0],
        scale: [0.62, 0.34, 0.62],
        color: lin(0xd8d6cf),
        rough: 0.45,
      },
      {
        mesh: "cylinder",
        pos: [0, 1.36, 0],
        scale: [0.3, 0.14, 0.3],
        color: lin(0x8a8a86),
        rough: 0.35,
        metal: 0.8,
      },
      {
        mesh: "cylinder",
        pos: [0, 0.05, 0],
        scale: [0.5, 0.1, 0.5],
        color: lin(0x777770),
        rough: 0.5,
        metal: 0.4,
      },
    ],
    occluders: [
      [0, 0.45, 0, 0.31],
      [0, 0.95, 0, 0.31],
    ],
  },
  {
    key: "Barrier",
    at: [4.3, 0, 1.9],
    yaw: -0.3,
    copyable: true,
    parts: [
      {
        mesh: "box",
        pos: [0, 0.92, 0],
        scale: [2.0, 0.26, 0.06],
        color: lin(0xffffff),
        rough: 0.5,
        pattern: P.barrier,
      },
      {
        mesh: "box",
        pos: [0, 0.52, 0],
        scale: [2.0, 0.22, 0.06],
        color: lin(0xffffff),
        rough: 0.5,
        pattern: P.barrier,
      },
      {
        mesh: "box",
        pos: [-0.92, 0.5, 0.1],
        scale: [0.07, 1.0, 0.07],
        rot: [0.2, 0, 0],
        color: lin(0xb8b4ac),
        rough: 0.6,
      },
      {
        mesh: "box",
        pos: [-0.92, 0.5, -0.1],
        scale: [0.07, 1.0, 0.07],
        rot: [-0.2, 0, 0],
        color: lin(0xb8b4ac),
        rough: 0.6,
      },
      {
        mesh: "box",
        pos: [0.92, 0.5, 0.1],
        scale: [0.07, 1.0, 0.07],
        rot: [0.2, 0, 0],
        color: lin(0xb8b4ac),
        rough: 0.6,
      },
      {
        mesh: "box",
        pos: [0.92, 0.5, -0.1],
        scale: [0.07, 1.0, 0.07],
        rot: [-0.2, 0, 0],
        color: lin(0xb8b4ac),
        rough: 0.6,
      },
    ],
    occluders: [
      [-0.6, 0.75, 0, 0.18],
      [0, 0.75, 0, 0.18],
      [0.6, 0.75, 0, 0.18],
    ],
  },
  {
    key: "Getaway · Muscle",
    at: [-6.2, 0, -1.75],
    yaw: 0,
    copyable: true,
    parts: [
      {
        mesh: "box",
        pos: [0, 0.66, 0],
        scale: [4.7, 0.6, 1.88],
        color: lin(0x5a0c0a),
        rough: 0.3,
        metal: 0.55,
        pattern: P.paint,
      },
      {
        mesh: "box",
        pos: [-0.3, 1.17, 0],
        scale: [2.3, 0.46, 1.62],
        color: lin(0x050506),
        rough: 0.08,
        pattern: P.glass,
      },
      {
        mesh: "box",
        pos: [-0.3, 1.41, 0],
        scale: [2.0, 0.04, 1.5],
        color: lin(0x5a0c0a),
        rough: 0.3,
        metal: 0.55,
        pattern: P.paint,
      },
      ...([-1.5, 1.5] as const).flatMap((x) =>
        ([-0.86, 0.86] as const).map(
          (z): PartDef => ({
            mesh: "cylinder",
            pos: [x, 0.36, z],
            scale: [0.72, 0.26, 0.72],
            rot: [Math.PI / 2, 0, 0],
            color: lin(0x111111),
            rough: 0.75,
          }),
        ),
      ),
      ...([-0.66, 0.66] as const).map(
        (z): PartDef => ({
          mesh: "box",
          pos: [-2.36, 0.78, z],
          scale: [0.04, 0.1, 0.32],
          color: lin(0x200000),
          rough: 0.3,
          emit: [1, 0.04, 0.02],
          emitStrength: 3,
        }),
      ),
      ...([-0.62, 0.62] as const).map(
        (z): PartDef => ({
          mesh: "box",
          pos: [2.36, 0.74, z],
          scale: [0.04, 0.12, 0.3],
          color: lin(0x999999),
          rough: 0.2,
          emit: [1, 0.85, 0.6],
          emitStrength: 1.2,
        }),
      ),
    ],
    occluders: [
      [-1.4, 0.75, 0, 0.8],
      [0, 0.85, 0, 0.85],
      [1.4, 0.7, 0, 0.75],
    ],
  },
  person("Survivor · Ana", [-1.0, 0.15, -4.25], 0.5, 0x2a3a4a, 1),
  person("Survivor · Ben", [-0.25, 0.15, -4.75], -0.3, 0x4a3524, 1.06),
  { key: "Rain sheet", at: [0, 0, 0], parts: [] },
  {
    key: "Gutter drip",
    at: [5.9, 0, -6.36],
    parts: [
      {
        mesh: "cylinder",
        pos: [0, 4.2, 0],
        scale: [0.12, 5.6, 0.12],
        color: lin(0x55575a),
        rough: 0.4,
        metal: 0.7,
      },
      {
        mesh: "box",
        pos: [0, 1.38, 0.06],
        scale: [0.14, 0.08, 0.22],
        color: lin(0x55575a),
        rough: 0.4,
        metal: 0.7,
      },
    ],
  },
  { key: "Steam vent", at: [-1.6, 0, 3.2], parts: [] },
]

/** A part's 3×4 world matrix (rows), its inverse scale² for normals, and its corners' bounds. */
export function partMatrix(obj: { at: Vec3; yaw: number }, part: PartDef) {
  const [rx, ry, rz] = part.rot ?? [0, 0, 0]
  // Local rotation R = Ry · Rx · Rz, then the object's yaw.
  const rot = (x: number, y: number, z: number): Vec3 => {
    let c = Math.cos(rz)
    let s = Math.sin(rz)
    ;[x, y] = [x * c - y * s, x * s + y * c]
    c = Math.cos(rx)
    s = Math.sin(rx)
    ;[y, z] = [y * c - z * s, y * s + z * c]
    c = Math.cos(ry + obj.yaw)
    s = Math.sin(ry + obj.yaw)
    ;[x, z] = [x * c + z * s, -x * s + z * c]
    return [x, y, z]
  }
  const yawOnly = (x: number, z: number): [number, number] => {
    const c = Math.cos(obj.yaw)
    const s = Math.sin(obj.yaw)
    return [x * c + z * s, -x * s + z * c]
  }
  const [px, pz] = yawOnly(part.pos[0], part.pos[2])
  const t: Vec3 = [obj.at[0] + px, obj.at[1] + part.pos[1], obj.at[2] + pz]
  const ax = rot(part.scale[0], 0, 0)
  const ay = rot(0, part.scale[1], 0)
  const az = rot(0, 0, part.scale[2])
  const rows = [
    [ax[0], ay[0], az[0], t[0]],
    [ax[1], ay[1], az[1], t[1]],
    [ax[2], ay[2], az[2], t[2]],
  ]
  const inv: Vec3 = part.scale.map((s) => 1 / (s * s)) as Vec3
  // Bounds from the unit cube's corners (the cone mesh is real-sized and fits it, near enough).
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const span = part.mesh === "cone" ? [0.4, 0.71, 0.4] : [1, 1, 1]
  const lo = part.mesh === "cone" ? [-0.5, 0, -0.5] : [-0.5, -0.5, -0.5]
  for (let i = 0; i < 8; i++) {
    const c = [lo[0]! + (i & 1) * 1, lo[1]! + ((i >> 1) & 1) * 1, lo[2]! + ((i >> 2) & 1) * 1]
    const p = [0, 1, 2].map(
      (r) =>
        rows[r]![0]! * c[0]! * span[0]! +
        rows[r]![1]! * c[1]! * span[1]! +
        rows[r]![2]! * c[2]! * span[2]! +
        rows[r]![3]!,
    )
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!)
      max[k] = Math.max(max[k]!, p[k]!)
    }
  }
  return { rows, inv, min, max }
}

/** The nearest box a ray enters, of those given (index), or −1. */
export function pick(
  origin: Vec3,
  dir: Vec3,
  boxes: readonly { min: Vec3; max: Vec3 }[],
): { index: number; t: number } {
  let best = { index: -1, t: Infinity }
  boxes.forEach((b, i) => {
    let t0 = 0
    let t1 = Infinity
    for (let k = 0; k < 3; k++) {
      const inv = 1 / (dir[k] || 1e-9)
      let a = (b.min[k]! - origin[k]!) * inv
      let c = (b.max[k]! - origin[k]!) * inv
      if (a > c) [a, c] = [c, a]
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, c)
    }
    if (t0 <= t1 && t0 < best.t) best = { index: i, t: t0 }
  })
  return best
}
