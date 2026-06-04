'use client';

import * as React from 'react';
import { useRef, useEffect } from 'react';
import { SplatRenderer, useGaussianStore, parsePly } from '@/entities/gaussian';
import { TimelineBar } from '@/features/timeline-control';
import { VideoImporter } from '@/features/video-import';
import { TrainingPanel } from '@/features/training-pipeline';

export function SplatViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);

  const {
    currentFrame,
    isPlaying,
    setFrame,
    metadata,
    sequenceLoaded,
    isTraining,
    trainingStage,
    plyFiles,
  } = useGaussianStore();
  const requestRef = useRef<number>(null);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new SplatRenderer(canvasRef.current);
    rendererRef.current = renderer;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // PLY 파일 로드: 시퀀스 로드 완료 & PLY 파일 목록이 있을 때 현재 프레임 로드
  useEffect(() => {
    if (!sequenceLoaded || !rendererRef.current || plyFiles.length === 0) return;

    const frameIdx = Math.min(currentFrame, plyFiles.length - 1);
    const plyPath = plyFiles[frameIdx];
    if (!plyPath) return;

    // Electron 환경: file:// 프로토콜로 로컬 파일을 fetch
    const url = `file:///${plyPath.replace(/\\/g, '/')}`;

    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => parsePly(buf))
      .then((splat) => {
        rendererRef.current?.loadPlyFrame(splat);
      })
      .catch((err) => {
        console.warn(`PLY 로드 실패 (frame ${frameIdx}):`, err);
      });
  // currentFrame이 바뀔 때마다 해당 PLY 로드
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, plyFiles, sequenceLoaded]);

  // Animation loop
  useEffect(() => {
    if (!rendererRef.current) return;

    const totalFrames = metadata?.frameCount || 100;

    const animate = () => {
      if (isPlaying && sequenceLoaded) {
        setFrame((prev) => (prev + 1) % totalFrames);
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, sequenceLoaded, setFrame, metadata?.frameCount]);

  // Mock 프레임 업데이트 (PLY 미로드 시)
  useEffect(() => {
    if (rendererRef.current && sequenceLoaded && plyFiles.length === 0) {
      const totalFrames = metadata?.frameCount || 100;
      rendererRef.current.updateFrame(currentFrame, totalFrames);
    }
  }, [currentFrame, sequenceLoaded, metadata?.frameCount, plyFiles.length]);

  const showEmptyState = !sequenceLoaded && !isTraining &&
    trainingStage !== 'error' && trainingStage !== 'cancelled';

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden" ref={containerRef}>
      {/* Ambient background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none" />

      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none z-10"
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-20">

        {/* Top Header Bar */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 px-5 py-3 rounded-2xl shadow-lg">
            <h1 className="text-white/95 font-semibold tracking-tight text-base">4D GS Free-View Player</h1>
            <p className="text-white/60 text-xs mt-0.5 font-medium">Premium Volumetric Video</p>
          </div>
          <VideoImporter />
        </div>

        {/* Empty State */}
        {showEmptyState && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 px-10 py-8 rounded-3xl flex flex-col items-center gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-white/80 animate-spin" />
              <p className="text-white/90 font-medium tracking-wide">MP4 영상을 선택하여 4D GS 트레이닝을 시작하세요</p>
              <p className="text-white/40 text-xs text-center">
                ffmpeg · COLMAP · Python 4DGS 환경이 필요합니다 (Windows + NVIDIA GPU)
              </p>
            </div>
          </div>
        )}

        {/* Training Panel */}
        <TrainingPanel />

        {/* Bottom Timeline Bar */}
        <div className="w-full max-w-4xl mx-auto pointer-events-auto">
          <TimelineBar />
        </div>
      </div>
    </div>
  );
}
