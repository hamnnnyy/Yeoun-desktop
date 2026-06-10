import * as THREE from 'three';
import type { ParsedSplat } from './PlyReader';

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
precision highp float;

attribute vec3  splatCenter;
attribute vec3  splatColor;
attribute float splatOpacity;
attribute float splatMaxScale;

varying vec2  vUv;
varying vec3  vColor;
varying float vAlpha;

void main() {
  vColor = splatColor;
  vAlpha = splatOpacity;
  vUv    = position.xy * 2.0;   // quad corner in [-1,1]

  vec4 eye = modelViewMatrix * vec4(splatCenter, 1.0);
  if (eye.z >= 0.0) {           // behind camera — discard via clip
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  float depth = -eye.z;

  // Billboard radius in NDC (3-sigma)
  float rx = min(splatMaxScale * 3.0 * projectionMatrix[0][0] / depth, 0.5);
  float ry = min(splatMaxScale * 3.0 * projectionMatrix[1][1] / depth, 0.5);

  vec4 clip = projectionMatrix * eye;
  gl_Position = clip + vec4(
    position.x * rx * clip.w,
    position.y * ry * clip.w,
    0.0, 0.0
  );
}
`;

const FRAG = /* glsl */`
precision highp float;

varying vec2  vUv;
varying vec3  vColor;
varying float vAlpha;

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  // 3-sigma boundary at |vUv|=1  →  exp(-0.5 * (3σ)²/σ²) = exp(-4.5)
  float a = vAlpha * exp(-4.5 * r2);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_SPLATS = 200_000;

// ─── Class ──────────────────────────────────────────────────────────────────

export class GaussianSplatMesh extends THREE.Object3D {
  readonly count: number;

  private geom: THREE.InstancedBufferGeometry;
  private mesh: THREE.Mesh;

  private centersAttr:   THREE.InstancedBufferAttribute;
  private colorsAttr:    THREE.InstancedBufferAttribute;
  private opacitiesAttr: THREE.InstancedBufferAttribute;
  private scalesAttr:    THREE.InstancedBufferAttribute;

  // Stable source arrays (original order)
  private origPos: Float32Array;
  private origCol: Float32Array;
  private origOpa: Float32Array;
  private origScl: Float32Array;

  // GPU-facing arrays (sorted order, same buffers as attributes)
  private sPos: Float32Array;
  private sCol: Float32Array;
  private sOpa: Float32Array;
  private sScl: Float32Array;

  private lastCamPos  = new THREE.Vector3(Infinity, 0, 0);
  private sortTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(splat: ParsedSplat) {
    super();

    const n = this.count = Math.min(splat.count, MAX_SPLATS);

    // Per-splat max scale
    const maxScl = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      maxScl[i] = Math.max(splat.scales[i*3], splat.scales[i*3+1], splat.scales[i*3+2]);
    }

    this.origPos = splat.positions.slice(0, n * 3);
    this.origCol = splat.colors.slice(0, n * 3);
    this.origOpa = splat.opacities
      ? splat.opacities.slice(0, n)
      : new Float32Array(n).fill(0.8);
    this.origScl = maxScl;

    this.sPos = new Float32Array(this.origPos);
    this.sCol = new Float32Array(this.origCol);
    this.sOpa = new Float32Array(this.origOpa);
    this.sScl = new Float32Array(this.origScl);

    // ── InstancedBufferGeometry ──────────────────────────────────────────
    this.geom = new THREE.InstancedBufferGeometry();
    this.geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0]),
        3,
      ),
    );
    this.geom.setIndex(
      new THREE.BufferAttribute(new Uint16Array([0,1,2, 0,2,3]), 1),
    );
    this.geom.instanceCount = n;

    this.centersAttr   = new THREE.InstancedBufferAttribute(this.sPos, 3);
    this.colorsAttr    = new THREE.InstancedBufferAttribute(this.sCol, 3);
    this.opacitiesAttr = new THREE.InstancedBufferAttribute(this.sOpa, 1);
    this.scalesAttr    = new THREE.InstancedBufferAttribute(this.sScl, 1);

    this.geom.setAttribute('splatCenter',   this.centersAttr);
    this.geom.setAttribute('splatColor',    this.colorsAttr);
    this.geom.setAttribute('splatOpacity',  this.opacitiesAttr);
    this.geom.setAttribute('splatMaxScale', this.scalesAttr);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      depthTest:      true,
      blending:       THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(this.geom, mat);
    this.mesh.frustumCulled = false;
    this.add(this.mesh);
  }

  // Call every frame from the render loop
  update(camPos: THREE.Vector3): void {
    if (camPos.distanceTo(this.lastCamPos) < 0.25) return;
    this.lastCamPos.copy(camPos);

    // Debounce: sort 400ms after last camera movement
    if (this.sortTimer !== null) clearTimeout(this.sortTimer);
    this.sortTimer = setTimeout(() => {
      this.doSort(camPos);
      this.sortTimer = null;
    }, 400);
  }

  private doSort(cam: THREE.Vector3): void {
    const n = this.count;
    const p = this.origPos;

    // Squared distances (back-to-front = descending)
    const idx   = new Array<number>(n);
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      idx[i] = i;
      const dx = p[i*3]   - cam.x;
      const dy = p[i*3+1] - cam.y;
      const dz = p[i*3+2] - cam.z;
      depth[i] = dx*dx + dy*dy + dz*dz;
    }
    idx.sort((a, b) => depth[b] - depth[a]);

    // Reorder GPU-facing buffers
    const op = this.origPos, oc = this.origCol, oo = this.origOpa, os = this.origScl;
    const sp = this.sPos,    sc = this.sCol,    so = this.sOpa,    ss = this.sScl;
    for (let j = 0; j < n; j++) {
      const i = idx[j];
      sp[j*3]   = op[i*3];    sp[j*3+1] = op[i*3+1];  sp[j*3+2] = op[i*3+2];
      sc[j*3]   = oc[i*3];    sc[j*3+1] = oc[i*3+1];  sc[j*3+2] = oc[i*3+2];
      so[j]     = oo[i];
      ss[j]     = os[i];
    }

    this.centersAttr.needsUpdate   = true;
    this.colorsAttr.needsUpdate    = true;
    this.opacitiesAttr.needsUpdate = true;
    this.scalesAttr.needsUpdate    = true;
  }

  dispose(): void {
    if (this.sortTimer !== null) clearTimeout(this.sortTimer);
    this.geom.dispose();
    (this.mesh.material as THREE.ShaderMaterial).dispose();
  }
}
