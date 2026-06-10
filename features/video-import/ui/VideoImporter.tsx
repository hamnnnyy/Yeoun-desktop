'use client';

import * as React from 'react';
import { Video, FolderOpen } from 'lucide-react';
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

  const handleLoadOutput = async () => {
    const result = await window.electronAPI?.openOutputFolder();
    if (!result) return;

    if (result.plyFiles.length === 0) {
      console.error(
        '[LoadOutput] point_cloud.ply 없음. 선택 폴더:', result.folderPath,
        '\n→ train.py --model_path 로 지정한 output 폴더를 선택하세요.',
        '\n→ 내부에 point_cloud/iteration_*/point_cloud.ply 가 있어야 합니다.',
      );
      window.alert(
        'PLY 파일을 찾을 수 없습니다.\n\n선택한 폴더: ' + result.folderPath +
        '\n\ntrain.py 실행 시 --model_path 로 지정한 output 폴더를 선택하세요.\n(폴더 안에 point_cloud/iteration_*/point_cloud.ply 가 있어야 합니다)',
      );
      return;
    }

    finishTraining({
      success: true,
      folderPath: result.folderPath,
      plyFiles: result.plyFiles,
      fileCount: result.plyFiles.length,
    });
  };

  const handleImportVideo = async () => {
    try {
      const result = await window.electronAPI?.openVideoFiles();
      if (!result?.videoPaths?.length) return;

      startTraining(result.videoPaths[0]);

      window.electronAPI?.onTrainingProgress((progress, status) => {
        updateTrainingProgress(progress, status);
      });

      window.electronAPI?.onTrainingStage((stage) => {
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

      const trainingResult = await window.electronAPI?.startLocalTraining(result.videoPaths);

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
    <div className="flex gap-2">
      <Button
        variant="glass"
        size="sm"
        onClick={handleLoadOutput}
        className="gap-1.5 rounded-[2px]"
        title="터미널에서 학습한 output 폴더 불러오기"
      >
        <FolderOpen size={14} className="text-[#7A7060]" />
        <span className="text-[#7A7060]">Load Output</span>
      </Button>

      <Button
        variant="glass"
        onClick={handleImportVideo}
        className="gap-2 rounded-[2px] border-[#C4A055]/25 hover:border-[#C4A055]/50"
      >
        <Video size={16} className="text-[#C4A055]/80" />
        <span className="font-medium text-[#EDE5D5]/80">Import Multi-View Videos</span>
      </Button>
    </div>
  );
}
