import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 선택
  openVideoFile: () => ipcRenderer.invoke('open-video-file'),

  // 트레이닝 시작
  startLocalTraining: (videoPath: string) =>
    ipcRenderer.invoke('start-local-training', videoPath),

  // 트레이닝 취소
  cancelTraining: () => ipcRenderer.invoke('cancel-training'),

  // 이벤트: 진행도
  onTrainingProgress: (
    callback: (progress: number, status: string) => void,
  ) => {
    ipcRenderer.on('training-progress', (_event, progress, status) =>
      callback(progress, status),
    );
  },

  // 이벤트: 스테이지 변경
  onTrainingStage: (callback: (stage: string) => void) => {
    ipcRenderer.on('training-stage', (_event, stage) => callback(stage));
  },

  // 이벤트: 로그 메시지
  onTrainingLog: (
    callback: (log: { message: string; level: string; timestamp: number }) => void,
  ) => {
    ipcRenderer.on('training-log', (_event, log) => callback(log));
  },

  // 이벤트: 오류
  onTrainingError: (callback: (error: string) => void) => {
    ipcRenderer.on('training-error', (_event, error) => callback(error));
  },

  // IPC 리스너 전체 제거 (컴포넌트 언마운트 시 호출)
  removeAllTrainingListeners: () => {
    ipcRenderer.removeAllListeners('training-progress');
    ipcRenderer.removeAllListeners('training-stage');
    ipcRenderer.removeAllListeners('training-log');
    ipcRenderer.removeAllListeners('training-error');
  },
});
