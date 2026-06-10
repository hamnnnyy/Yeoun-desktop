'use client';

import * as React from 'react';
import { useState } from 'react';
import { SplatViewer } from '@/widgets/splat-viewer';
import { CameraPathPanel } from '@/widgets/camera-path-panel';
import { useGaussianStore } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';

export default function PlayerPage() {
  const [mode, setMode] = useState<'viewer' | 'editor'>('viewer');
  const { trainingStage } = useGaussianStore();

  if (mode === 'editor') {
    return (
      <main className="w-screen h-screen overflow-hidden bg-black">
        <CameraPathPanel onBack={() => setMode('viewer')} />
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-white selection:bg-blue-500/30">
      <SplatViewer />

      {trainingStage === 'done' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <Button
            variant="glass"
            onClick={() => setMode('editor')}
            className="px-5 shadow-lg shadow-blue-500/20 border-blue-400/30"
          >
            Edit Camera Path →
          </Button>
        </div>
      )}
    </main>
  );
}
