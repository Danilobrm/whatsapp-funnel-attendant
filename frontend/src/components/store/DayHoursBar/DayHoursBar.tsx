import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  intervalSegments,
  labelToMinutes,
  minutesToLabel,
  minutesToPercent,
  positionToMinutes,
  snapToStep,
} from '../../../lib/timeSlots.ts';
import { useT } from '../../../i18n/index.tsx';

import type { DayInterval } from '../../../api/store';

const HOUR_MARKS = [0, 6, 12, 18, 24];
const DEFAULT_INTERVAL: DayInterval = ['11:00', '15:00'];

interface DayHoursBarProps {
  dayLabel: string;
  intervals: DayInterval[];
  onChange: (intervals: DayInterval[]) => void;
  disabled?: boolean;
}

type Edge = 'start' | 'end';

interface DragState {
  intervalIndex: number;
  edge: Edge;
  trackLeft: number;
  trackWidth: number;
}

export function DayHoursBarSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="day-hours-bar-skeleton"
      className="flex items-center gap-3"
    >
      <div className="h-3.5 w-16 flex-none animate-pulse rounded bg-skeleton" />
      <div className="h-10 flex-1 animate-pulse rounded-lg bg-skeleton" />
    </div>
  );
}

export default function DayHoursBar({
  dayLabel,
  intervals,
  onChange,
  disabled = false,
}: DayHoursBarProps) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const intervalsRef = useRef(intervals);
  intervalsRef.current = intervals;
  const [drag, setDrag] = useState<DragState | null>(null);

  function updateHandle(intervalIndex: number, edge: Edge, minutes: number) {
    const clamped = snapToStep(Math.min(1440, Math.max(0, minutes)));
    const label = minutesToLabel(clamped);
    const next = intervalsRef.current.map((interval, i) => {
      if (i !== intervalIndex) return interval;
      return edge === 'start'
        ? ([label, interval[1]] as DayInterval)
        : ([interval[0], label] as DayInterval);
    });
    onChange(next);
  }

  useEffect(() => {
    if (!drag) return;

    function onMouseMove(event: MouseEvent) {
      if (!drag) return;
      const minutes = positionToMinutes(event.clientX, drag.trackLeft, drag.trackWidth);
      updateHandle(drag.intervalIndex, drag.edge, minutes);
    }
    function onMouseUp() {
      setDrag(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function startDrag(intervalIndex: number, edge: Edge) {
    if (disabled) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ intervalIndex, edge, trackLeft: rect.left, trackWidth: rect.width });
  }

  function handleKeyDown(
    event: React.KeyboardEvent,
    intervalIndex: number,
    edge: Edge,
  ) {
    if (disabled) return;
    const current = labelToMinutes(intervals[intervalIndex]![edge === 'start' ? 0 : 1]);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      updateHandle(intervalIndex, edge, current - 15);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      updateHandle(intervalIndex, edge, current + 15);
    } else if (event.key === 'Home') {
      event.preventDefault();
      updateHandle(intervalIndex, edge, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      updateHandle(intervalIndex, edge, 1440);
    }
  }

  function addInterval() {
    onChange([...intervals, DEFAULT_INTERVAL]);
  }

  function removeInterval(index: number) {
    onChange(intervals.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-20 flex-none text-sm text-fg-muted">{dayLabel}</span>

      <div className="min-w-0 flex-1">
        <div
          ref={trackRef}
          className="relative h-10 rounded-lg border border-line bg-canvas"
        >
          {intervals.length === 0 && (
            <span className="absolute inset-0 flex items-center justify-center text-[13px] text-fg-subtle">
              {t('store.hours.closed')}
            </span>
          )}

          {HOUR_MARKS.slice(1, -1).map((hour) => (
            <div
              key={hour}
              aria-hidden="true"
              className="absolute top-0 h-full w-px bg-line"
              style={{ left: `${(hour / 24) * 100}%` }}
            />
          ))}

          {intervals.map((interval, intervalIndex) => {
            const start = labelToMinutes(interval[0]);
            const end = labelToMinutes(interval[1]);
            const segments = intervalSegments(start, end);

            return (
              <div key={intervalIndex}>
                {segments.map((segment, segIndex) => (
                  <div
                    key={segIndex}
                    aria-hidden="true"
                    className="absolute top-1 h-8 rounded bg-accent/25"
                    style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                  />
                ))}

                {(['start', 'end'] as const).map((edge) => {
                  const minutes = edge === 'start' ? start : end;
                  return (
                    <div
                      key={edge}
                      role="slider"
                      tabIndex={disabled ? -1 : 0}
                      aria-label={`${dayLabel} — ${
                        edge === 'start' ? t('store.hours.start') : t('store.hours.end')
                      } (${intervalIndex + 1})`}
                      aria-valuemin={0}
                      aria-valuemax={1440}
                      aria-valuenow={minutes}
                      aria-valuetext={minutesToLabel(minutes)}
                      data-testid={`handle-${intervalIndex}-${edge}`}
                      onMouseDown={() => startDrag(intervalIndex, edge)}
                      onKeyDown={(e) => handleKeyDown(e, intervalIndex, edge)}
                      className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow transition focus:outline-none focus:ring-2 focus:ring-accent ${
                        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'
                      }`}
                      style={{ left: `${minutesToPercent(minutes)}%` }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex justify-between text-[11px] text-fg-subtle">
          {HOUR_MARKS.map((hour) => (
            <span key={hour}>{hour}h</span>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {intervals.map((interval, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-1.5 text-[13px] text-fg"
            >
              {interval[0]} – {interval[1]}
              <button
                type="button"
                onClick={() => removeInterval(index)}
                disabled={disabled}
                aria-label={t('store.hours.removeInterval')}
                className="flex h-5 w-5 items-center justify-center rounded-full text-fg-muted transition hover:bg-hover hover:text-danger"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={addInterval}
            disabled={disabled}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-accent transition hover:bg-hover"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            {t('store.hours.addInterval')}
          </button>
        </div>
      </div>
    </div>
  );
}
