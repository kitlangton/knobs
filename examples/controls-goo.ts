// Metaballs for the Sliders preview: a WebGL fragment shader that draws up to eight dots as one
// signed-distance field, unioned with a polynomial smooth-min, so a dot leaving its neighbour
// stretches out of it, necks and pinches off (and flows back in reverse). Each dot is an ellipse
// stretched along its velocity, and its edge softens along the velocity in proportion to speed:
// a motion blur that is exactly 0 at rest. With `goo` off (reduced motion) the dots are drawn
// apart, each with its own opacity. It draws only when asked, so a still preview costs nothing.

export const MAX_DOTS = 8

export interface GooDot {
  readonly x: number
  readonly y: number
  readonly r: number
  /** Opacity, for the reduced-motion path. */
  readonly a: number
  /** Velocity, px/s. */
  readonly vx: number
  readonly vy: number
  readonly stretch: number
  /** Blur along the velocity, px. */
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
uniform float uKi[${MAX_DOTS}];
uniform float uK;
uniform float uGoo;
uniform vec4 uColor;
float smin(float a,float b,float k){
  if(k<=0.0)return min(a,b);
  float h=max(k-abs(a-b),0.0)/k;
  return min(a,b)-h*h*k*0.25;
}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;
  float aa=0.75/uDpr;
  float d=1e5;
  float blur=0.0;
  float wsum=0.0;
  float apart=0.0;
  for(int i=0;i<${MAX_DOTS};i++){
    vec4 D=uDot[i];
    if(D.z<0.05)continue;
    vec4 V=uVel[i];
    vec2 q=p-D.xy;
    vec2 dir=V.xy;
    vec2 lq=vec2(dot(q,dir),dot(q,vec2(-dir.y,dir.x)));
    float a=D.z*V.z;
    float b=D.z/sqrt(V.z);
    float di=(length(lq/vec2(a,b))-1.0)*min(a,b);
    d=smin(d,di,uK*uKi[i]);
    float w=exp(-max(di,0.0)*0.2);
    float along=abs(lq.x)/max(length(lq),0.001);
    blur+=V.w*along*w;
    wsum+=w;
    float e=aa+V.w*along;
    apart=max(apart,D.w*(1.0-smoothstep(-e,e,di)));
  }
  float bl=wsum>0.0?blur/wsum:0.0;
  float e=aa+bl;
  float goo=1.0-smoothstep(-e,e,d);
  float cov=mix(apart,goo,uGoo);
  gl_FragColor=vec4(uColor.rgb,1.0)*uColor.a*cov;
}`

export class Goo {
  private readonly gl: WebGLRenderingContext | null
  private readonly loc: Record<string, WebGLUniformLocation | null> = {}
  private readonly dots = new Float32Array(MAX_DOTS * 4)
  private readonly vels = new Float32Array(MAX_DOTS * 4)
  private readonly ks = new Float32Array(MAX_DOTS)
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
    for (const n of ["uRes", "uDpr", "uDot", "uVel", "uKi", "uK", "uGoo", "uColor"])
      this.loc[n] = gl.getUniformLocation(prog, n)
  }
  get ok() {
    return this.gl !== null
  }
  /** Sizes the drawing buffer to the canvas's box; true when it changed. */
  fit(dpr: number) {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
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
    this.ks.fill(1)
    dots.slice(0, MAX_DOTS).forEach((d, i) => {
      const speed = Math.hypot(d.vx, d.vy)
      this.dots.set([d.x, d.y, d.r, d.a], i * 4)
      this.ks[i] = d.goo ?? 1
      this.vels.set(
        [speed > 0.001 ? d.vx / speed : 1, speed > 0.001 ? d.vy / speed : 0, d.stretch, d.blur],
        i * 4,
      )
    })
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.loc.uRes!, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.loc.uDpr!, o.dpr)
    gl.uniform4fv(this.loc.uDot!, this.dots)
    gl.uniform4fv(this.loc.uVel!, this.vels)
    gl.uniform1fv(this.loc.uKi!, this.ks)
    gl.uniform1f(this.loc.uK!, o.goo ? o.k : 0)
    gl.uniform1f(this.loc.uGoo!, o.goo ? 1 : 0)
    gl.uniform4f(this.loc.uColor!, o.color[0]!, o.color[1]!, o.color[2]!, o.color[3]!)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
