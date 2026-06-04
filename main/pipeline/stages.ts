/**
 * stages.ts
 *
 * 4D Gaussian Splatting 트레이닝 파이프라인의 각 스테이지를 정의합니다.
 * 각 스테이지는 독립적인 함수로 실제 CLI 도구를 child_process.spawn으로 실행합니다.
 *
 * 환경 요구 사항 (Windows, NVIDIA GPU):
 *   - ffmpeg (PATH에 등록)
 *   - COLMAP (PATH에 등록, 또는 COLMAP_BIN 환경변수)
 *   - Python 3.10+ (PATH에 등록)
 *   - 4D Gaussian Splatting 학습 스크립트 경로 (4DGS_SCRIPT_PATH 환경변수)
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface StageContext {
  videoPath: string;
  workDir: string;      // 작업 디렉토리 (videoPath 옆)
  framesDir: string;    // 추출된 프레임
  colmapDir: string;    // COLMAP 출력
  gsDir: string;        // Gaussian Splatting 출력 (PLY 파일들)
  signal: AbortSignal;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (progress: number, status: string) => void;
}

// ─────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────

/** AbortSignal을 지원하는 child_process 실행기 */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; signal: AbortSignal; onLog: (l: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(cmd, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true,
    });

    opts.onLog(`[CMD] ${cmd} ${args.join(' ')}`);

    proc.stdout?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(opts.onLog);
    });
    proc.stderr?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(opts.onLog);
    });

    proc.on('close', (code) => {
      if (opts.signal.aborted) return reject(new Error('CANCELLED'));
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });

    proc.on('error', (err) => reject(err));

    // 취소 처리
    opts.signal.addEventListener('abort', () => {
      proc.kill('SIGTERM');
      reject(new Error('CANCELLED'));
    }, { once: true });
  });
}

