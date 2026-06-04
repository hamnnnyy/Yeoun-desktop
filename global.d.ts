type TrainingStage =
  | 'idle' | 'validate' | 'extract' | 'colmap'
  | 'init' | 'optimize' | 'export' | 'done' | 'error' | 'cancelled';

interface TrainingLog {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: number;
}

interface TrainingResult {
  success: boolean;
  folderPath: string;
  plyFiles: string[];
  fileCount: number;
  error?: string;
}

interface ElectronAPI {
  // 파일 선택
  openVideoFile: () => Promise<{ videoPath: string } | null>;

  // 트레이닝
  startLocalTraining: (videoPath: string) => Promise<TrainingResult>;
  cancelTraining: () => Promise<void>;

  // 이벤트 리스너
  onTrainingProgress: (callback: (progress: number, status: string) => void) => void;
  onTrainingStage: (callback: (stage: TrainingStage) => void) => void;
  onTrainingLog: (callback: (log: TrainingLog) => void) => void;
  onTrainingError: (callback: (error: string) => void) => void;
  removeAllTrainingListeners: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
