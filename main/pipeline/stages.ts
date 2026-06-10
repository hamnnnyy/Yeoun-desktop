/**
 * stages.ts — 4D Gaussian Splatting 트레이닝 파이프라인 스테이지 정의
 *
 * multipleview 포맷 기준 (4DGaussians 공식 파이프라인):
 *   gsDir/
 *     cam01/ cam02/ …   ← 각 카메라의 전체 프레임 (frame_00001.jpg …)
 *     sparse_/           ← COLMAP 카메라 캘리브레이션 (images.bin, cameras.bin)
 *     points3D_multipleview.ply   ← 다운샘플된 초기 포인트 클라우드
 *     poses_bounds_multipleview.npy ← LLFF 형식 카메라 포즈 + 뎁스 범위
 *
 * 환경 요구사항:
 *   - ffmpeg (PATH)
 *   - COLMAP (PATH 또는 COLMAP_BIN 환경변수)
 *   - Python 3.10+ (PATH)
 *   - 4DGS_SCRIPT_PATH 환경변수 → 4DGaussians/train.py 경로
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface StageContext {
  videoPaths: string[];   // 멀티뷰 입력 영상 (cam01, cam02 …)
  workDir: string;        // 전체 작업 디렉토리
  gsDir: string;          // 4DGaussians 데이터셋 루트 (= 최종 출력)
  colmapTmpDir: string;   // COLMAP 임시 작업 디렉토리
  signal: AbortSignal;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (progress: number, status: string) => void;
}

// ─────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────

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

    opts.signal.addEventListener('abort', () => {
      proc.kill('SIGTERM');
      reject(new Error('CANCELLED'));
    }, { once: true });
  });
}

export function commandExists(cmd: string): boolean {
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
// Stage 1: validate
// ─────────────────────────────────────────────────────

export async function stageValidate(ctx: StageContext): Promise<void> {
  ctx.onLog('입력 파일 및 실행 환경을 검증합니다.');
  ctx.onProgress(2, '입력 파일 검증 중...');

  if (ctx.videoPaths.length < 2) {
    throw new Error('멀티뷰 학습에는 최소 2개 이상의 영상이 필요합니다.');
  }

  let totalSize = 0;
  for (const vp of ctx.videoPaths) {
    if (!fs.existsSync(vp)) throw new Error(`입력 파일을 찾을 수 없습니다: ${vp}`);
    totalSize += fs.statSync(vp).size;
  }
  ctx.onLog(`입력 파일 ${ctx.videoPaths.length}개 (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  ctx.videoPaths.forEach((vp, i) =>
    ctx.onLog(`  [cam${String(i + 1).padStart(2, '0')}] ${vp}`),
  );

  const missing: string[] = [];
  if (!commandExists('ffmpeg'))
    missing.push('ffmpeg');
  else
    ctx.onLog('✓ ffmpeg');

  const colmapBin = process.env.COLMAP_BIN;
  if (!commandExists('colmap') && (!colmapBin || !fs.existsSync(colmapBin)))
    missing.push('COLMAP (PATH 또는 COLMAP_BIN 환경변수)');
  else
    ctx.onLog('✓ COLMAP');

  if (!commandExists('python') && !commandExists('python3'))
    missing.push('Python 3.10+');
  else
    ctx.onLog('✓ Python');

  const scriptPath = process.env['4DGS_SCRIPT_PATH'];
  if (!scriptPath || !fs.existsSync(scriptPath))
    missing.push('4DGS_SCRIPT_PATH 환경변수 (train.py 경로)');
  else
    ctx.onLog(`✓ 4DGS 스크립트: ${scriptPath}`);

  if (missing.length > 0)
    throw new Error(`다음 도구가 없습니다:\n${missing.map(m => `  • ${m}`).join('\n')}`);

  for (const dir of [ctx.workDir, ctx.gsDir, ctx.colmapTmpDir])
    fs.mkdirSync(dir, { recursive: true });

  ctx.onLog(`작업 디렉토리: ${ctx.workDir}`);
  ctx.onProgress(5, '환경 검증 완료');
}

// ─────────────────────────────────────────────────────
// Stage 2: extract — ffmpeg 프레임 추출
// 출력: gsDir/cam01/frame_00001.jpg  (1-indexed, %05d)
// ─────────────────────────────────────────────────────

export async function stageExtract(ctx: StageContext): Promise<void> {
  ctx.onLog('ffmpeg으로 프레임을 추출합니다.');
  ctx.onProgress(8, 'ffmpeg 프레임 추출 중...');

  const fps = process.env['4DGS_EXTRACT_FPS'] ?? '2';
  let totalExtracted = 0;

  for (let i = 0; i < ctx.videoPaths.length; i++) {
    // 4DGaussians multipleview 규칙: cam01, cam02 … (1-indexed)
    const camId  = `cam${String(i + 1).padStart(2, '0')}`;
    const camDir = path.join(ctx.gsDir, camId);
    fs.mkdirSync(camDir, { recursive: true });

    ctx.onLog(`[${camId}] 프레임 추출: ${path.basename(ctx.videoPaths[i])}`);
    await runProcess(
      'ffmpeg',
      [
        '-y', '-i', ctx.videoPaths[i],
        '-r', fps,
        '-q:v', '1',
        '-f', 'image2',
        path.join(camDir, 'frame_%05d.jpg'),  // frame_00001.jpg …
      ],
      { cwd: ctx.workDir, signal: ctx.signal, onLog: ctx.onLog },
    );

    const count = fs.readdirSync(camDir).filter(f => f.endsWith('.jpg')).length;
    if (count < 5)
      throw new Error(`[${camId}] 프레임 수 부족 (${count}장, 최소 5장 필요)`);

    ctx.onLog(`✓ [${camId}] ${count}장 추출 완료`);
    totalExtracted += count;

    const pct = 8 + Math.round(((i + 1) / ctx.videoPaths.length) * 12);
    ctx.onProgress(pct, `프레임 추출 중... (${i + 1}/${ctx.videoPaths.length})`);
  }

  ctx.onProgress(20, `총 ${totalExtracted}프레임 추출 완료`);
}

// ─────────────────────────────────────────────────────
// Stage 3: colmap — 첫 프레임만으로 카메라 캘리브레이션
//
// 4DGaussians multipleview 방식:
//   - 각 카메라의 첫 번째 프레임(frame_00001.jpg)만 COLMAP에 사용
//   - 정적 기준 프레임으로 카메라 위치/내부 파라미터 추정
//   - Dense reconstruction → 초기 포인트 클라우드
// ─────────────────────────────────────────────────────

export async function stageColmap(ctx: StageContext): Promise<void> {
  ctx.onLog('COLMAP 카메라 캘리브레이션을 시작합니다 (첫 프레임 기준).');
  ctx.onProgress(22, 'COLMAP 준비 중...');

  const colmapCmd = commandExists('colmap') ? 'colmap' : (process.env.COLMAP_BIN ?? 'colmap');
  const python    = commandExists('python3') ? 'python3' : 'python';
  const scriptDir = path.dirname(process.env['4DGS_SCRIPT_PATH']!);  // 4DGaussians root

  // 1. COLMAP 입력 이미지 준비: 각 카메라의 첫 프레임만 복사 (image1.jpg, image2.jpg …)
  const colmapImagesDir = path.join(ctx.colmapTmpDir, 'images');
  fs.mkdirSync(colmapImagesDir, { recursive: true });

  const camDirs = ctx.videoPaths.map((_, i) => `cam${String(i + 1).padStart(2, '0')}`);
  for (let i = 0; i < camDirs.length; i++) {
    const firstFrame = path.join(ctx.gsDir, camDirs[i], 'frame_00001.jpg');
    if (!fs.existsSync(firstFrame))
      throw new Error(`첫 번째 프레임을 찾을 수 없습니다: ${firstFrame}`);
    fs.copyFileSync(firstFrame, path.join(colmapImagesDir, `image${i + 1}.jpg`));
    ctx.onLog(`  [cam${String(i + 1).padStart(2, '0')}] image${i + 1}.jpg 복사`);
  }
  ctx.onLog(`✓ COLMAP 입력 이미지 ${camDirs.length}장 준비`);

  // 2. COLMAP feature_extractor (GPU 우선, CPU 폴백)
  const dbPath     = path.join(ctx.colmapTmpDir, 'database.db');
  const sparseDir  = path.join(ctx.colmapTmpDir, 'sparse');
  fs.mkdirSync(sparseDir, { recursive: true });

  const useGpu = process.env.COLMAP_USE_GPU !== '0';

  function extractorArgs(gpu: boolean): string[] {
    return [
      'feature_extractor',
      '--database_path', dbPath,
      '--image_path', colmapImagesDir,
      '--ImageReader.single_camera', '1',   // 모든 카메라가 동일한 내부 파라미터 공유
      '--ImageReader.camera_model', 'PINHOLE',
      '--FeatureExtraction.use_gpu', gpu ? '1' : '0',
    ];
  }

  ctx.onProgress(25, 'COLMAP 특징점 추출 중...');
  try {
    await runProcess(colmapCmd, extractorArgs(useGpu), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  } catch (e) {
    if (!useGpu) throw e;
    ctx.onLog('[WARN] GPU 추출 실패 → CPU로 재시도', 'warn');
    await runProcess(colmapCmd, extractorArgs(false), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  }

  // 3. COLMAP exhaustive_matcher
  ctx.onProgress(30, 'COLMAP 특징점 매칭 중...');
  function matcherArgs(gpu: boolean): string[] {
    return ['exhaustive_matcher', '--database_path', dbPath, '--FeatureMatching.use_gpu', gpu ? '1' : '0'];
  }
  try {
    await runProcess(colmapCmd, matcherArgs(useGpu), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  } catch (e) {
    if (!useGpu) throw e;
    ctx.onLog('[WARN] GPU 매칭 실패 → CPU로 재시도', 'warn');
    await runProcess(colmapCmd, matcherArgs(false), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  }

  // 4. COLMAP mapper (sparse reconstruction)
  ctx.onProgress(35, 'COLMAP 3D 재건 중...');
  await runProcess(
    colmapCmd,
    ['mapper', '--database_path', dbPath, '--image_path', colmapImagesDir, '--output_path', sparseDir],
    { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog },
  );

  const model0 = path.join(sparseDir, '0');
  if (!fs.existsSync(model0))
    throw new Error('COLMAP 재건 실패. 카메라 포즈를 추정할 수 없습니다.');

  ctx.onProgress(40, 'COLMAP 완료 — 포인트 클라우드 생성 중...');

  // 5. Sparse points3D.bin → PLY 변환
  const sparsePlyPath = path.join(ctx.colmapTmpDir, 'points3D_sparse.ply');
  await runProcess(
    python,
    [path.join(scriptDir, 'scripts', 'export_sparse_ply.py'), model0, sparsePlyPath],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog },
  );

  // 6. 포인트 클라우드 다운샘플 → points3D_multipleview.ply
  ctx.onProgress(44, '포인트 클라우드 다운샘플 중...');
  const outputPlyPath = path.join(ctx.gsDir, 'points3D_multipleview.ply');
  await runProcess(
    python,
    [path.join(scriptDir, 'scripts', 'downsample_point.py'), sparsePlyPath, outputPlyPath],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog },
  );
  ctx.onLog(`✓ points3D_multipleview.ply 생성 완료`);

  // 7. COLMAP sparse/0 → gsDir/sparse_ (BIN 포맷)
  const gsSparseDir = path.join(ctx.gsDir, 'sparse_');
  fs.mkdirSync(gsSparseDir, { recursive: true });
  for (const f of ['cameras.bin', 'images.bin', 'points3D.bin']) {
    const src = path.join(model0, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(gsSparseDir, f));
  }
  ctx.onLog('✓ sparse_ 디렉토리 생성 완료');

  ctx.onProgress(48, 'COLMAP 완료');
}

// ─────────────────────────────────────────────────────
// Stage 4: poses — poses_bounds_multipleview.npy 생성
// ─────────────────────────────────────────────────────

export async function stagePoses(ctx: StageContext): Promise<void> {
  ctx.onLog('카메라 포즈 파일을 생성합니다 (LLFF 형식).');
  ctx.onProgress(50, 'poses_bounds 생성 중...');

  const python    = commandExists('python3') ? 'python3' : 'python';
  const scriptDir = path.dirname(process.env['4DGS_SCRIPT_PATH']!);
  const sparseDir = path.join(ctx.gsDir, 'sparse_');
  const outputNpy = path.join(ctx.gsDir, 'poses_bounds_multipleview.npy');

  await runProcess(
    python,
    [path.join(scriptDir, 'scripts', 'gen_poses_bounds.py'), sparseDir, outputNpy],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog },
  );

  ctx.onLog('✓ poses_bounds_multipleview.npy 생성 완료');
  ctx.onProgress(55, '포즈 생성 완료');
}

// ─────────────────────────────────────────────────────
// Stage 5: init — 4DGaussians config 파일 검증
// ─────────────────────────────────────────────────────

export async function stageInit(ctx: StageContext): Promise<void> {
  ctx.onLog('4DGaussians 설정을 확인합니다.');
  ctx.onProgress(57, '설정 확인 중...');

  const scriptDir  = path.dirname(process.env['4DGS_SCRIPT_PATH']!);
  const configPath = path.join(scriptDir, 'arguments', 'multipleview', 'default.py');

  if (!fs.existsSync(configPath))
    throw new Error(`4DGaussians config 파일이 없습니다: ${configPath}\n4DGaussians arguments/multipleview/default.py 파일을 확인하세요.`);

  ctx.onLog(`✓ config: ${configPath}`);
  ctx.onProgress(58, '초기화 완료');
}

// ─────────────────────────────────────────────────────
// Stage 6: optimize — 4DGS 학습 실행
// ─────────────────────────────────────────────────────

export async function stageOptimize(ctx: StageContext): Promise<void> {
  ctx.onLog('4D Gaussian Splatting 학습을 시작합니다.');
  ctx.onProgress(60, '4DGS 모델 최적화 중...');

  const scriptPath = process.env['4DGS_SCRIPT_PATH']!;
  const scriptDir  = path.dirname(scriptPath);
  const python     = commandExists('python3') ? 'python3' : 'python';

  // expname: 작업 디렉토리 이름 기반 (파일 시스템 안전 문자만)
  const expname = `multipleview/${path.basename(ctx.workDir).replace(/[^a-zA-Z0-9_\-]/g, '_')}`;

  let lastProgress = 60;

  await runProcess(
    python,
    [
      scriptPath,
      '-s', ctx.gsDir,
      '-m', path.join(ctx.gsDir, 'output'),
      '--expname', expname,
      '--configs', path.join(scriptDir, 'arguments', 'multipleview', 'default.py'),
      '--port', '6009',
    ],
    {
      cwd: scriptDir,
      signal: ctx.signal,
      onLog: (line: string) => {
        ctx.onLog(line);
        const m = line.match(/[Ii]teration[:\s]+(\d+)[\/\s]+(\d+)/);
        if (m) {
          const curr  = parseInt(m[1], 10);
          const total = parseInt(m[2], 10);
          const pct   = 60 + Math.round((curr / total) * 30);
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
// Stage 7: export — PLY 파일 수집
// ─────────────────────────────────────────────────────

export interface ExportResult {
  folderPath: string;
  plyFiles: string[];
}

export async function stageExport(ctx: StageContext): Promise<ExportResult> {
  ctx.onLog('출력 PLY 파일을 수집합니다.');
  ctx.onProgress(92, 'PLY 파일 수집 중...');

  const outputDir = path.join(ctx.gsDir, 'output');
  const plyFiles  = findPlyFiles(outputDir);

  if (plyFiles.length === 0)
    throw new Error(`PLY 파일을 찾을 수 없습니다: ${outputDir}`);

  ctx.onLog(`✓ PLY 파일 ${plyFiles.length}개 발견`);
  plyFiles.slice(0, 5).forEach(f => ctx.onLog(`  - ${path.basename(f)}`));
  ctx.onProgress(100, `완료 — PLY ${plyFiles.length}개`);

  return { folderPath: outputDir, plyFiles };
}

function findPlyFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ply')) results.push(full);
    }
  }
  walk(dir);
  return results.sort();
}
