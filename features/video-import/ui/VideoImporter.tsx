'use client';

import * as React from 'react';
import { Video } from 'lucide-react';
import { useGaussianStore } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';

export function VideoImporter() {
  const {
    startTraining,
    updateTrainingProgress,
    appendLog,
    finishTraining,
    setTrainingError,
  } = useGaussianStore();

  const handleImportVideo = async () => {
    try {
      // 1. 파일 선택 다이얼로그
      const result = await window.electronAPI?.openVideoFile();
      if (!result?.videoPath) return;

      // 2. 스토어 초기화
      startTraining(result.videoPath);

      // 3. IPC 이벤트 리스너 등록
      window.electronAPI?.onTrainingProgress((progress, status) => {
        updateTrainingProgress(progress, status);
      });

      window.electronAPI?.onTrainingStage((stage) => {
        // stage 변경은 progress와 함께 updateTrainingProgress에서 처리됨
        appendLog({
          stage: stage as Parameters<typeof appendLog>[0]['stage'],
          message: `[스테이지 전환] → ${stage}`,
          level: 'info',
        });
      });

      window.electronAPI?.onTrainingLog((log) => {
        appendLog({
          stage: useGaussianStore.getState().trainingStage,
          message: log.message,
          level: (log.level as 'info' | 'warn' | 'error') ?? 'info',
        });
      });

      window.electronAPI?.onTrainingError((error) => {
        setTrainingError(error);
        window.electronAPI?.removeAllTrainingListeners?.();
      });

      // 4. 트레이닝 실행
      const trainingResult = await window.electronAPI?.startLocalTraining(result.videoPath);

      // 5. 완료 처리
      window.electronAPI?.removeAllTrainingListeners?.();

      if (trainingResult?.success) {
        finishTraining({
          success: true,
          folderPath: trainingResult.folderPath,
          plyFiles: trainingResult.plyFiles ?? [],
          fileCount: trainingResult.fileCount || 1,
        });
      } else if (trainingResult?.error && trainingResult.error !== 'CANCELLED') {
        setTrainingError(trainingResult.error ?? '알 수 없는 오류');
      }
    } catch (error) {
      console.error('트레이닝 실패', error);
      setTrainingError(error instanceof Error ? error.message : '알 수 없는 오류');
      window.electronAPI?.removeAllTrainingListeners?.();
    }
  };

  return (
    <Button
      variant="glass"
      onClick={handleImportVideo}
      className="gap-2 bg-blue-500/20 border-blue-400/30 hover:bg-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.3)]"
    >
      <Video size={18} className="text-blue-200" />
      <span className="font-semibold text-blue-50">Import MP4 to Train</span>
    </Button>
  );
}
