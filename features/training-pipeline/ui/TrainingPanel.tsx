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
  XCircle,
  X,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────
// Stage Step Indicator
// ─────────────────────────────────────────────────────

interface StepProps {
  stage: TrainingStage;
  currentStage: TrainingStage;
  index: number;
}

function StageStep({ stage, currentStage, index }: StepProps) {
  const orderedIdx = ORDERED_STAGES.indexOf(currentStage);
  const myIdx = ORDERED_STAGES.indexOf(stage);

  const isDone      = orderedIdx > myIdx;
  const isCurrent   = currentStage === stage;
  const isPending   = orderedIdx < myIdx;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Connector line (except first) */}
      {index > 0 && (
        <div
          className={`h-px flex-1 transition-colors duration-500 ${
            isDone ? 'bg-blue-400/80' : 'bg-white/15'
          }`}
        />
      )}
      <div className="flex flex-col items-center gap-1">
        <div
          className={`
            w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300
            ${isDone    ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]' : ''}
            ${isCurrent ? 'bg-blue-600 shadow-[0_0_16px_rgba(99,102,241,0.8)] ring-2 ring-blue-400/50' : ''}
            ${isPending ? 'bg-white/10 border border-white/20' : ''}
          `}
        >
          {isDone    && <CheckCircle2 size={15} className="text-white" />}
          {isCurrent && <Loader2 size={14} className="text-white animate-spin" />}
          {isPending && <Circle size={12} className="text-white/30" />}
        </div>
        <span
          className={`text-[10px] font-medium text-center leading-tight max-w-[60px] transition-colors ${
            isDone    ? 'text-blue-300' :
            isCurrent ? 'text-white' :
                        'text-white/30'
          }`}
        >
          {TRAINING_STAGE_LABELS[stage]}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Log Line
// ─────────────────────────────────────────────────────

function LogLine({ log }: { log: TrainingLog }) {
  const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const color =
    log.level === 'error' ? 'text-red-400' :
    log.level === 'warn'  ? 'text-yellow-400' :
                            'text-white/70';

  return (
    <div className={`font-mono text-[11px] leading-5 flex gap-2 ${color}`}>
      <span className="text-white/25 flex-shrink-0 select-none">{time}</span>
      <span className="whitespace-pre-wrap break-all">{log.message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// TrainingPanel (main export)
// ─────────────────────────────────────────────────────

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

  // 새 로그가 들어오면 자동 스크롤
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
      <div
        className="
          bg-black/70 backdrop-blur-3xl border border-white/10
          rounded-[2rem] flex flex-col gap-0 overflow-hidden
          shadow-[0_0_80px_rgba(59,130,246,0.2)]
          w-full max-w-2xl
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-4">
          <div>
            <div className="text-blue-400 font-bold tracking-widest uppercase text-[11px]">
              Local GPU Processing
            </div>
            <h2 className="text-2xl font-light text-white tracking-tight mt-0.5">
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
              id="cancel-training-btn"
              onClick={handleCancel}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                bg-white/10 hover:bg-red-500/20 border border-white/15 hover:border-red-400/40
                text-white/60 hover:text-red-300
                transition-all duration-200 text-xs font-medium
              "
            >
              <X size={13} />
              취소
            </button>
          )}
        </div>

        {/* Stage Steps */}
        <div className="px-8 py-3">
          <div className="flex items-start">
            {ORDERED_STAGES.map((stage, i) => (
              <StageStep
                key={stage}
                stage={stage}
                currentStage={
                  trainingStage === 'done'
                    ? 'export'
                    : trainingStage === 'error' || trainingStage === 'cancelled'
                    ? trainingStage
                    : trainingStage
                }
                index={i}
              />
            ))}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-8 pb-4">
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden border border-white/10 relative">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-full ${
                trainingStage === 'error'
                  ? 'bg-red-500'
                  : trainingStage === 'done'
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'
              }`}
              style={{ width: `${Math.max(2, trainingProgress)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs font-medium">
            <span className="text-white/60 truncate max-w-[80%]">{trainingStatus}</span>
            <span className="text-white/80">{Math.round(trainingProgress)}%</span>
          </div>
        </div>

        {/* Error Message */}
        {trainingError && (
          <div className="mx-8 mb-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs leading-relaxed break-all">{trainingError}</p>
          </div>
        )}

        {/* Log Console */}
        <div className="mx-8 mb-8 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
            <Terminal size={12} className="text-white/40" />
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-widest">
              파이프라인 로그
            </span>
            <span className="ml-auto text-[10px] text-white/25">{trainingLogs.length}줄</span>
          </div>
          <div className="h-48 overflow-y-auto p-3 space-y-0.5 scrollbar-thin">
            {trainingLogs.length === 0 && (
              <p className="text-white/20 text-[11px] font-mono">파이프라인 초기화 대기 중...</p>
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
