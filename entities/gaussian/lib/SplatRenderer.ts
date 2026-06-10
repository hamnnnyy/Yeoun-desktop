import * as GS from '@mkkellogg/gaussian-splats-3d';

export class SplatRenderer {
  private viewer: GS.Viewer;
  private currentBlobUrl: string | null = null;
  private isDestroyed = false;
  private isLoading = false;
  private pending: { buffer: ArrayBuffer; resolve: () => void } | null = null;

  constructor(container: HTMLElement) {
    this.viewer = new GS.Viewer({
      rootElement: container,
      selfDrivenMode: true,
      useBuiltInControls: true,
      initialCameraPosition: [0, 5, 15],
      cameraUp: [0, 1, 0],
      showLoadingUI: false,
    } as ConstructorParameters<typeof GS.Viewer>[0]);
    this.viewer.start();
  }

  public loadPlyFrame(buffer: ArrayBuffer): Promise<void> {
    if (this.isDestroyed) return Promise.resolve();
    if (this.isLoading) {
      this.pending?.resolve();
      return new Promise<void>((resolve) => {
        this.pending = { buffer, resolve };
      });
    }
    return this._startLoad(buffer);
  }

  private _startLoad(buffer: ArrayBuffer): Promise<void> {
    this.isLoading = true;
    const p = this._doLoad(buffer).catch((err) => {
      if (!this.isDestroyed) console.warn('SplatRenderer: load failed', err);
    });
    p.then(() => {
      this.isLoading = false;
      if (this.pending && !this.isDestroyed) {
        const { buffer: nextBuf, resolve: nextResolve } = this.pending;
        this.pending = null;
        this._startLoad(nextBuf).then(nextResolve);
      }
    });
    return p;
  }

  private async _doLoad(buffer: ArrayBuffer): Promise<void> {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const newUrl = URL.createObjectURL(blob);
    const hasOld = this.viewer.getSceneCount() > 0;

    await this.viewer.addSplatScene(newUrl, {
      format: GS.SceneFormat.Ply,
      showLoadingUI: false,
      visible: !hasOld,
    });

    if (this.isDestroyed) { URL.revokeObjectURL(newUrl); return; }

    if (hasOld) {
      const newScene = this.viewer.getSplatScene(1);
      const oldScene = this.viewer.getSplatScene(0);
      if (newScene) newScene.visible = true;
      if (oldScene) oldScene.visible = false;
    }

    if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);
    this.currentBlobUrl = newUrl;

    if (hasOld) await this.viewer.removeSplatScene(0, false);
  }

  public getCameraState(): { position: [number, number, number]; target: [number, number, number] } | null {
    const cam = this.viewer.camera;
    const ctrl = this.viewer.controls;
    if (!cam || !ctrl) return null;
    return {
      position: [cam.position.x, cam.position.y, cam.position.z],
      target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
    };
  }

  public setCameraState(position: [number, number, number], target: [number, number, number]): void {
    const cam = this.viewer.camera;
    const ctrl = this.viewer.controls;
    if (!cam || !ctrl) return;
    cam.position.set(position[0], position[1], position[2]);
    ctrl.target.set(target[0], target[1], target[2]);
    ctrl.update();
  }

  // Wait for one render cycle after loading
  public waitForRender(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // Capture current frame via gl.readPixels (works regardless of preserveDrawingBuffer)
  public captureFrame(): ImageData | null {
    const threeRenderer = (this.viewer as unknown as { renderer?: { domElement: HTMLCanvasElement; getContext(): WebGLRenderingContext | WebGL2RenderingContext } }).renderer;
    if (!threeRenderer) return null;

    const canvas = threeRenderer.domElement;
    const gl = threeRenderer.getContext();
    const w = canvas.width;
    const h = canvas.height;

    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL is bottom-up → flip vertically
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      const srcRow = h - 1 - row;
      flipped.set(pixels.subarray(srcRow * w * 4, (srcRow + 1) * w * 4), row * w * 4);
    }

    return new ImageData(flipped, w, h);
  }

  public getCanvasSize(): { width: number; height: number } | null {
    const threeRenderer = (this.viewer as unknown as { renderer?: { domElement: HTMLCanvasElement } }).renderer;
    if (!threeRenderer) return null;
    return { width: threeRenderer.domElement.width, height: threeRenderer.domElement.height };
  }

  public zoomIn(): void {
    const cam = this.viewer.camera, ctrl = this.viewer.controls;
    if (!cam || !ctrl) return;
    cam.position.copy(ctrl.target.clone().add(cam.position.clone().sub(ctrl.target).multiplyScalar(0.8)));
    ctrl.update();
  }

  public zoomOut(): void {
    const cam = this.viewer.camera, ctrl = this.viewer.controls;
    if (!cam || !ctrl) return;
    cam.position.copy(ctrl.target.clone().add(cam.position.clone().sub(ctrl.target).multiplyScalar(1.25)));
    ctrl.update();
  }

  public resetCamera(): void {
    const cam = this.viewer.camera, ctrl = this.viewer.controls;
    if (!cam || !ctrl) return;
    cam.position.set(0, 5, 15);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.pending?.resolve();
    this.pending = null;
    if (this.currentBlobUrl) { URL.revokeObjectURL(this.currentBlobUrl); this.currentBlobUrl = null; }
    try { this.viewer.dispose(); } catch { /* StrictMode double-mount */ }
  }
}
