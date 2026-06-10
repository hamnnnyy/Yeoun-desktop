'use client';

import * as React from 'react';
import { useRef, useCallback, useState } from 'react';
import { useCameraPathStore } from '@/entities/camera-path';
import { cn } from '@/shared/lib/utils';

const SCENE_H = 72; // scene time graph height in px

export function CameraPathTimeline() {
  const { path, selectedId, previewTime, setPreviewTime, selectKeyframe, updateKeyframe } =
    useCameraPathStore();

  const camTrackRef = useRef<HTMLDivElement>(null);
  const sceneTrackRef = useRef<SVGSVGElement>(null);
  const [draggingScene, setDraggingScene] = useState<string | null>(null);

  // ── 출력 타임라인 상의 x좌표 → outputTime ──────────────────────
  const camT = useCallback((clientX: number) => {
    const rect = camTrackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // ── Scene Time 그래프 상의 좌표 → (outputTime, sceneTime) ──────
  const sceneCoords = useCallback((clientX: number, clientY: number) => {
    const rect = sceneTrackRef.current?.getBoundingClientRect();
    if (!rect) return { ot: 0, st: 0 };
    const ot = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const st = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    return { ot, st };
  }, []);

  // ── Camera 트랙 인터랙션 ──────────────────────────────────────
  const handleCamTrackDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).dataset.kf) return;
      setPreviewTime(camT(e.clientX));
      selectKeyframe(null);
      const onMove = (ev: PointerEvent) => setPreviewTime(camT(ev.clientX));
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [camT, setPreviewTime, selectKeyframe],
  );

  const handleKfDragStart = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      selectKeyframe(id);
      e.currentTarget.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => updateKeyframe(id, { outputTime: camT(ev.clientX) });
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [camT, selectKeyframe, updateKeyframe],
  );

  // ── Scene Time 그래프 인터랙션 ────────────────────────────────
  const handleSceneKfDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      selectKeyframe(id);
      setDraggingScene(id);

      const onMove = (ev: MouseEvent) => {
        const { st } = sceneCoords(ev.clientX, ev.clientY);
        updateKeyframe(id, { sceneTime: st });
      };
      const onUp = () => {
        setDraggingScene(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [selectKeyframe, sceneCoords, updateKeyframe],
  );

  // ── Scene Time 그래프 SVG 포인트 계산 ─────────────────────────
  const svgPoints = path.keyframes.map((kf) => ({
    id: kf.id,
    cx: `${kf.outputTime * 100}%`,
    cy: `${(1 - kf.sceneTime) * 100}%`,
    sceneTime: kf.sceneTime,
    outputTime: kf.outputTime,
  }));

  const polylinePoints = svgPoints
    .map((p) => `${p.cx},${p.cy}`)
    .join(' ');

  return (
    <div className="bg-black/50 backdrop-blur border-t border-white/10 px-5 pt-4 pb-3 select-none shrink-0">
      {/* ── Camera Path 트랙 ─────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/40 font-medium">Free Viewpoint</span>
          <span className="text-xs text-white/20">0 → {path.duration}s</span>
        </div>

        <div
          ref={camTrackRef}
          className="relative h-9 bg-white/5 rounded-lg border border-white/10 cursor-pointer overflow-visible"
          onPointerDown={handleCamTrackDown}
        >
          {/* 배경 눈금 */}
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-white/5 pointer-events-none"
              style={{ left: `${((i + 1) / 10) * 100}%` }}
            />
          ))}

          {/* 플레이헤드 */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400/80 pointer-events-none z-10"
            style={{ left: `${previewTime * 100}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-400 rotate-45" />
          </div>

          {/* 키프레임 다이아몬드 */}
          {path.keyframes.map((kf) => (
            <div
              key={kf.id}
              data-kf={kf.id}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20',
                'w-3.5 h-3.5 rotate-45 cursor-grab active:cursor-grabbing transition-colors duration-100',
                kf.id === selectedId
                  ? 'bg-yellow-400 ring-2 ring-yellow-300/60'
                  : 'bg-blue-400 hover:bg-blue-300',
              )}
              style={{ left: `${kf.outputTime * 100}%` }}
              onPointerDown={(e) => handleKfDragStart(e, kf.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Scene Time 그래프 ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/40 font-medium">4D Scene Time</span>
          <span className="text-xs text-white/20">t = 0.0 → 1.0</span>
        </div>

        <div className="relative rounded-lg border border-white/10 overflow-hidden" style={{ height: SCENE_H }}>
          {/* 배경 그라데이션 */}
          <div className="absolute inset-0 bg-linear-to-br from-indigo-950/60 to-purple-950/60" />

          {/* Y축 레이블 */}
          <div className="absolute left-1.5 top-1 text-white/20 text-[10px] pointer-events-none">1.0</div>
          <div className="absolute left-1.5 bottom-1 text-white/20 text-[10px] pointer-events-none">0.0</div>

          {/* 참고선 (대각선 = 선형) */}
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            <line x1="0" y1="100%" x2="100%" y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4,4" />
          </svg>

          {/* 씬 타임 커브 + 컨트롤 포인트 */}
          <svg
            ref={sceneTrackRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: draggingScene ? 'ns-resize' : 'default' }}
          >
            {/* 연결 선 */}
            {svgPoints.length >= 2 && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="rgba(139,92,246,0.7)"
                strokeWidth="1.5"
              />
            )}

            {/* 컨트롤 포인트 */}
            {svgPoints.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <g key={p.id}>
                  {/* 히트 영역 */}
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r="10"
                    fill="transparent"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleSceneKfDown(e, p.id)}
                  />
                  {/* 시각 포인트 */}
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={isSelected ? 5 : 4}
                    fill={isSelected ? '#facc15' : '#a78bfa'}
                    stroke={isSelected ? 'rgba(250,204,21,0.4)' : 'rgba(167,139,250,0.4)'}
                    strokeWidth="2"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* 씬 타임 값 레이블 */}
                  <text
                    x={p.cx}
                    y={p.cy}
                    dy="-8"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize="9"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {p.sceneTime.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* 플레이헤드 수직선 */}
            <line
              x1={`${previewTime * 100}%`}
              y1="0"
              x2={`${previewTime * 100}%`}
              y2="100%"
              stroke="rgba(248,113,113,0.6)"
              strokeWidth="1"
              strokeDasharray="3,3"
              style={{ pointerEvents: 'none' }}
            />
          </svg>
        </div>

        <div className="flex justify-between text-white/20 text-[10px] mt-1 px-0.5 pointer-events-none">
          <span>0s</span>
          <span>{(path.duration * 0.25).toFixed(1)}s</span>
          <span>{(path.duration * 0.5).toFixed(1)}s</span>
          <span>{(path.duration * 0.75).toFixed(1)}s</span>
          <span>{path.duration}s</span>
        </div>
      </div>
    </div>
  );
}
