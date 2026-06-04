import * as React from 'react';
import { Play, Pause } from 'lucide-react';
import { useGaussianStore } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';
import { Slider } from '@/shared/ui/slider';

export function TimelineBar() {
  const { isPlaying, play, pause, currentFrame, setFrame, metadata, sequenceLoaded } = useGaussianStore();

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrame(Number(e.target.value));
  };
  
  const totalFrames = metadata?.frameCount || 100;

  return (
    <div className="flex items-center gap-4 p-4 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <Button 
        variant="glass" 
        size="icon" 
        onClick={handlePlayPause}
        disabled={!sequenceLoaded}
        className="rounded-full flex-shrink-0"
      >
        {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-1" />}
      </Button>

      <div className="flex-1 flex flex-col gap-2">
        <Slider 
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={handleSliderChange}
          disabled={!sequenceLoaded}
        />
        <div className="flex justify-between text-xs text-white/50 font-medium">
          <span>{currentFrame.toString().padStart(4, '0')}</span>
          <span>{totalFrames.toString().padStart(4, '0')}</span>
        </div>
      </div>
    </div>
  );
}
