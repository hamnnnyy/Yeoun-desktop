declare module '@mkkellogg/gaussian-splats-3d' {
  import * as THREE from 'three';

  export enum SceneFormat {
    Ply = 'ply',
    Splat = 'splat',
    KSplat = 'ksplat',
    Spz = 'spz',
  }

  export interface ViewerOptions {
    rootElement?: HTMLElement;
    selfDrivenMode?: boolean;
    useBuiltInControls?: boolean;
    initialCameraPosition?: [number, number, number];
    cameraUp?: [number, number, number];
    showLoadingUI?: boolean;
    renderer?: THREE.WebGLRenderer;
    camera?: THREE.PerspectiveCamera;
    [key: string]: unknown;
  }

  export interface AddSplatSceneOptions {
    format?: SceneFormat;
    showLoadingUI?: boolean;
    progressiveLoad?: boolean;
    visible?: boolean;
    opacity?: number;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    [key: string]: unknown;
  }

  export interface SplatScene {
    visible: boolean;
  }

  export class Viewer {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update(): void };
    constructor(options?: ViewerOptions);
    start(): void;
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
    removeSplatScene(index: number, showLoadingUI?: boolean): Promise<void>;
    getSceneCount(): number;
    getSplatScene(index: number): SplatScene | null;
    dispose(): void;
  }
}
