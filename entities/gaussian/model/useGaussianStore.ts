import { create } from 'zustand';
import {
  PlayState,
  SplatMetadata,
  TrainingLog,
  TrainingStage,
  TrainingResult,
} from './types';

interface GaussianStore extends PlayState {
  play: () => void;
  pause: () => void;
  setFrame: (frame: number | ((prev: number) => number)) => void;
  setFps: (fps: number) => void;
  loadSequence: (folderPath: string, metadata: SplatMetadata, plyFiles?: string[]) => void;
  unloadSequence: () => void;

  // Training Actions
  startTraining: (videoPath: string) => void;
  updateTrainingProgress: (progress: number, status: string, stage?: TrainingStage) => void;
  appendLog: (log: Omit<TrainingLog, 'timestamp'>) => void;
  finishTraining: (result: TrainingResult) => void;
  setTrainingError: (error: string) => void;
  cancelTraining: () => void;
}

export const useGaussianStore = create<GaussianStore>((set) => ({
  // Playback state
  isPlaying: false,
  currentFrame: 0,
  fps: 30,
  metadata: null,
  sequenceLoaded: false,
  folderPath: null,
  plyFiles: [],

  // Training state
  isTraining: false,
  trainingProgress: 0,
  trainingStatus: '',
  trainingStage: 'idle',
  trainingLogs: [],
  trainingError: null,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setFrame: (frame) =>
    set((state) => ({
      currentFrame: typeof frame === 'function' ? frame(state.currentFrame) : frame,
    })),
  setFps: (fps) => set({ fps }),

  loadSequence: (folderPath, metadata, plyFiles = []) =>
    set({
      sequenceLoaded: true,
      folderPath,
      metadata,
      plyFiles,
      currentFrame: 0,
      isPlaying: false,
    }),

  unloadSequence: () =>
    set({
      sequenceLoaded: false,
      folderPath: null,
      metadata: null,
      plyFiles: [],
      currentFrame: 0,
      isPlaying: false,
    }),

  startTraining: (_videoPath) =>
    set({
      isTraining: true,
      trainingProgress: 0,
      trainingStatus: '파이프라인을 초기화하는 중...',
      trainingStage: 'validate',
      trainingLogs: [],
      trainingError: null,
      sequenceLoaded: false,
      folderPath: null,
      plyFiles: [],
      isPlaying: false,
    }),

  updateTrainingProgress: (progress, status, stage) =>
    set((state) => ({
      trainingProgress: progress,
      trainingStatus: status,
      trainingStage: stage ?? state.trainingStage,
    })),

  appendLog: (log) =>
    set((state) => ({
      trainingLogs: [
        ...state.trainingLogs,
        { ...log, timestamp: Date.now() },
      ].slice(-200), // 최대 200개 로그 유지
    })),

  finishTraining: (result) =>
    set({
      isTraining: false,
      trainingProgress: 100,
      trainingStatus: '트레이닝 완료',
      trainingStage: 'done',
      sequenceLoaded: result.success,
      folderPath: result.folderPath,
      plyFiles: result.plyFiles,
      metadata: result.success
        ? {
            frameCount: result.fileCount,
            duration: result.fileCount / 30,
            fps: 30,
            name: result.folderPath.split(/[\\/]/).pop() ?? 'Trained Sequence',
          }
        : null,
      currentFrame: 0,
      isPlaying: result.success,
    }),

  setTrainingError: (error) =>
    set({
      isTraining: false,
      trainingStage: 'error',
      trainingError: error,
      trainingStatus: '오류 발생',
    }),

  cancelTraining: () =>
    set({
      isTraining: false,
      trainingStage: 'cancelled',
      trainingStatus: '취소됨',
      trainingProgress: 0,
    }),
}));
