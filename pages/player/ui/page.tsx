import * as React from 'react';
import { SplatViewer } from '@/widgets/splat-viewer';

export default function PlayerPage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-black text-white selection:bg-blue-500/30">
      <SplatViewer />
    </main>
  );
}
