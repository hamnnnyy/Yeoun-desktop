import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ParsedSplat } from './PlyReader';

export class SplatRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private controls: OrbitControls;

  private particles: THREE.Points;
  private particleCount = 2000;

  // Base arrays for mocking the 4D GS data
  private basePositions: Float32Array;
  private baseColors: Float32Array;

  // PLY-loaded data (null = using mock)
  private plyPositions: Float32Array | null = null;
  private plyColors: Float32Array | null = null;

  private isDestroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // 1. Initialize WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x000000, 0); // Transparent background

    // 2. Initialize Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 5, 15);

    // 3. Initialize Scene
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // 4. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // 5. Create Mock Particles
    const geometry = new THREE.BufferGeometry();

    this.basePositions = new Float32Array(this.particleCount * 3);
    this.baseColors = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      const r = 4 * Math.cbrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);

      this.basePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.basePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.basePositions[i * 3 + 2] = r * Math.cos(phi);

      const color = new THREE.Color();
      color.setHSL(0.6 + Math.random() * 0.3, 0.8, 0.6);
      this.baseColors[i * 3] = color.r;
      this.baseColors[i * 3 + 1] = color.g;
      this.baseColors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.basePositions.slice(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.baseColors.slice(), 3));

    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 } },
      vertexShader: `
        varying vec3 vColor;
        uniform float time;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (10.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 xy = gl_PointCoord.xy - vec2(0.5);
          float ll = length(xy);
          if(ll > 0.5) discard;
          float alpha = (0.5 - ll) * 2.0;
          gl_FragColor = vec4(vColor, alpha * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  private onResize = () => {
    if (!this.canvas) return;
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  };

  // ─────────────────────────────────────────────
  // PLY frame loading
  // ─────────────────────────────────────────────

  /**
   * 실제 PLY 파싱 결과를 렌더러에 로드합니다.
   * 기존 Mock 파티클 대신 실데이터로 교체합니다.
   */
  public loadPlyFrame(splat: ParsedSplat): void {
    if (this.isDestroyed) return;

    this.plyPositions = splat.positions;
    this.plyColors = splat.colors;
    const count = splat.count;

    // Geometry 교체
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(splat.positions.slice(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(splat.colors.slice(), 3));

    this.particles.geometry.dispose();
    this.particles.geometry = geometry;

    // 파티클 카운트 업데이트
    this.particleCount = count;
  }

  /**
   * Mock 4D 애니메이션 프레임 업데이트 (PLY 로드 전에 사용).
   */
  public updateFrame(frameIndex: number, totalFrames: number): void {
    if (!this.particles) return;

    const positions = this.particles.geometry.attributes.position.array as Float32Array;
    const t = (frameIndex / totalFrames) * Math.PI * 2;

    // PLY 데이터가 있으면 미세 변형만 적용
    const srcPositions = this.plyPositions ?? this.basePositions;

    for (let i = 0; i < Math.min(this.particleCount, srcPositions.length / 3); i++) {
      const idx = i * 3;
      const x0 = srcPositions[idx];
      const y0 = srcPositions[idx + 1];
      const z0 = srcPositions[idx + 2];

      if (this.plyPositions) {
        // 실데이터: 최소 진동만 적용
        positions[idx]     = x0 + Math.sin(t + i * 0.01) * 0.002;
        positions[idx + 1] = y0 + Math.cos(t + i * 0.01) * 0.002;
        positions[idx + 2] = z0;
      } else {
        // Mock 애니메이션
        const distance = Math.sqrt(x0 * x0 + z0 * z0);
        const wave = Math.sin(distance * 2.0 - t * 4.0) * 0.5;
        const cosT = Math.cos(t * 0.5);
        const sinT = Math.sin(t * 0.5);

        positions[idx]     = x0 * cosT - z0 * sinT;
        positions[idx + 1] = y0 + wave;
        positions[idx + 2] = x0 * sinT + z0 * cosT;
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  private animate = () => {
    if (this.isDestroyed) return;
    requestAnimationFrame(this.animate);
    this.controls.update();

    const material = this.particles.material as THREE.ShaderMaterial;
    if (material.uniforms) {
      material.uniforms.time.value += 0.01;
    }

    this.renderer.render(this.scene, this.camera);
  };

  public destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
  }
}
