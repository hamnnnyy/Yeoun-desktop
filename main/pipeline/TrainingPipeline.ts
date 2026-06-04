/**
 * TrainingPipeline.ts
 *
 * 4D Gaussian Splatting 트레이닝 파이프라인 오케스트레이터.
 * Electron 메인 프로세스에서 실행됩니다.
 */

import { BrowserWindow } from 'electron';
import * as path from 'path';
import {
  StageContext,
  stageValidate,
  stageExtract,
  stageColmap,
  stageInit,
  stageOptimize,
  stageExport,
} from './stages';

export type TrainingStage =
  | 'idle' | 'validate' | 'extract' | 'colmap'
  | 'init' | 'optimize' | 'export' | 'done' | 'error' | 'cancelled';

export interface PipelineResult {
  success: boolean;
  folderPath: string;
  plyFiles: string[];
  fileCount: number;
  error?: string;
}

export class TrainingPipeline {
  private abortController: AbortController | null = null;
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /** 파이프라인 취소 */
  cancel(): void {
    this.abortController?.abort();
  }

  /** 파이프라인 실행 */
  async run(videoPath: string): Promise<PipelineResult> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // 작업 디렉토리 구성 (입력 파일 옆에 타임스탬프 폴더 생성)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const workDir   = path.join(path.dirname(videoPath), `4dgs_${baseName}_${timestamp}`);
    const framesDir = path.join(workDir, 'frames');
    const colmapDir = path.join(workDir, 'colmap');
    const gsDir     = path.join(workDir, 'gs');

    const ctx: StageContext = {
      videoPath,
      workDir,
      framesDir,
      colmapDir,
      gsDir,
      signal,
      onLog: (message, level = 'info') => {
        this.send('training-log', { message, level, timestamp: Date.now() });
      },
      onProgress: (progress, status) => {
        this.send('training-progress', progress, status);
      },
    };

    const stages: Array<{
      name: TrainingStage;
      label: string;
      fn: (ctx: StageContext) => Promise<unknown>;
    }> = [
      { name: 'validate', label: '파일 검증',              fn: stageValidate },
      { name: 'extract',  label: '프레임 추출',            fn: stageExtract  },
      { name: 'colmap',   label: 'COLMAP SfM',             fn: stageColmap   },
      { name: 'init',     label: 'GS 초기화',              fn: stageInit     },
      { name: 'optimize', label: '4DGS 최적화',            fn: stageOptimize },
      { name: 'export',   label: 'PLY 수집',               fn: stageExport   },
    ];

    try {
      let exportResult: { folderPath: string; plyFiles: string[] } | null = null;

      for (const stage of stages) {
        if (signal.aborted) {
          this.send('training-stage', 'cancelled');
          return { success: false, folderPath: '', plyFiles: [], fileCount: 0, error: 'CANCELLED' };
        }

        this.send('training-stage', stage.name);
        ctx.onLog(`\n━━━ [${stage.label}] ━━━`);

        const result = await stage.fn(ctx);

        if (stage.name === 'export' && result) {
          exportResult = result as { folderPath: string; plyFiles: string[] };
        }
      }

      this.send('training-stage', 'done');

      if (!exportResult) {
        throw new Error('Export 단계에서 결과를 반환하지 않았습니다.');
      }

      return {
        success: true,
        folderPath: exportResult.folderPath,
        plyFiles: exportResult.plyFiles,
        fileCount: exportResult.plyFiles.length,
      };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message === 'CANCELLED') {
        this.send('training-stage', 'cancelled');
        return { success: false, folderPath: '', plyFiles: [], fileCount: 0, error: 'CANCELLED' };
      }

      ctx.onLog(`\n✗ 오류: ${message}`, 'error');
      this.send('training-stage', 'error');
      this.send('training-error', message);

      return { success: false, folderPath: '', plyFiles: [], fileCount: 0, error: message };
    }
  }

  private send(channel: string, ...args: unknown[]): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args);
    }
  }
}
