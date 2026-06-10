'use client';

import * as React from 'react';
import { useRef, useEffect, useCallback, useState } from 'react';
import { SplatRenderer, useGaussianStore, interpolateCameraPath, FrameBuffer } from '@/entities/gaussian';
import { TimelineBar } from '@/features/timeline-control';
import { VideoImporter } from '@/features/video-import';
import { TrainingPanel } from '@/features/training-pipeline';

export function SplatViewer() {
  const gsContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);

  const {
    currentFrame, isPlaying, setFrame,
    fps, metadata, sequenceLoaded,
    isTraining, trainingStage,
    plyFiles, loadSequence,
    keyframes, addKeyframe,
  } = useGaussianStore();

  const fpsRef = useRef(fps);
  useEffect(() => { fpsRef.current = fps; }, [fps]);

  const frameBufferRef = useRef<FrameBuffer | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportCancelRef = useRef(false);

  // ── Init renderer ──────────────────────────────────────────
  useEffect(() => {
    if (!gsContainerRef.current) return;
    const renderer = new SplatRenderer(gsContainerRef.current);
    rendererRef.current = renderer;
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  // ── FrameBuffer: 시퀀스 로드 시 초기화 ──────────────────────
  useEffect(() => {
    if (!sequenceLoaded || plyFiles.length === 0) return;
    const fb = new FrameBuffer();
    fb.load(plyFiles);
    fb.tick(0);
    frameBufferRef.current = fb;
    return () => { fb.destroy(); frameBufferRef.current = null; };
  }, [sequenceLoaded, plyFiles]);

  // ── Load PLY folder ────────────────────────────────────────
  const handleOpenPlyFolder = useCallback(async () => {
    const result = await window.electronAPI?.openPlySequenceFolder();
    if (!result || result.plyFiles.length === 0) return;
    const name = result.folderPath.split(/[\\/]/).at(-1) ?? 'sequence';
    loadSequence(result.folderPath, {
      name,
      frameCount: result.plyFiles.length,
      fps: 30,
      duration: result.plyFiles.length / 30,
    }, result.plyFiles);
  }, [loadSequence]);

  // ── Manual scrub ───────────────────────────────────────────
  useEffect(() => {
    if (isPlaying || !sequenceLoaded || !rendererRef.current || plyFiles.length === 0) return;
    const frameIdx = Math.min(currentFrame, plyFiles.length - 1);
    if (!plyFiles[frameIdx]) return;

    if (keyframes.length >= 2) {
      const cam = interpolateCameraPath(keyframes, frameIdx);
      if (cam) rendererRef.current.setCameraState(cam.position, cam.target);
    }

    const fb = frameBufferRef.current;
    if (fb) fb.seek(frameIdx);

    let cancelled = false;
    const load = async () => {
      const buf = fb
        ? await fb.waitFor(frameIdx, 500)
        : await window.electronAPI?.readPlyFile(plyFiles[frameIdx]);
      if (!cancelled && buf) rendererRef.current?.loadPlyFrame(buf);
    };
    load().catch((err) => console.warn(`PLY 로드 실패 (frame ${frameIdx}):`, err));
    return () => { cancelled = true; };
  }, [currentFrame, plyFiles, sequenceLoaded, isPlaying, keyframes]);

  // ── Playback loop ──────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !sequenceLoaded || plyFiles.length === 0) return;

    let cancelled = false;
    const totalFrames = plyFiles.length;
    const startFrame = currentFrame;
    const fb = frameBufferRef.current;

    const run = async () => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      let frame = startFrame;

      while (!cancelled) {
        const frameStart = performance.now();

        if (keyframes.length >= 2) {
          const cam = interpolateCameraPath(keyframes, frame);
          if (cam) renderer.setCameraState(cam.position, cam.target);
        }

        try {
          // 버퍼에서 읽기 (이미 캐시됐으면 즉시 반환)
          const buf = fb
            ? await fb.waitFor(frame)
            : await window.electronAPI?.readPlyFile(plyFiles[frame]);
          if (cancelled) break;

          if (buf) {
            await renderer.loadPlyFrame(buf);
            if (cancelled) break;

            frame = (frame + 1) % totalFrames;
            setFrame(frame);
            fb?.tick(frame); // 다음 프리페치 슬롯 채우기

            const elapsed = performance.now() - frameStart;
            const minInterval = 1000 / fpsRef.current;
            if (elapsed < minInterval) {
              await new Promise<void>((r) => setTimeout(r, minInterval - elapsed));
            }
          }
        } catch (err) {
          if (!cancelled) console.warn('PLY playback error:', err);
          break;
        }
      }
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, sequenceLoaded]);

  // ── Add keyframe at current frame ─────────────────────────
  const handleAddKeyframe = useCallback(() => {
    const state = rendererRef.current?.getCameraState();
    if (!state) return;
    addKeyframe({ frame: currentFrame, position: state.position, target: state.target });
  }, [currentFrame, addKeyframe]);

  // ── Export ─────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const renderer = rendererRef.current;
    if (!renderer || plyFiles.length === 0 || keyframes.length < 2) return;

    setIsExporting(true);
    setExportProgress(0);
    exportCancelRef.current = false;

    const totalFrames = plyFiles.length;
    const targetFps = fpsRef.current;
    const size = renderer.getCanvasSize() ?? { width: 1280, height: 720 };

    // Off-screen canvas for frame capture
    const offCanvas = document.createElement('canvas');
    offCanvas.width = size.width;
    offCanvas.height = size.height;
    const ctx = offCanvas.getContext('2d')!;

    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : 'video/webm;codecs=vp9';

    const stream = offCanvas.captureStream(0);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(100); // collect every 100ms

    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (exportCancelRef.current) break;

        // Set interpolated camera
        const cam = interpolateCameraPath(keyframes, frame);
        if (cam) renderer.setCameraState(cam.position, cam.target);

        // Load frame
        const buf = await window.electronAPI?.readPlyFile(plyFiles[frame]);
        if (exportCancelRef.current) break;
        if (buf) {
          await renderer.loadPlyFrame(buf);
          await renderer.waitForRender();
        }

        // Capture rendered frame
        const imageData = renderer.captureFrame();
        if (imageData) {
          ctx.putImageData(imageData, 0, 0);
        }
        stream.getVideoTracks()[0].requestFrame();

        // Pace the recording
        await new Promise<void>((r) => setTimeout(r, 1000 / targetFps));
        setExportProgress(Math.round(((frame + 1) / totalFrames) * 100));
      }
    } finally {
      recorder.stop();
      await new Promise<void>((r) => { recorder.onstop = () => r(); });
      stream.getTracks().forEach((t) => t.stop());

      if (!exportCancelRef.current && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const name = metadata?.name ?? 'export';
        await window.electronAPI?.saveVideo?.(arrayBuffer, `${name}.${ext}`);
      }

      setIsExporting(false);
      setExportProgress(0);
    }
  }, [plyFiles, keyframes, metadata]);

  // ─────────────────────────────────────────────────────────
  const showEmptyState = !sequenceLoaded && !isTraining &&
    trainingStage !== 'error' && trainingStage !== 'cancelled';

  const viewportBtns = [
    { label: '+', title: '줌 인',      fn: () => rendererRef.current?.zoomIn() },
    { label: '−', title: '줌 아웃',    fn: () => rendererRef.current?.zoomOut() },
    { label: '↺', title: '카메라 리셋', fn: () => rendererRef.current?.resetCamera() },
  ] as const;

  return (
    <div className="relative w-full h-full bg-[#060504] overflow-hidden">

      {/* Layer 1 (z-10): WebGL canvas */}
      <div ref={gsContainerRef} className="absolute inset-0 w-full h-full z-10" />

      {/* Layer 2 (z-[15]): Empty state — above canvas, below UI */}
      {showEmptyState && (
        <div className="absolute inset-0 z-15 flex items-center justify-center pointer-events-auto">
          <div className="flex flex-col items-center gap-8">
            <div className="relative flex flex-col items-center select-none">
              <span
                className="absolute -top-10 text-[96px] leading-none font-bold text-[#150F09] pointer-events-none"
                aria-hidden
              >
                餘韻
              </span>
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <h2 className="text-[#EDE5D5] text-4xl font-semibold tracking-[-0.04em] leading-none">여운</h2>
                <p className="text-[#5A5040] text-[11px] tracking-[0.14em] uppercase">학내 공연 4D 자유 시점 영상 서비스</p>
              </div>
            </div>

            <div className="w-px h-8 bg-[#2A2218]" />

            <div className="flex flex-col gap-2 w-60">
              <button
                onClick={handleOpenPlyFolder}
                className="w-full px-5 py-2.5 rounded-[2px] bg-transparent border border-[#C4A055]/35 text-[#C4A055] hover:bg-[#C4A055]/8 hover:border-[#C4A055]/60 text-sm tracking-wide transition-all duration-200"
              >
                PLY 시퀀스 폴더 열기
              </button>

              <div className="flex items-center gap-3 my-0.5">
                <div className="flex-1 h-px bg-[#1E1A14]" />
                <span className="text-[#2A2218] text-[10px] tracking-[0.15em] uppercase">or</span>
                <div className="flex-1 h-px bg-[#1E1A14]" />
              </div>

              <VideoImporter />
            </div>

            <p className="text-[#2A2218] text-[10px] tracking-widest text-center mt-2">
              막이 내린 뒤, 그 무대로 다시
            </p>
          </div>
        </div>
      )}

      {/* Layer 3 (z-20): Header */}
      <div className="absolute top-0 left-0 right-0 p-5 z-20 pointer-events-none">
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-[#EDE5D5] font-semibold tracking-[-0.04em] text-lg leading-none">여운</h1>
              <span className="text-[#C4A055]/35 text-xl leading-none font-light tracking-wider" aria-hidden>餘韻</span>
            </div>
            <p className="text-[#3A3530] text-[10px] tracking-widest uppercase font-medium">4D Free-View Player</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Viewport zoom controls */}
            <div className="flex gap-1">
              {viewportBtns.map(({ label, title, fn }) => (
                <button key={title} title={title} onClick={fn}
                  className="w-7 h-7 rounded-[2px] bg-[#0A0806]/80 backdrop-blur-sm border border-[#2A2218] text-[#5A5040] hover:text-[#EDE5D5] hover:border-[#C4A055]/30 transition-all duration-200 text-sm flex items-center justify-center select-none">
                  {label}
                </button>
              ))}
            </div>

            {sequenceLoaded && (
              <>
                <div className="w-px h-4 bg-[#2A2218]" />
                <button onClick={handleOpenPlyFolder}
                  className="bg-[#0A0806]/80 backdrop-blur-sm border border-[#2A2218] px-3 py-1.5 rounded-[2px] text-[#5A5040] hover:text-[#EDE5D5] hover:border-[#C4A055]/30 text-xs tracking-wide transition-all duration-200">
                  폴더 변경
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Layer 3 (z-20): Timeline */}
      <div className="absolute bottom-0 left-0 right-0 p-5 z-20 pointer-events-none">
        <div className="w-full max-w-4xl mx-auto pointer-events-auto">
          <TimelineBar
            onAddKeyframe={sequenceLoaded ? handleAddKeyframe : undefined}
            onExport={sequenceLoaded ? handleExport : undefined}
            isExporting={isExporting}
          />
        </div>
      </div>

      {/* Layer 4 (z-30): Training panel (manages its own absolute positioning) */}
      <TrainingPanel />

      {/* Layer 5 (z-40): Export progress overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#060504]/80 backdrop-blur-sm pointer-events-auto">
          <div className="flex flex-col items-center gap-5 w-72">
            <div className="flex flex-col items-center gap-1">
              <p className="text-[#EDE5D5] text-sm font-medium tracking-wide">내보내는 중</p>
              <p className="text-[#5A5040] text-xs">프레임 캡처 및 인코딩...</p>
            </div>

            <div className="w-full h-px bg-[#1E1A14] relative overflow-hidden rounded-full">
              <div
                className="absolute inset-y-0 left-0 bg-[#C4A055] transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between w-full">
              <span className="text-[#C4A055] text-xs font-mono">{exportProgress}%</span>
              <button
                onClick={() => { exportCancelRef.current = true; }}
                className="text-[#5A5040] hover:text-[#EDE5D5] text-xs border border-[#2A2218] hover:border-[#C4A055]/25 px-3 py-1 rounded-[2px] transition-all"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
