import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GaussianSplatMesh } from './GaussianSplatMesh';
import { parsePly, type ParsedSplat } from './PlyReader';

export class SplatRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private splatMesh: GaussianSplatMesh | null = null;
  private isDestroyed = false;
  private animId: number | null = null;
  private container: HTMLElement;
  private ro: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || 1280) / (container.clientHeight || 720),
      0.1,
      1000,
    );
    this.camera.position.set(0, 5, 15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(container);

    this.animate();
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = () => {
    if (this.isDestroyed) return;
    this.animId = requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.splatMesh) this.splatMesh.update(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  };

  /** 빠른 경로: 미리 파싱된 ParsedSplat으로 GPU 버퍼 직접 갱신 */
  loadParsedFrame(splat: ParsedSplat): void {
    if (this.isDestroyed) return;
    if (this.splatMesh) {
      this.splatMesh.updateFrame(splat, this.camera.position);
    } else {
      this.splatMesh = new GaussianSplatMesh(splat);
      this.scene.add(this.splatMesh);
    }
  }

  /** 폴백 경로: 원시 ArrayBuffer를 받아 파싱 후 loadParsedFrame 호출 */
  async loadPlyFrame(buffer: ArrayBuffer): Promise<void> {
    if (this.isDestroyed) return;
    const splat = await parsePly(buffer);
    if (!this.isDestroyed) this.loadParsedFrame(splat);
  }

  getCameraState(): { position: [number, number, number]; target: [number, number, number] } | null {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
  }

  setCameraState(position: [number, number, number], target: [number, number, number]): void {
    this.camera.position.set(...position);
    this.controls.target.set(...target);
    this.controls.update();
  }

  waitForRender(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  captureFrame(): ImageData | null {
    this.renderer.render(this.scene, this.camera);
    const gl = this.renderer.getContext();
    const canvas = this.renderer.domElement;
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      flipped.set(
        pixels.subarray((h - 1 - row) * w * 4, (h - row) * w * 4),
        row * w * 4,
      );
    }
    return new ImageData(flipped, w, h);
  }

  getCanvasSize(): { width: number; height: number } | null {
    return {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
    };
  }

  zoomIn(): void {
    const dir = this.camera.position.clone().sub(this.controls.target).multiplyScalar(0.8);
    this.camera.position.copy(this.controls.target.clone().add(dir));
    this.controls.update();
  }

  zoomOut(): void {
    const dir = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1.25);
    this.camera.position.copy(this.controls.target.clone().add(dir));
    this.controls.update();
  }

  resetCamera(): void {
    this.camera.position.set(0, 5, 15);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    this.ro.disconnect();
    this.splatMesh?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
