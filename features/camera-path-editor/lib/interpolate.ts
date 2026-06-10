import type { CameraKeyframe } from '@/entities/camera-path';

export interface InterpolatedPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  sceneTime: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateCameraPath(
  keyframes: CameraKeyframe[],
  t: number,
): InterpolatedPose | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    return { position: kf.position, target: kf.target, fov: kf.fov, sceneTime: kf.sceneTime };
  }

  const minT = keyframes[0].outputTime;
  const maxT = keyframes[keyframes.length - 1].outputTime;
  const tc = Math.max(minT, Math.min(maxT, t));

  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].outputTime <= tc) i++;

  if (i >= keyframes.length - 1) {
    const kf = keyframes[keyframes.length - 1];
    return { position: kf.position, target: kf.target, fov: kf.fov, sceneTime: kf.sceneTime };
  }

  const k0 = keyframes[i];
  const k1 = keyframes[i + 1];
  const alpha = (tc - k0.outputTime) / (k1.outputTime - k0.outputTime);

  return {
    position: [
      lerp(k0.position[0], k1.position[0], alpha),
      lerp(k0.position[1], k1.position[1], alpha),
      lerp(k0.position[2], k1.position[2], alpha),
    ],
    target: [
      lerp(k0.target[0], k1.target[0], alpha),
      lerp(k0.target[1], k1.target[1], alpha),
      lerp(k0.target[2], k1.target[2], alpha),
    ],
    fov: lerp(k0.fov, k1.fov, alpha),
    sceneTime: lerp(k0.sceneTime, k1.sceneTime, alpha),
  };
}
