export interface GaussianFrame {
  id: string;
  frameIndex: number;
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
}

export interface SplatMetadata {
  frameCount: number;
  duration: number;
  fps: number;
  name: string;
}

export type TrainingStage =
  | 'idle'
  | 'validate'
  | 'extract'
  | 'colmap'
  | 'init'
  | 'optimize'
  | 'export'
  | 'done'
  | 'error'
  | 'cancelled';

export const TRAINING_STAGE_LABELS: Record<TrainingStage, string> = {
  idle:      '대기 중',
  validate:  '파일 검증',
  extract:   '프레임 추출',
  colmap:    '카메라 포즈 추정 (COLMAP)',
  init:      '3D Gaussian 초기화',
  optimize:  '4D 변형 필드 최적화',
  export:    'PLY 파일 내보내기',
  done:      '완료',
  error:     '오류',
  cancelled: '취소됨',
};

export const ORDERED_STAGES: TrainingStage[] = [
  'validate', 'extract', 'colmap', 'init', 'optimize', 'export',
];

export interface TrainingLog {
  stage: TrainingStage;
  message: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
}

export interface TrainingResult {
  success: boolean;
  folderPath: string;
  plyFiles: string[];      // absolute paths to per-frame PLY files
  fileCount: number;
  error?: string;
}

export interface CameraKeyframe {
  frame: number;
  position: [number, number, number];
  target: [number, number, number];
}

export interface PlayState {
  isPlaying: boolean;
  currentFrame: number;
  fps: number;
  metadata: SplatMetadata | null;
  sequenceLoaded: boolean;
  folderPath: string | null;

  // Training State
  isTraining: boolean;
  trainingProgress: number; // 0 to 100
  trainingStatus: string;
  trainingStage: TrainingStage;
  trainingLogs: TrainingLog[];
  trainingError: string | null;

  // PLY frames (loaded after training)
  plyFiles: string[];

  // Camera keyframes
  keyframes: CameraKeyframe[];
}
