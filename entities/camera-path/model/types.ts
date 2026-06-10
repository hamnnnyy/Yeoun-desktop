export interface CameraKeyframe {
  id: string;
  outputTime: number;
  sceneTime: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface CameraPath {
  keyframes: CameraKeyframe[];
  duration: number;
  fps: number;
}
