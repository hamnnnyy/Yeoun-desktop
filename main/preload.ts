import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 선택 (멀티뷰: 여러 파일 동시 선택)
  openVideoFiles: () => ipcRenderer.invoke('open-video-files'),

  // 트레이닝 시작
  startLocalTraining: (videoPaths: string[]) =>
    ipcRenderer.invoke('start-local-training', videoPaths),

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

  // PLY 파일 직접 읽기 (IPC 경유, file:// fetch 불가 대체)
  readPlyFile: (filePath: string) => ipcRenderer.invoke('read-ply-file', filePath),

  // 기존 output 폴더 로드
  openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),

  // PLY 시퀀스 폴더 직접 열기
  openPlySequenceFolder: () => ipcRenderer.invoke('open-ply-sequence-folder'),

  // 4D 렌더링
  startRender: (config: unknown) => ipcRenderer.invoke('start-render', config),
  cancelRender: () => ipcRenderer.invoke('cancel-render'),
  onRenderProgress: (cb: (cur: number, total: number) => void) =>
    ipcRenderer.on('render-progress', (_e, cur, total) => cb(cur, total)),
  onRenderLog: (cb: (msg: string) => void) =>
    ipcRenderer.on('render-log', (_e, msg) => cb(msg)),
  onRenderDone: (cb: (outputDir: string) => void) =>
    ipcRenderer.on('render-done', (_e, dir) => cb(dir)),
  onRenderError: (cb: (err: string) => void) =>
    ipcRenderer.on('render-error', (_e, err) => cb(err)),
  removeAllRenderListeners: () => {
    ipcRenderer.removeAllListeners('render-progress');
    ipcRenderer.removeAllListeners('render-log');
    ipcRenderer.removeAllListeners('render-done');
    ipcRenderer.removeAllListeners('render-error');
  },

  // 비디오 저장 (내보내기)
  saveVideo: (buffer: ArrayBuffer, defaultName: string) =>
    ipcRenderer.invoke('save-video', buffer, defaultName),

  // IPC 리스너 전체 제거 (컴포넌트 언마운트 시 호출)
  removeAllTrainingListeners: () => {
    ipcRenderer.removeAllListeners('training-progress');
    ipcRenderer.removeAllListeners('training-stage');
    ipcRenderer.removeAllListeners('training-log');
    ipcRenderer.removeAllListeners('training-error');
  },
});
