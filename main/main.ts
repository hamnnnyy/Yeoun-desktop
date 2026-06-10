import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { TrainingPipeline } from './pipeline/TrainingPipeline';

let mainWindow: BrowserWindow | null = null;
let activePipeline: TrainingPipeline | null = null;
let activeRender: ChildProcess | null = null;

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
  // SharedArrayBuffer requires Cross-Origin Isolation (gaussian-splats-3d sort worker)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    });
  });

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

ipcMain.handle('open-video-files', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
    ],
    title: '멀티뷰 영상 파일 선택 (여러 각도에서 촬영한 영상을 모두 선택)',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return { videoPaths: result.filePaths };
});

// ─────────────────────────────────────────────────────
// IPC: 트레이닝 파이프라인 실행
// ─────────────────────────────────────────────────────

ipcMain.handle('start-local-training', async (_event, videoPaths: string[]) => {
  if (!mainWindow) return { success: false, folderPath: '', plyFiles: [], fileCount: 0, error: 'No window' };

  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }

  activePipeline = new TrainingPipeline(mainWindow);

  const result = await activePipeline.run(videoPaths);
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

// ─────────────────────────────────────────────────────
// IPC: PLY 파일 직접 읽기 (file:// fetch 대체)
// ─────────────────────────────────────────────────────

ipcMain.handle('read-ply-file', async (_event, filePath: string) => {
  const fs = require('fs') as typeof import('fs');
  try {
    const buf = fs.readFileSync(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
});

// ─────────────────────────────────────────────────────
// IPC: 기존 output 폴더 로드
// ─────────────────────────────────────────────────────

ipcMain.handle('open-output-folder', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '4DGS 학습 output 폴더 선택 (train.py 실행 결과 폴더)',
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const outputDir = result.filePaths[0];
  const pcDir = path.join(outputDir, 'point_cloud');

  const fs = require('fs') as typeof import('fs');

  if (!fs.existsSync(pcDir)) {
    return { folderPath: outputDir, plyFiles: [] };
  }

  const iterDirs = fs.readdirSync(pcDir)
    .filter((d: string) => /^(coarse_|fine_)?iteration_/.test(d))
    .sort((a: string, b: string) => {
      const na = parseInt(a.replace(/\D+/g, ''), 10);
      const nb = parseInt(b.replace(/\D+/g, ''), 10);
      return na - nb;
    });

  const plyFiles = iterDirs
    .map((d: string) => path.join(pcDir, d, 'point_cloud.ply'))
    .filter((f: string) => fs.existsSync(f));

  return { folderPath: outputDir, plyFiles };
});

// ─────────────────────────────────────────────────────
// IPC: PLY 시퀀스 폴더 직접 열기
// ─────────────────────────────────────────────────────

ipcMain.handle('open-ply-sequence-folder', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'PLY 시퀀스 폴더 선택 (point_pertimestamp 등)',
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const fs = require('fs') as typeof import('fs');
  const folderPath = result.filePaths[0];

  const plyFiles = fs
    .readdirSync(folderPath)
    .filter((f: string) => f.toLowerCase().endsWith('.ply'))
    .sort()
    .map((f: string) => path.join(folderPath, f));

  return { folderPath, plyFiles };
});

// ─────────────────────────────────────────────────────
// IPC: 4D 렌더링 실행
// ─────────────────────────────────────────────────────

interface RenderConfig {
  modelPath: string;
  sourcePath: string;
  pathJsonContent: string;  // JSON 문자열
  outputDir: string;
  width: number;
  height: number;
  iteration: number;
}

function sendRender(channel: string, ...args: unknown[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.webContents.send(channel, ...args); } catch {}
}

ipcMain.handle('start-render', async (_event, config: RenderConfig) => {
  if (!mainWindow) return { success: false, error: 'No window' };
  if (activeRender) { activeRender.kill(); activeRender = null; }

  const fs = require('fs') as typeof import('fs');
  const scriptPath = process.env['4DGS_SCRIPT_PATH'];
  if (!scriptPath) return { success: false, error: '4DGS_SCRIPT_PATH 환경변수가 설정되지 않았습니다.' };

  const scriptDir = path.dirname(scriptPath);
  const renderScript = path.join(scriptDir, 'render_path.py');
  if (!fs.existsSync(renderScript)) {
    return { success: false, error: `render_path.py를 찾을 수 없습니다: ${renderScript}` };
  }

  fs.mkdirSync(config.outputDir, { recursive: true });
  const pathJsonFile = path.join(config.outputDir, 'camera_path.json');
  fs.writeFileSync(pathJsonFile, config.pathJsonContent, 'utf8');

  const python = require('child_process').spawnSync(
    process.platform === 'win32' ? 'where' : 'which',
    ['python3'], { encoding: 'utf8' },
  ).status === 0 ? 'python3' : 'python';

  return new Promise<{ success: boolean; outputDir?: string; error?: string }>((resolve) => {
    activeRender = spawn(python, [
      renderScript,
      '--model_path',  config.modelPath,
      '--source_path', config.sourcePath,
      '--path_json',   pathJsonFile,
      '--output_dir',  config.outputDir,
      '--width',       String(config.width),
      '--height',      String(config.height),
      '--iteration',   String(config.iteration),
    ], { cwd: scriptDir, windowsHide: true });

    activeRender!.stdout?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n').filter(Boolean)) {
        const m = line.match(/\[PROGRESS\]\s+(\d+)\/(\d+)/);
        if (m) sendRender('render-progress', parseInt(m[1]), parseInt(m[2]));
        else   sendRender('render-log', line);
      }
    });

    activeRender!.stderr?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(l => sendRender('render-log', l));
    });

    activeRender!.on('close', (code) => {
      activeRender = null;
      if (code === 0 || code === null) {
        sendRender('render-done', config.outputDir);
        resolve({ success: true, outputDir: config.outputDir });
      } else {
        sendRender('render-error', `렌더링 실패 (exit ${code})`);
        resolve({ success: false, error: `exit code ${code}` });
      }
    });

    activeRender!.on('error', (err) => {
      activeRender = null;
      sendRender('render-error', err.message);
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('cancel-render', () => {
  if (activeRender) { activeRender.kill('SIGTERM'); activeRender = null; }
});

// ─────────────────────────────────────────────────────
// IPC: 비디오 파일 저장 (내보내기)
// ─────────────────────────────────────────────────────

ipcMain.handle('save-video', async (_event, buffer: ArrayBuffer, defaultName: string) => {
  if (!mainWindow) return false;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MP4 Video', extensions: ['mp4'] },
    ],
    title: '내보낼 파일 위치 선택',
  });
  if (result.canceled || !result.filePath) return false;
  const fs = require('fs') as typeof import('fs');
  fs.writeFileSync(result.filePath, Buffer.from(buffer));
  return true;
});