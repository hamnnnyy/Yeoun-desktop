import * as React from 'react';
import { Play, Pause, SkipBack, SkipForward, Camera, Download, X } from 'lucide-react';
import { useGaussianStore, CameraKeyframe } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';
import { Slider } from '@/shared/ui/slider';

const FPS_PRESETS = [1, 5, 10, 15, 24, 30] as const;

interface TimelineBarProps {
  onAddKeyframe?: () => void;
  onExport?: () => void;
  isExporting?: boolean;
}

export function TimelineBar({ onAddKeyframe, onExport, isExporting }: TimelineBarProps) {
  const {
    isPlaying, play, pause,
    currentFrame, setFrame,
    fps, setFps,
    metadata, sequenceLoaded,
    keyframes, removeKeyframe,
  } = useGaussianStore();

  const totalFrames = metadata?.frameCount || 100;

  const handlePlayPause = () => isPlaying ? pause() : play();

  const stepFrame = (delta: number) => {
    if (isPlaying) pause();
    setFrame((prev) => {
      const next = prev + delta;
      if (next < 0) return totalFrames - 1;
      if (next >= totalFrames) return 0;
      return next;
    });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrame(Number(e.target.value));
  };

  const timeSec = totalFrames > 0 ? (currentFrame / totalFrames) * (metadata?.duration ?? 0) : 0;
  const totalSec = metadata?.duration ?? 0;
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;

  const kfAtCurrentFrame = keyframes.find((k) => k.frame === currentFrame);

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 bg-[#0A0806]/92 backdrop-blur-xl border border-[#2A2218] rounded-[3px] shadow-[0_-1px_0_0_rgba(196,160,85,0.06),0_16px_48px_rgba(0,0,0,0.7)]">

      {/* Scrub row */}
      <div className="flex items-center gap-3">
        {/* Step back */}
        <button
          onClick={() => stepFrame(-1)}
          disabled={!sequenceLoaded}
          title="이전 프레임"
          className="w-6 h-6 flex items-center justify-center rounded-[2px] border border-[#2A2218] text-[#3A3530] hover:text-[#EDE5D5] hover:border-[#C4A055]/25 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
        >
          <SkipBack size={12} />
        </button>

        {/* Play / Pause */}
        <Button
          variant="glass"
          size="icon"
          onClick={handlePlayPause}
          disabled={!sequenceLoaded}
          className="rounded-[2px] shrink-0 h-8 w-8"
        >
          {isPlaying
            ? <Pause size={15} className="text-[#EDE5D5]" />
            : <Play  size={15} className="text-[#EDE5D5] ml-0.5" />}
        </Button>

        {/* Step forward */}
        <button
          onClick={() => stepFrame(1)}
          disabled={!sequenceLoaded}
          title="다음 프레임"
          className="w-6 h-6 flex items-center justify-center rounded-[2px] border border-[#2A2218] text-[#3A3530] hover:text-[#EDE5D5] hover:border-[#C4A055]/25 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
        >
          <SkipForward size={12} />
        </button>

        {/* Slider with keyframe markers */}
        <div className="flex-1 relative px-0.5">
          {/* Keyframe tick marks */}
          {sequenceLoaded && keyframes.map((kf: CameraKeyframe) => {
            const pct = totalFrames > 1 ? (kf.frame / (totalFrames - 1)) * 100 : 0;
            const isCurrent = kf.frame === currentFrame;
            return (
              <div
                key={kf.frame}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-10"
                style={{ left: `${pct}%` }}
              >
                <div className={`w-[2px] h-3 rounded-full ${isCurrent ? 'bg-[#C4A055]' : 'bg-[#C4A055]/50'}`} />
              </div>
            );
          })}
          <Slider
            min={0}
            max={totalFrames - 1}
            value={currentFrame}
            onChange={handleSliderChange}
            disabled={!sequenceLoaded}
          />
        </div>

        {/* Frame / Time counter */}
        <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[60px]">
          <span className="text-[#EDE5D5]/70 text-xs font-mono tabular-nums leading-none tracking-normal">
            {currentFrame.toString().padStart(4, '0')}
            <span className="text-[#3A3530]">/{totalFrames.toString().padStart(4, '0')}</span>
          </span>
          {totalSec > 0 && (
            <span className="text-[#3A3530] text-[10px] font-mono tabular-nums leading-none">
              {fmt(timeSec)}<span className="opacity-50">/{fmt(totalSec)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Controls row: FPS | keyframe actions | export */}
      <div className="flex items-center gap-2.5">
        <span className="text-[#3A3530] text-[10px] tracking-[0.12em] uppercase w-6 shrink-0">fps</span>

        <div className="flex gap-1">
          {FPS_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setFps(preset)}
              disabled={!sequenceLoaded}
              className={[
                'px-2 py-0.5 rounded-[2px] text-xs font-medium transition-all duration-100',
                'border disabled:opacity-20 disabled:cursor-not-allowed',
                fps === preset
                  ? 'bg-[#C4A055]/12 border-[#C4A055]/35 text-[#C4A055]'
                  : 'bg-transparent border-[#1E1A14] text-[#3A3530] hover:text-[#7A7060] hover:border-[#2A2218]',
              ].join(' ')}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-3.5 bg-[#1E1A14] mx-0.5" />

        {/* Keyframe controls */}
        {onAddKeyframe && (
          <div className="flex items-center gap-1">
            <button
              onClick={onAddKeyframe}
              disabled={!sequenceLoaded}
              title={kfAtCurrentFrame ? `F${currentFrame} 키프레임 덮어쓰기` : `F${currentFrame}에 키프레임 추가`}
              className={[
                'flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-xs font-medium transition-all duration-100 border',
                'disabled:opacity-20 disabled:cursor-not-allowed',
                kfAtCurrentFrame
                  ? 'bg-[#C4A055]/20 border-[#C4A055]/50 text-[#C4A055]'
                  : 'bg-transparent border-[#1E1A14] text-[#3A3530] hover:text-[#C4A055]/70 hover:border-[#C4A055]/20',
              ].join(' ')}
            >
              <Camera size={10} />
              <span>K</span>
            </button>

            {kfAtCurrentFrame && (
              <button
                onClick={() => removeKeyframe(currentFrame)}
                title={`F${currentFrame} 키프레임 삭제`}
                className="flex items-center justify-center w-5 h-5 rounded-[2px] border border-[#1E1A14] text-[#3A3530] hover:text-red-400/70 hover:border-red-400/20 transition-all duration-100"
              >
                <X size={9} />
              </button>
            )}

            {keyframes.length > 0 && (
              <span className="text-[#3A3530] text-[10px] font-mono ml-0.5">
                {keyframes.length}K
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        <span className="text-[#2A2218] text-[10px] font-mono tracking-wide">
          {sequenceLoaded ? `${fps} fps · ${totalFrames} frames` : '시퀀스 없음'}
        </span>

        {/* Export button */}
        {onExport && (
          <button
            onClick={onExport}
            disabled={!sequenceLoaded || isExporting || keyframes.length < 2}
            title={keyframes.length < 2 ? '키프레임을 2개 이상 설정해야 합니다' : 'MP4/WebM 내보내기'}
            className={[
              'flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-xs font-medium transition-all duration-150 border',
              'disabled:opacity-25 disabled:cursor-not-allowed',
              isExporting
                ? 'bg-[#C4A055]/10 border-[#C4A055]/30 text-[#C4A055] animate-pulse'
                : 'bg-transparent border-[#2A2218] text-[#5A5040] hover:text-[#EDE5D5] hover:border-[#C4A055]/25',
            ].join(' ')}
          >
            <Download size={11} />
            <span>{isExporting ? '내보내는 중...' : '내보내기'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