/** 커맨드가 PATH에 존재하는지 확인 */
function commandExists(cmd: string): boolean {
  try {
    const result = require('child_process').spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [cmd],
      { encoding: 'utf8' },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────
// Stage 1: validate — 입력 파일 및 환경 검증
// ─────────────────────────────────────────────────────

export async function stageValidate(ctx: StageContext): Promise<void> {
  ctx.onLog('입력 파일 및 실행 환경을 검증합니다.');
  ctx.onProgress(2, '입력 파일 검증 중...');

  // 입력 파일 존재 확인
  if (!fs.existsSync(ctx.videoPath)) {
    throw new Error(`입력 파일을 찾을 수 없습니다: ${ctx.videoPath}`);
  }

  const stat = fs.statSync(ctx.videoPath);
  ctx.onLog(`입력 파일: ${ctx.videoPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // 필수 도구 확인
  const missing: string[] = [];

  if (!commandExists('ffmpeg')) {
    missing.push('ffmpeg (https://ffmpeg.org/download.html)');
  } else {
    ctx.onLog('✓ ffmpeg 확인됨');
  }

  if (!commandExists('colmap')) {
    const colmapBin = process.env.COLMAP_BIN;
    if (!colmapBin || !fs.existsSync(colmapBin)) {
      missing.push('COLMAP (https://colmap.github.io) — PATH 또는 COLMAP_BIN 환경변수 설정 필요');
    } else {
      ctx.onLog(`✓ COLMAP 확인됨 (COLMAP_BIN=${colmapBin})`);
    }
  } else {
    ctx.onLog('✓ COLMAP 확인됨');
  }

  if (!commandExists('python') && !commandExists('python3')) {
    missing.push('Python 3.10+ (https://www.python.org)');
  } else {
    ctx.onLog('✓ Python 확인됨');
  }

  const scriptPath = process.env['4DGS_SCRIPT_PATH'];
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    missing.push(
      '4DGS 학습 스크립트 (4DGS_SCRIPT_PATH 환경변수에 train.py 경로를 설정하세요)',
    );
  } else {
    ctx.onLog(`✓ 4DGS 스크립트 확인됨: ${scriptPath}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `다음 도구가 설치되지 않았거나 경로가 설정되지 않았습니다:\n` +
        missing.map((m) => `  • ${m}`).join('\n'),
    );
  }

  // 작업 디렉토리 생성
  for (const dir of [ctx.workDir, ctx.framesDir, ctx.colmapDir, ctx.gsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  ctx.onLog(`작업 디렉토리: ${ctx.workDir}`);
  ctx.onProgress(5, '환경 검증 완료');
}

// ─────────────────────────────────────────────────────
// Stage 2: extract — ffmpeg 프레임 추출
// ─────────────────────────────────────────────────────

export async function stageExtract(ctx: StageContext): Promise<void> {
  ctx.onLog('ffmpeg으로 프레임을 추출합니다.');
  ctx.onProgress(8, 'ffmpeg 프레임 추출 중...');

  // 프레임 추출: 초당 2fps (4DGS 트레이닝에 충분)
  // 필요 시 FPS를 높이려면 -r 값을 조정하세요
  const fps = process.env['4DGS_EXTRACT_FPS'] ?? '2';

  await runProcess(
    'ffmpeg',
    [
      '-y',                         // 덮어쓰기 허용
      '-i', ctx.videoPath,          // 입력
      '-r', fps,                    // 추출 FPS
      '-q:v', '1',                  // 최고 품질
      '-f', 'image2',
      path.join(ctx.framesDir, 'frame_%06d.jpg'),
    ],
    {
      cwd: ctx.workDir,
      signal: ctx.signal,
      onLog: ctx.onLog,
    },
  );

  const extracted = fs.readdirSync(ctx.framesDir).filter((f) => f.endsWith('.jpg'));
  ctx.onLog(`✓ 프레임 추출 완료: ${extracted.length}장`);

  if (extracted.length < 10) {
    throw new Error(
      `추출된 프레임 수가 너무 적습니다 (${extracted.length}장). ` +
        '10장 이상의 프레임이 필요합니다.',
    );
  }

  ctx.onProgress(20, `${extracted.length}개 프레임 추출 완료`);
}

// ─────────────────────────────────────────────────────
// Stage 3: colmap — SfM (카메라 포즈 추정)
// ─────────────────────────────────────────────────────

export async function stageColmap(ctx: StageContext): Promise<void> {
  ctx.onLog('COLMAP SfM를 실행합니다 (특징점 추출 → 매칭 → 재건)');
  ctx.onProgress(22, 'COLMAP 특징점 추출 중...');

  const colmapCmd = commandExists('colmap')
    ? 'colmap'
    : (process.env.COLMAP_BIN ?? 'colmap');

  const dbPath = path.join(ctx.colmapDir, 'database.db');
  const sparseDir = path.join(ctx.colmapDir, 'sparse');
  fs.mkdirSync(sparseDir, { recursive: true });

  // 1. Feature extraction
  await runProcess(
    colmapCmd,
    [
      'feature_extractor',
      '--database_path', dbPath,
      '--image_path', ctx.framesDir,
      '--ImageReader.single_camera', '1',
      '--SiftExtraction.use_gpu', '1',
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog },
  );
  ctx.onProgress(30, 'COLMAP 특징점 매칭 중...');

  // 2. Feature matching
  await runProcess(
    colmapCmd,
    [
      'exhaustive_matcher',
      '--database_path', dbPath,
      '--SiftMatching.use_gpu', '1',
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog },
  );
  ctx.onProgress(40, 'COLMAP 3D 재건 (Mapper) 중...');

  // 3. Sparse reconstruction
  await runProcess(
    colmapCmd,
    [
      'mapper',
      '--database_path', dbPath,
      '--image_path', ctx.framesDir,
      '--output_path', sparseDir,
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog },
  );

  // 4. Convert to TXT format for GS training script
  const model0 = path.join(sparseDir, '0');
  if (!fs.existsSync(model0)) {
    throw new Error('COLMAP 재건에 실패했습니다. 카메라 포즈를 추정할 수 없습니다.');
  }

  const txtDir = path.join(ctx.colmapDir, 'sparse_txt');
  fs.mkdirSync(txtDir, { recursive: true });

  await runProcess(
    colmapCmd,
    [
      'model_converter',
      '--input_path', model0,
      '--output_path', txtDir,
      '--output_type', 'TXT',
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog },
  );

  ctx.onLog('✓ COLMAP SfM 완료');
  ctx.onProgress(50, 'COLMAP 완료 — 카메라 포즈 추정 성공');
}

// ─────────────────────────────────────────────────────
// Stage 4: init — Gaussian 초기화 (3DGS 데이터셋 구조 생성)
// ─────────────────────────────────────────────────────

export async function stageInit(ctx: StageContext): Promise<void> {
  ctx.onLog('3D Gaussian Splatting 초기화를 준비합니다.');
  ctx.onProgress(52, '데이터셋 구조 초기화 중...');

  // 4DGS 학습 스크립트가 기대하는 디렉토리 구조를 만들어줍니다:
  // gsDir/
  //   images/ → framesDir 복사
  //   sparse/ → colmapDir/sparse_txt 링크
  const gsImagesDir = path.join(ctx.gsDir, 'images');
  const gsSparseDir = path.join(ctx.gsDir, 'sparse', '0');
  fs.mkdirSync(gsImagesDir, { recursive: true });
  fs.mkdirSync(gsSparseDir, { recursive: true });

  // 프레임 복사
  const frames = fs.readdirSync(ctx.framesDir).filter((f) => f.endsWith('.jpg'));
  for (const frame of frames) {
    fs.copyFileSync(
      path.join(ctx.framesDir, frame),
      path.join(gsImagesDir, frame),
    );
  }
  ctx.onLog(`✓ 이미지 ${frames.length}장 복사 완료`);

  // COLMAP TXT 파일 복사
  const txtDir = path.join(ctx.colmapDir, 'sparse_txt');
  for (const f of ['cameras.txt', 'images.txt', 'points3D.txt']) {
    const src = path.join(txtDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(gsSparseDir, f));
    }
  }
  ctx.onLog('✓ COLMAP 데이터 복사 완료');
  ctx.onProgress(58, '초기화 완료');
}

// ─────────────────────────────────────────────────────
// Stage 5: optimize — 4DGS 학습 실행
// ─────────────────────────────────────────────────────

export async function stageOptimize(ctx: StageContext): Promise<void> {
  ctx.onLog('4D Gaussian Splatting 학습을 시작합니다.');
  ctx.onProgress(60, '4DGS 모델 최적화 중...');

  const scriptPath = process.env['4DGS_SCRIPT_PATH']!;
  const python = commandExists('python3') ? 'python3' : 'python';
  const iterations = process.env['4DGS_ITERATIONS'] ?? '30000';

  // 진행도 파싱: 학습 스크립트의 stdout에서 이터레이션 로그를 파싱합니다
  let lastProgress = 60;

  await runProcess(
    python,
    [
      scriptPath,
      '-s', ctx.gsDir,
      '-m', path.join(ctx.gsDir, 'output'),
      '--iterations', iterations,
      '--port', '6009',
    ],
    {
      cwd: path.dirname(scriptPath),
      signal: ctx.signal,
      onLog: (line: string) => {
        ctx.onLog(line);
        // 이터레이션 파싱: "Iteration 15000/30000" 패턴
        const m = line.match(/[Ii]teration[:\s]+(\d+)[\/\s]+(\d+)/);
        if (m) {
          const curr = parseInt(m[1], 10);
          const total = parseInt(m[2], 10);
          const pct = 60 + Math.round((curr / total) * 30); // 60~90%
          if (pct > lastProgress) {
            lastProgress = pct;
            ctx.onProgress(pct, `학습 중... (${curr} / ${total} iters)`);
          }
        }
      },
    },
  );

  ctx.onLog('✓ 4DGS 최적화 완료');
  ctx.onProgress(90, '최적화 완료 — PLY 파일 탐색 중');
}

// ─────────────────────────────────────────────────────
// Stage 6: export — PLY 파일 수집
// ─────────────────────────────────────────────────────

export interface ExportResult {
  folderPath: string;
  plyFiles: string[];
}

export async function stageExport(ctx: StageContext): Promise<ExportResult> {
  ctx.onLog('출력 PLY 파일을 수집합니다.');
  ctx.onProgress(92, 'PLY 파일 수집 중...');

  const outputDir = path.join(ctx.gsDir, 'output');
  const plyFiles = findPlyFiles(outputDir);

  if (plyFiles.length === 0) {
    throw new Error(
      `PLY 출력 파일을 찾을 수 없습니다. 경로: ${outputDir}\n` +
        '4DGS 학습 스크립트가 PLY 파일을 올바르게 출력했는지 확인하세요.',
    );
  }

  ctx.onLog(`✓ PLY 파일 ${plyFiles.length}개 발견`);
  plyFiles.slice(0, 5).forEach((f) => ctx.onLog(`  - ${path.basename(f)}`));

  ctx.onProgress(100, `트레이닝 완료 — PLY ${plyFiles.length}개 생성`);

  return { folderPath: outputDir, plyFiles };
}

/** 디렉토리를 재귀 탐색하여 PLY 파일 목록을 반환 */
function findPlyFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ply')) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// commandExists를 외부에서도 쓸 수 있도록 재내보내기
export { commandExists };
