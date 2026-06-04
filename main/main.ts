import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { TrainingPipeline } from './pipeline/TrainingPipeline';

let mainWindow: BrowserWindow | null = null;
let activePipeline: TrainingPipeline | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset', // Premium feel on macOS
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.on('closed', () => {
    // 앱 종료 시 실행 중인 파이프라인 취소
    activePipeline?.cancel();
    activePipeline = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  activePipeline?.cancel();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─────────────────────────────────────────────────────
// IPC: 파일 선택 다이얼로그
// ─────────────────────────────────────────────────────

ipcMain.handle('open-video-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos & Images', extensions: ['mp4', 'mov', 'heic', 'jpg', 'png', 'avi', 'mkv'] },
    ],
    title: '4D GS 트레이닝에 사용할 영상 파일 선택',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return { videoPath: result.filePaths[0] };
});

// ─────────────────────────────────────────────────────
// IPC: 트레이닝 파이프라인 실행
// ─────────────────────────────────────────────────────

ipcMain.handle('start-local-training', async (_event, videoPath: string) => {
  if (!mainWindow) return { success: false, folderPath: '', plyFiles: [], fileCount: 0, error: 'No window' };

  // 이미 실행 중인 파이프라인이 있으면 취소
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }

  activePipeline = new TrainingPipeline(mainWindow);

  const result = await activePipeline.run(videoPath);
  activePipeline = null;

  return result;
});

// ─────────────────────────────────────────────────────
// IPC: 트레이닝 취소
// ─────────────────────────────────────────────────────

ipcMain.handle('cancel-training', async () => {
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
});