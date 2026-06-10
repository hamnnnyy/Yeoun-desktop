"use strict";

// main/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 파일 선택 (멀티뷰: 여러 파일 동시 선택)
  openVideoFiles: () => import_electron.ipcRenderer.invoke("open-video-files"),
  // 트레이닝 시작
  startLocalTraining: (videoPaths) => import_electron.ipcRenderer.invoke("start-local-training", videoPaths),
  // 트레이닝 취소
  cancelTraining: () => import_electron.ipcRenderer.invoke("cancel-training"),
  // 이벤트: 진행도
  onTrainingProgress: (callback) => {
    import_electron.ipcRenderer.on(
      "training-progress",
      (_event, progress, status) => callback(progress, status)
    );
  },
  // 이벤트: 스테이지 변경
  onTrainingStage: (callback) => {
    import_electron.ipcRenderer.on("training-stage", (_event, stage) => callback(stage));
  },
  // 이벤트: 로그 메시지
  onTrainingLog: (callback) => {
    import_electron.ipcRenderer.on("training-log", (_event, log) => callback(log));
  },
  // 이벤트: 오류
  onTrainingError: (callback) => {
    import_electron.ipcRenderer.on("training-error", (_event, error) => callback(error));
  },
  // PLY 파일 직접 읽기 (IPC 경유, file:// fetch 불가 대체)
  readPlyFile: (filePath) => import_electron.ipcRenderer.invoke("read-ply-file", filePath),
  // 기존 output 폴더 로드
  openOutputFolder: () => import_electron.ipcRenderer.invoke("open-output-folder"),
  // PLY 시퀀스 폴더 직접 열기
  openPlySequenceFolder: () => import_electron.ipcRenderer.invoke("open-ply-sequence-folder"),
  // 4D 렌더링
  startRender: (config) => import_electron.ipcRenderer.invoke("start-render", config),
  cancelRender: () => import_electron.ipcRenderer.invoke("cancel-render"),
  onRenderProgress: (cb) => import_electron.ipcRenderer.on("render-progress", (_e, cur, total) => cb(cur, total)),
  onRenderLog: (cb) => import_electron.ipcRenderer.on("render-log", (_e, msg) => cb(msg)),
  onRenderDone: (cb) => import_electron.ipcRenderer.on("render-done", (_e, dir) => cb(dir)),
  onRenderError: (cb) => import_electron.ipcRenderer.on("render-error", (_e, err) => cb(err)),
  removeAllRenderListeners: () => {
    import_electron.ipcRenderer.removeAllListeners("render-progress");
    import_electron.ipcRenderer.removeAllListeners("render-log");
    import_electron.ipcRenderer.removeAllListeners("render-done");
    import_electron.ipcRenderer.removeAllListeners("render-error");
  },
  // 비디오 저장 (내보내기)
  saveVideo: (buffer, defaultName) => import_electron.ipcRenderer.invoke("save-video", buffer, defaultName),
  // IPC 리스너 전체 제거 (컴포넌트 언마운트 시 호출)
  removeAllTrainingListeners: () => {
    import_electron.ipcRenderer.removeAllListeners("training-progress");
    import_electron.ipcRenderer.removeAllListeners("training-stage");
    import_electron.ipcRenderer.removeAllListeners("training-log");
    import_electron.ipcRenderer.removeAllListeners("training-error");
  }
});
