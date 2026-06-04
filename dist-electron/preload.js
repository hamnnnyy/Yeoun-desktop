"use strict";

// main/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 파일 선택
  openVideoFile: () => import_electron.ipcRenderer.invoke("open-video-file"),
  // 트레이닝 시작
  startLocalTraining: (videoPath) => import_electron.ipcRenderer.invoke("start-local-training", videoPath),
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
  // IPC 리스너 전체 제거 (컴포넌트 언마운트 시 호출)
  removeAllTrainingListeners: () => {
    import_electron.ipcRenderer.removeAllListeners("training-progress");
    import_electron.ipcRenderer.removeAllListeners("training-stage");
    import_electron.ipcRenderer.removeAllListeners("training-log");
    import_electron.ipcRenderer.removeAllListeners("training-error");
  }
});
