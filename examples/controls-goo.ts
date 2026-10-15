// Metaballs for the Sliders preview: a WebGL fragment shader that draws up to eight dots as one
// signed-distance field, unioned with a polynomial smooth-min, so a dot leaving its neighbour
// stretches out of it, necks and pinches off (and flows back in reverse).
//
// Motion blur is a true shutter integral over coverage: across a 180° shutter window τ ∈ [-0.5, 0.5]
// each dot travels along its own velocity vector (and radial velocity), the smooth-min union and
// anti-aliased threshold are evaluated at each stratified shutter instant, and the thresholded
// coverages are integrated with a raised-cosine shutter window. Blurring coverage rather than the
// pre-threshold field keeps merges and resting neighbours razor-crisp without swelling or wobble.
// Sample count adapts from 1 at rest up to 14 at high speed.

import type { GpuView } from "./controls-gpu"

export const MAX_DOTS = 8
export const MAX_SAMPLES = 14

export interface GooDot {
  readonly x: number
  readonly y: number
  readonly r: number
  /** Opacity, for the reduced-motion path. */
  readonly a: number
  /** Velocity, px/s. */
  readonly vx: number
  readonly vy: number
  /** Radial shutter travel, px (when Size is thrown or a dot collapses). */
  readonly rBlur?: number
  readonly stretch: number
  /** Shutter displacement along the velocity, px. */
  readonly blur: number
  /** This dot's smooth-min radius, as a share of the field's (1 by default): lower, a shorter neck. */
  readonly goo?: number
}

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`
const FRAG = `precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uDot[${MAX_DOTS}];
uniform vec4 uVel[${MAX_DOTS}];
uniform vec2 uKi[${MAX_DOTS}];
uniform float uK;
uniform float uGoo;
uniform float uSamples;
uniform vec4 uColor;
float smin(float a,float b,float k){
  if(k<=0.0)return min(a,b);
  float h=max(k-abs(a-b),0.0)/k;
  return min(a,b)-h*h*k*0.25;
}
float sampleAt(vec2 p,float tau,float invS,float aa){
  float d=1e5;
  float subE=0.0;
  float wsum=0.0;
  float apart=0.0;
  for(int i=0;i<${MAX_DOTS};i++){
    vec4 D=uDot[i];
    if(D.z<0.05)continue;
    vec4 V=uVel[i];
    vec2 K=uKi[i];
    float r=max(0.05,D.z+tau*K.y);
    vec2 q=p-D.xy;
    vec2 dir=V.xy;
    vec2 lq=vec2(dot(q,dir)-tau*V.w,dot(q,vec2(-dir.y,dir.x)));
    float a=r*V.z;
    float b=r/sqrt(V.z);
    float di=(length(lq/vec2(a,b))-1.0)*min(a,b);
    d=smin(d,di,uK*K.x);
    float stepI=(V.w+abs(K.y))*invS;
    float wi=exp(-max(di,0.0)*0.24);
    subE+=stepI*wi;
    wsum+=wi;
    float ei=aa+0.55*stepI;
    apart=max(apart,D.w*(1.0-smoothstep(-ei,ei,di)));
  }
  float e=aa+(wsum>0.0?0.55*subE/wsum:0.0);
  float goo=1.0-smoothstep(-e,e,d);
  return mix(apart,goo,uGoo);
}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;
  float aa=0.75/uDpr;
  if(uSamples<=1.5){
    float cov=sampleAt(p,0.0,0.0,aa);
    gl_FragColor=vec4(uColor.rgb,1.0)*uColor.a*cov;
    return;
  }
  float invS=1.0/uSamples;
  float ign=fract(52.9829189*fract(0.06711056*gl_FragCoord.x+0.00583715*gl_FragCoord.y));
  float covSum=0.0;
  float wSum=0.0;
  for(int s=0;s<${MAX_SAMPLES};s++){
    if(float(s)>=uSamples)break;
    float u=(float(s)+0.5+(ign-0.5)*0.25)*invS;
    float tau=u-0.5;
    float w=0.64+0.36*cos(tau*6.2831853);
    covSum+=w*sampleAt(p,tau,invS,aa);
    wSum+=w;
  }
  float cov=covSum/wSum;
  gl_FragColor=vec4(uColor.rgb,1.0)*uColor.a*cov;
}`

export class Goo {
  private readonly gl: WebGLRenderingContext | null
  private readonly loc: Record<string, WebGLUniformLocation | null> = {}
  private readonly dots = new Float32Array(MAX_DOTS * 4)
  private readonly vels = new Float32Array(MAX_DOTS * 4)
  private readonly ks = new Float32Array(MAX_DOTS * 2)
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: true,
      antialias: false,
      alpha: true,
    })
    this.gl = gl
    if (!gl) return
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error("controls-goo: shader", gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const p = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(p)
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)
    for (const n of ["uRes", "uDpr", "uDot", "uVel", "uKi", "uK", "uGoo", "uSamples", "uColor"])
      this.loc[n] = gl.getUniformLocation(prog, n)
  }
  get ok() {
    return this.gl !== null
  }
  /** Sizes the drawing buffer to the canvas's box; true when it changed. */
  fit(dpr: number, cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight) {
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (this.canvas.width === w && this.canvas.height === h) return false
    this.canvas.width = w
    this.canvas.height = h
    return true
  }
  draw(
    dots: readonly GooDot[],
    o: { dpr: number; k: number; goo: boolean; color: readonly number[] },
  ) {
    const gl = this.gl
    if (!gl) return
    this.dots.fill(0)
    this.vels.fill(0)
    this.ks.fill(0)
    let maxShift = 0
    dots.slice(0, MAX_DOTS).forEach((d, i) => {
      const speed = Math.hypot(d.vx, d.vy)
      const rBlur = d.rBlur ?? 0
      this.dots.set([d.x, d.y, d.r, d.a], i * 4)
      this.ks.set([d.goo ?? 1, rBlur], i * 2)
      this.vels.set(
        [speed > 0.001 ? d.vx / speed : 1, speed > 0.001 ? d.vy / speed : 0, d.stretch, d.blur],
        i * 4,
      )
      if (d.r >= 0.05) maxShift = Math.max(maxShift, d.blur + Math.abs(rBlur))
    })
    const samples =
      maxShift < 0.15 ? 1 : Math.min(MAX_SAMPLES, Math.max(4, Math.ceil(maxShift * 1.1)))
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.loc.uRes!, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.loc.uDpr!, o.dpr)
    gl.uniform4fv(this.loc.uDot!, this.dots)
    gl.uniform4fv(this.loc.uVel!, this.vels)
    gl.uniform2fv(this.loc.uKi!, this.ks)
    gl.uniform1f(this.loc.uK!, o.goo ? o.k : 0)
    gl.uniform1f(this.loc.uGoo!, o.goo ? 1 : 0)
    gl.uniform1f(this.loc.uSamples!, samples)
    gl.uniform4f(this.loc.uColor!, o.color[0]!, o.color[1]!, o.color[2]!, o.color[3]!)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/**
 * The same dots on WebGPU (controls-dots.wgsl): the same field and shutter, lit as pillows with a
 * highlight, a rim and a soft shadow. `bg` is the stage colour it sits on (sRGB, 0–1).
 */
export class GooGpu {
  readonly canvas: HTMLCanvasElement
  constructor(private readonly view: GpuView) {
    this.canvas = view.canvas
  }
  fit(_dpr: number, _cssW?: number, _cssH?: number) {
    return false
  }
  draw(
    dots: readonly GooDot[],
    o: {
      dpr: number
      k: number
      goo: boolean
      color: readonly number[]
      bg: readonly number[]
      radius: number
    },
  ) {
    const data = this.view.data
    data.fill(0, 4)
    let maxShift = 0
    dots.slice(0, MAX_DOTS).forEach((d, i) => {
      const speed = Math.hypot(d.vx, d.vy)
      const rBlur = d.rBlur ?? 0
      data.set([d.x, d.y, d.r, d.a], 4 + i * 4)
      data.set(
        [speed > 0.001 ? d.vx / speed : 1, speed > 0.001 ? d.vy / speed : 0, d.stretch, d.blur],
        4 + (8 + i) * 4,
      )
      data.set([d.goo ?? 1, rBlur], 4 + 16 * 4 + i * 2)
      if (d.r >= 0.05) maxShift = Math.max(maxShift, d.blur + Math.abs(rBlur))
    })
    const samples =
      maxShift < 0.15 ? 1 : Math.min(MAX_SAMPLES, Math.max(4, Math.ceil(maxShift * 1.1)))
    data.set([o.goo ? o.k : 0, o.goo ? 1 : 0, samples, o.dpr], 4 + 20 * 4)
    // The ink as CSS would draw it: its alpha over the stage, then linear.
    const a = o.color[3] ?? 1
    const ink = [0, 1, 2].map((j) => toLinear(o.bg[j]! + (o.color[j]! - o.bg[j]!) * a))
    const lum = 0.2126 * o.bg[0]! + 0.7152 * o.bg[1]! + 0.0722 * o.bg[2]!
    data.set([ink[0]!, ink[1]!, ink[2]!, lum > 0.5 ? 1 : 0], 4 + 21 * 4)
    data.set([toLinear(o.bg[0]!), toLinear(o.bg[1]!), toLinear(o.bg[2]!), o.radius], 4 + 22 * 4)
    this.view.render()
  }
}
