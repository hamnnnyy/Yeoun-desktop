import type { CameraKeyframe } from '../model/types';

type Vec3 = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function interpolateCameraPath(
  keyframes: CameraKeyframe[],
  frame: number,
): { position: Vec3; target: Vec3 } | null {
  if (keyframes.length === 0) return null;

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  if (frame <= sorted[0].frame) {
    return { position: sorted[0].position, target: sorted[0].target };
  }
  if (frame >= sorted[sorted.length - 1].frame) {
    const last = sorted[sorted.length - 1];
    return { position: last.position, target: last.target };
  }

  let before = sorted[0];
  let after = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].frame <= frame && sorted[i + 1].frame >= frame) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }

  const t = smoothstep((frame - before.frame) / (after.frame - before.frame));
  return {
    position: lerpVec3(before.position, after.position, t),
    target: lerpVec3(before.target, after.target, t),
  };
}
