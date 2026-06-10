'use client';

import * as React from 'react';
import { useCameraPathStore } from '@/entities/camera-path';
import { Button } from '@/shared/ui/button';

export function KeyframeControls() {
  const { path, selectedId, removeKeyframe, updateKeyframe, setDuration, setFps } =
    useCameraPathStore();

  const kf = path.keyframes.find((k) => k.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5 p-4 bg-white/[0.03] border-l border-white/10 w-52 shrink-0 overflow-y-auto">
      {/* 렌더 설정 */}
      <section>
        <h3 className="text-xs text-white/40 font-semibold uppercase tracking-widest mb-3">
          Render
        </h3>
        <label className="flex items-center gap-2 text-xs mb-2">
          <span className="text-white/60 w-16">Duration</span>
          <input
            type="number"
            min={1}
            max={120}
            value={path.duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-14 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-center focus:outline-none focus:border-blue-400"
          />
          <span className="text-white/40">s</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-white/60 w-16">FPS</span>
          <input
            type="number"
            min={1}
            max={60}
            value={path.fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-14 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-center focus:outline-none focus:border-blue-400"
          />
        </label>
      </section>

      {/* 키프레임 속성 */}
      <section className="border-t border-white/10 pt-4 flex-1">
        <h3 className="text-xs text-white/40 font-semibold uppercase tracking-widest mb-3">
          Keyframe
        </h3>

        {kf ? (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex justify-between text-white/50">
              <span>Output T</span>
              <span className="text-white font-mono">{kf.outputTime.toFixed(3)}</span>
            </div>

            <label className="flex flex-col gap-1">
              <div className="flex justify-between text-white/50">
                <span>Scene T</span>
                <span className="text-white font-mono">{kf.sceneTime.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={kf.sceneTime}
                onChange={(e) => updateKeyframe(kf.id, { sceneTime: Number(e.target.value) })}
                className="w-full accent-blue-400"
              />
            </label>

            <label className="flex flex-col gap-1">
              <div className="flex justify-between text-white/50">
                <span>FOV</span>
                <span className="text-white font-mono">{kf.fov.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                step={1}
                value={kf.fov}
                onChange={(e) => updateKeyframe(kf.id, { fov: Number(e.target.value) })}
                className="w-full accent-blue-400"
              />
            </label>

            <div className="bg-white/5 rounded p-2 mt-1">
              <div className="text-white/30 mb-1">Position</div>
              <div className="grid grid-cols-3 gap-1 text-white/70 font-mono text-xs">
                {kf.position.map((v, i) => (
                  <span key={i} className="text-center bg-white/5 rounded py-0.5">
                    {v.toFixed(1)}
                  </span>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="mt-1 border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-400"
              onClick={() => removeKeyframe(kf.id)}
            >
              Delete Keyframe
            </Button>
          </div>
        ) : (
          <p className="text-white/25 text-xs leading-5">
            3D 뷰에서 카메라를 조정한 후<br />
            <span className="text-white/40">+ Capture Camera</span>를 클릭하거나
            <br />
            타임라인의 키프레임을 클릭하세요.
          </p>
        )}
      </section>
    </div>
  );
}
