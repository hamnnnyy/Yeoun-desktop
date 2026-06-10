type TrainingStage =
  | 'idle' | 'validate' | 'extract' | 'colmap' | 'poses'
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
  // 파일 선택 (멀티뷰: 여러 파일)
  openVideoFiles: () => Promise<{ videoPaths: string[] } | null>;

  // PLY 파일 직접 읽기
  readPlyFile: (filePath: string) => Promise<ArrayBuffer | null>;

  // 4D 렌더링
  startRender: (config: {
    modelPath: string; sourcePath: string; pathJsonContent: string;
    outputDir: string; width: number; height: number; iteration: number;
  }) => Promise<{ success: boolean; outputDir?: string; error?: string }>;
  cancelRender: () => Promise<void>;
  onRenderProgress: (cb: (cur: number, total: number) => void) => void;
  onRenderLog: (cb: (msg: string) => void) => void;
  onRenderDone: (cb: (outputDir: string) => void) => void;
  onRenderError: (cb: (err: string) => void) => void;
  removeAllRenderListeners: () => void;

  // 기존 output 폴더 로드
  openOutputFolder: () => Promise<{ folderPath: string; plyFiles: string[] } | null>;

  // PLY 시퀀스 폴더 직접 열기
  openPlySequenceFolder: () => Promise<{ folderPath: string; plyFiles: string[] } | null>;

  // 트레이닝
  startLocalTraining: (videoPaths: string[]) => Promise<TrainingResult>;
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
