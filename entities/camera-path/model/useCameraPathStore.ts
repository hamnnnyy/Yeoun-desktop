import { create } from 'zustand';
import type { CameraKeyframe, CameraPath } from './types';

interface CameraPathState {
  path: CameraPath;
  selectedId: string | null;
  previewTime: number;

  addKeyframe: (kf: Omit<CameraKeyframe, 'id'>) => void;
  updateKeyframe: (id: string, updates: Partial<Omit<CameraKeyframe, 'id'>>) => void;
  removeKeyframe: (id: string) => void;
  selectKeyframe: (id: string | null) => void;
  setPreviewTime: (t: number) => void;
  setDuration: (d: number) => void;
  setFps: (fps: number) => void;
}

let _nextId = 1;

export const useCameraPathStore = create<CameraPathState>((set) => ({
  path: { keyframes: [], duration: 5, fps: 30 },
  selectedId: null,
  previewTime: 0,

  addKeyframe: (kf) =>
    set((s) => ({
      path: {
        ...s.path,
        keyframes: [...s.path.keyframes, { ...kf, id: String(_nextId++) }].sort(
          (a, b) => a.outputTime - b.outputTime,
        ),
      },
    })),

  updateKeyframe: (id, updates) =>
    set((s) => ({
      path: {
        ...s.path,
        keyframes: s.path.keyframes
          .map((kf) => (kf.id === id ? { ...kf, ...updates } : kf))
          .sort((a, b) => a.outputTime - b.outputTime),
      },
    })),

  removeKeyframe: (id) =>
    set((s) => ({
      selectedId: s.selectedId === id ? null : s.selectedId,
      path: {
        ...s.path,
        keyframes: s.path.keyframes.filter((kf) => kf.id !== id),
      },
    })),

  selectKeyframe: (id) => set({ selectedId: id }),
  setPreviewTime: (previewTime) => set({ previewTime }),
  setDuration: (duration) => set((s) => ({ path: { ...s.path, duration } })),
  setFps: (fps) => set((s) => ({ path: { ...s.path, fps } })),
}));
