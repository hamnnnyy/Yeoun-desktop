'use client';

import * as React from 'react';
import { useGaussianStore } from '@/entities/gaussian';
import {
  TRAINING_STAGE_LABELS,
  ORDERED_STAGES,
  TrainingStage,
  TrainingLog,
} from '@/entities/gaussian';
import {
  CheckCircle2,
  Circle,
  Loader2,
  X,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

interface StepProps {
  stage: TrainingStage;
  currentStage: TrainingStage;
  index: number;
}

function StageStep({ stage, currentStage, index }: StepProps) {
  const orderedIdx = ORDERED_STAGES.indexOf(currentStage);
  const myIdx = ORDERED_STAGES.indexOf(stage);

  const isDone    = orderedIdx > myIdx;
  const isCurrent = currentStage === stage;
  const isPending = orderedIdx < myIdx;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {index > 0 && (
        <div className={`h-px flex-1 transition-colors duration-500 ${isDone ? 'bg-[#C4A055]/50' : 'bg-[#2A2218]'}`} />
      )}
      <div className="flex flex-col items-center gap-1">
        <div className={[
          'w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300',
          isDone    ? 'bg-[#C4A055]/80 shadow-[0_0_10px_rgba(196,160,85,0.25)]' : '',
          isCurrent ? 'bg-[#C4A055]/50 ring-1 ring-[#C4A055]/40' : '',
          isPending ? 'bg-[#1A1510] border border-[#2A2218]' : '',
        ].join(' ')}>
          {isDone    && <CheckCircle2 size={14} className="text-[#060504]" />}
          {isCurrent && <Loader2 size={13} className="text-[#060504] animate-spin" />}
          {isPending && <Circle size={11} className="text-[#3A3530]" />}
        </div>
        <span className={[
          'text-[10px] font-medium text-center leading-tight max-w-[60px] transition-colors',
          isDone    ? 'text-[#C4A055]/70' :
          isCurrent ? 'text-[#EDE5D5]'   :
                      'text-[#3A3530]',
        ].join(' ')}>
          {TRAINING_STAGE_LABELS[stage]}
        </span>
      </div>
    </div>
  );
}

function LogLine({ log }: { log: TrainingLog }) {
  const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const color =
    log.level === 'error' ? 'text-red-400/80' :
    log.level === 'warn'  ? 'text-[#C4A055]/70' :
                            'text-[#7A7060]';

  return (
    <div className={`font-mono text-[11px] leading-5 flex gap-2 ${color}`}>
      <span className="text-[#3A3530] shrink-0 select-none">{time}</span>
      <span className="whitespace-pre-wrap break-all">{log.message}</span>
    </div>
  );
}

export function TrainingPanel() {
  const {
    isTraining,
    trainingProgress,
    trainingStatus,
    trainingStage,
    trainingLogs,
    trainingError,
    cancelTraining,
  } = useGaussianStore();

  const logEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trainingLogs.length]);

  const handleCancel = async () => {
    await window.electronAPI?.cancelTraining?.();
    cancelTraining();
  };

  const isDoneOrError =
    trainingStage === 'done' ||
    trainingStage === 'error' ||
    trainingStage === 'cancelled';

  if (!isTraining && !isDoneOrError) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 p-6 pointer-events-auto">
      <div className="bg-[#0A0806]/95 backdrop-blur-3xl border border-[#2A2218] rounded-[4px] flex flex-col overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-4">
          <div>
            <div className="text-[#C4A055]/50 font-medium tracking-[0.12em] uppercase text-[10px]">
              Local GPU Processing
            </div>
            <h2 className="text-xl font-light text-[#EDE5D5] tracking-tight mt-1">
              {trainingStage === 'done'
                ? '트레이닝 완료'
                : trainingStage === 'error'
                ? '트레이닝 실패'
                : trainingStage === 'cancelled'
                ? '트레이닝 취소됨'
                : '4D Gaussian Splatting 트레이닝'}
            </h2>
          </div>
          {isTraining && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#1A1510] hover:bg-red-900/20 border border-[#2A2218] hover:border-red-400/20 text-[#5A5040] hover:text-red-400/70 transition-all duration-200 text-xs font-medium"
            >
              <X size={12} />
              취소
            </button>
          )}
        </div>

        {/* Stage Steps */}
        <div className="px-8 py-3 border-t border-[#1A1510]">
          <div className="flex items-start">
            {ORDERED_STAGES.map((stage, i) => (
              <StageStep
                key={stage}
                stage={stage}
                currentStage={trainingStage === 'done' ? 'export' : trainingStage}
                index={i}
              />
            ))}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-8 pb-4 pt-2">
          <div className="w-full bg-[#1A1510] h-[2px] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                trainingStage === 'error'     ? 'bg-red-500/60' :
                trainingStage === 'done'      ? 'bg-[#C4A055]' :
                trainingStage === 'cancelled' ? 'bg-[#3A3530]' :
                                                'bg-[#C4A055]/80'
              }`}
              style={{ width: `${Math.max(2, trainingProgress)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-[#5A5040] truncate max-w-[80%]">{trainingStatus}</span>
            <span className="text-[#7A7060] font-mono">{Math.round(trainingProgress)}%</span>
          </div>
        </div>

        {/* Error Message */}
        {trainingError && (
          <div className="mx-8 mb-3 flex items-start gap-2 bg-red-900/8 border border-red-400/15 rounded-[2px] p-3">
            <AlertTriangle size={13} className="text-red-400/60 shrink-0 mt-0.5" />
            <p className="text-red-400/70 text-xs leading-relaxed break-all">{trainingError}</p>
          </div>
        )}

        {/* Log Console */}
        <div className="mx-8 mb-8 rounded-[2px] bg-[#060504] border border-[#1A1510] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0A0806] border-b border-[#1A1510]">
            <Terminal size={11} className="text-[#3A3530]" />
            <span className="text-[10px] font-medium text-[#3A3530] uppercase tracking-widest">파이프라인 로그</span>
            <span className="ml-auto text-[10px] text-[#2A2218] font-mono">{trainingLogs.length}줄</span>
          </div>
          <div className="h-48 overflow-y-auto p-3 space-y-0.5">
            {trainingLogs.length === 0 && (
              <p className="text-[#2A2218] text-[11px] font-mono">파이프라인 초기화 대기 중...</p>
            )}
            {trainingLogs.map((log, i) => (
              <LogLine key={i} log={log} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
