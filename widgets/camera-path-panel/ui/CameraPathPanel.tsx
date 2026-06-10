'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import {
  CameraPathViewport,
  CameraPathTimeline,
  KeyframeControls,
} from '@/features/camera-path-editor';
import { useCameraPathStore } from '@/entities/camera-path';
import { useGaussianStore } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

interface CameraPathPanelProps {
  onBack: () => void;
}

interface RenderState {
  status: 'idle' | 'running' | 'done' | 'error';
  cur: number;
  total: number;
  outputDir: string;
  error: string;
  logs: string[];
}

export function CameraPathPanel({ onBack }: CameraPathPanelProps) {
  const { path } = useCameraPathStore();
  const { folderPath } = useGaussianStore();

  const [render, setRender] = useState<RenderState>({
    status: 'idle', cur: 0, total: 0, outputDir: '', error: '', logs: [],
  });
  const logRef = useRef<HTMLDivElement>(null);

  // ── IPC listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI?.onRenderProgress((cur, total) => {
      setRender(s => ({ ...s, cur, total }));
    });
    window.electronAPI?.onRenderLog((msg) => {
      setRender(s => ({ ...s, logs: [...s.logs.slice(-99), msg] }));
    });
    window.electronAPI?.onRenderDone((outputDir) => {
      setRender(s => ({ ...s, status: 'done', outputDir }));
    });
    window.electronAPI?.onRenderError((err) => {
      setRender(s => ({ ...s, status: 'error', error: err }));
    });
    return () => window.electronAPI?.removeAllRenderListeners?.();
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [render.logs]);

  // ── Render 4D ────────────────────────────────────────────────────────────
  const handleRender4D = async () => {
    if (!folderPath) {
      alert('output 폴더가 로드되지 않았습니다. 먼저 Load Output을 실행하세요.');
      return;
    }
    if (path.keyframes.length < 2) {
      alert('키프레임이 2개 이상 필요합니다.');
      return;
    }

    const outputDir = `${folderPath}\\render_${Date.now()}`;
    const sourcePath = folderPath.replace(/[\\/]output$/, '');
    const pathJsonContent = JSON.stringify({
      duration: path.duration,
      fps: path.fps,
      totalFrames: Math.round(path.duration * path.fps),
      keyframes: path.keyframes,
    });

    setRender({ status: 'running', cur: 0, total: Math.round(path.duration * path.fps), outputDir, error: '', logs: [] });

    const result = await window.electronAPI?.startRender({
      modelPath: folderPath,
      sourcePath,
      pathJsonContent,
      outputDir,
      width: 1280,
      height: 720,
      iteration: -1,
    });

    if (result && !result.success && render.status !== 'done') {
      setRender(s => ({ ...s, status: 'error', error: result.error ?? '알 수 없는 오류' }));
    }
  };

  const handleCancel = () => {
    window.electronAPI?.cancelRender();
    setRender(s => ({ ...s, status: 'idle' }));
  };

  const pct = render.total > 0 ? Math.round((render.cur / render.total) * 100) : 0;

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 text-white overflow-hidden">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 bg-white/5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-white/50 hover:text-white">
            ← Back
          </Button>
          <div>
            <h1 className="font-semibold tracking-tight text-sm">Camera Path Editor</h1>
            <p className="text-white/40 text-xs">4D Gaussian Splatting</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs">
            {path.keyframes.length} keyframe{path.keyframes.length !== 1 ? 's' : ''} · {path.duration}s · {path.fps}fps
          </span>

          {render.status === 'running' ? (
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-red-400 hover:text-red-300">
              Cancel
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleRender4D}
              disabled={path.keyframes.length < 2}
              className="bg-purple-600 hover:bg-purple-500 border-purple-400/30"
            >
              Render 4D Video
            </Button>
          )}
        </div>
      </header>

      {/* ── 본문: 뷰포트 + 우측 패널 ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 relative">
          <CameraPathViewport />

          {/* 렌더링 진행 오버레이 */}
          {render.status === 'running' && (
            <div className="absolute inset-x-0 bottom-16 mx-auto w-96 bg-black/80 backdrop-blur border border-white/10 rounded-xl p-4 z-50">
              <div className="flex justify-between text-xs text-white/60 mb-2">
                <span>Rendering 4D Video...</span>
                <span>{render.cur} / {render.total} frames ({pct}%)</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div
                ref={logRef}
                className="mt-3 h-20 overflow-y-auto text-[10px] text-white/30 font-mono space-y-0.5"
              >
                {render.logs.slice(-30).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          )}

          {/* 완료 알림 */}
          {render.status === 'done' && (
            <div className="absolute inset-x-0 bottom-16 mx-auto w-96 bg-green-950/80 backdrop-blur border border-green-400/30 rounded-xl p-4 z-50 flex items-center justify-between">
              <div>
                <p className="text-green-300 text-sm font-medium">렌더링 완료!</p>
                <p className="text-green-400/60 text-xs mt-0.5 truncate max-w-[240px]">{render.outputDir}</p>
              </div>
              <Button
                variant="ghost" size="sm"
                className="text-green-400 hover:text-green-300"
                onClick={() => setRender(s => ({ ...s, status: 'idle' }))}
              >
                ✕
              </Button>
            </div>
          )}

          {/* 오류 알림 */}
          {render.status === 'error' && (
            <div className="absolute inset-x-0 bottom-16 mx-auto w-96 bg-red-950/80 backdrop-blur border border-red-400/30 rounded-xl p-4 z-50 flex items-center justify-between">
              <div>
                <p className="text-red-300 text-sm font-medium">렌더링 실패</p>
                <p className="text-red-400/60 text-xs mt-0.5">{render.error}</p>
              </div>
              <Button
                variant="ghost" size="sm"
                className="text-red-400 hover:text-red-300"
                onClick={() => setRender(s => ({ ...s, status: 'idle' }))}
              >
                ✕
              </Button>
            </div>
          )}
        </div>

        <KeyframeControls />
      </div>

      {/* ── 하단 타임라인 ─────────────────────────────────────────────── */}
      <CameraPathTimeline />
    </div>
  );
}
