import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  minutesToLabel,
  labelToMinutes,
  snapToStep,
} from '../../../lib/timeSlots.ts';
import {
  DAY_KEYS,
  type DayInterval,
  type DayKey,
  type OpeningHours,
} from '../../../api/store/store.ts';
import { useT } from '../../../i18n/index.tsx';

const ROW_PX = 32;
/** Janela editável: 10:00 até meia-noite. Fora disso a grade não vai — não é um restaurante de madrugada. */
const WINDOW_START_MINUTES = 10 * 60;
const WINDOW_END_MINUTES = 24 * 60;
const WINDOW_MINUTES = WINDOW_END_MINUTES - WINDOW_START_MINUTES;
const HOURS = Array.from({ length: WINDOW_MINUTES / 60 }, (_, i) => 10 + i);
const DEFAULT_INTERVAL: DayInterval = ['11:00', '15:00'];
/** Abaixo disso, um "arraste" pra criar é tratado como clique acidental. */
const MIN_CREATE_MINUTES = 30;

interface WeekHoursGridProps {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}

type Edge = 'start' | 'end';

type Interaction =
  | { kind: 'create'; day: DayKey; anchorWindow: number; currentWindow: number }
  | {
      kind: 'move';
      day: DayKey;
      index: number;
      anchorWindow: number;
      startWindow: number;
      endWindow: number;
    }
  | { kind: 'resize'; day: DayKey; index: number; edge: Edge }
  | null;

/**
 * Minutos reais (0 = meia-noite) → minutos na janela (0 = 10:00, 840 =
 * meia-noite). "00:00" chega como 0 — o mesmo valor que `minutesToLabel`
 * usa pro FIM do dia — então aqui ele é tratado como o fim da janela (840),
 * não o início (que ficaria fora da faixa editável e seria grampeado a 0).
 */
function toWindow(absoluteMinutes: number): number {
  const effective =
    absoluteMinutes === 0 ? WINDOW_END_MINUTES : absoluteMinutes;
  return Math.min(
    WINDOW_MINUTES,
    Math.max(0, effective - WINDOW_START_MINUTES),
  );
}

/** Minutos na janela → minutos reais. `minutesToLabel` já dobra 1440 pra "00:00". */
function fromWindow(windowMinutes: number): number {
  return WINDOW_START_MINUTES + windowMinutes;
}

export function WeekHoursGridSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="week-hours-grid-skeleton"
      className="h-[500px] w-full animate-pulse rounded-2xl bg-skeleton"
    />
  );
}

export default function WeekHoursGrid({
  value,
  onChange,
  disabled = false,
}: WeekHoursGridProps) {
  const t = useT();
  const gridRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [interaction, setInteraction] = useState<Interaction>(null);

  function intervalsFor(day: DayKey): DayInterval[] {
    return valueRef.current[day] ?? [];
  }

  function setIntervals(day: DayKey, intervals: DayInterval[]) {
    const next = { ...valueRef.current };
    if (intervals.length === 0) delete next[day];
    else next[day] = intervals;
    onChange(next);
  }

  function patchEdge(
    day: DayKey,
    index: number,
    edge: Edge,
    windowMinutes: number,
  ) {
    const label = minutesToLabel(fromWindow(windowMinutes));
    const next = intervalsFor(day).map((interval, i) => {
      if (i !== index) return interval;
      return edge === 'start'
        ? ([label, interval[1]] as DayInterval)
        : ([interval[0], label] as DayInterval);
    });
    setIntervals(day, next);
  }

  /** Posição do ponteiro → minutos NA JANELA (0..840), grampeado nas bordas da grade. */
  function windowAt(clientY: number): number {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return snapToStep(ratio * WINDOW_MINUTES);
  }

  useEffect(() => {
    if (!interaction) return;

    function onMove(event: MouseEvent) {
      if (!interaction) return;

      if (interaction.kind === 'create') {
        setInteraction({
          ...interaction,
          currentWindow: windowAt(event.clientY),
        });
      } else if (interaction.kind === 'resize') {
        patchEdge(
          interaction.day,
          interaction.index,
          interaction.edge,
          windowAt(event.clientY),
        );
      } else if (interaction.kind === 'move') {
        const delta = windowAt(event.clientY) - interaction.anchorWindow;
        const newStart = Math.min(
          WINDOW_MINUTES,
          Math.max(0, interaction.startWindow + delta),
        );
        const newEnd = Math.min(
          WINDOW_MINUTES,
          Math.max(0, interaction.endWindow + delta),
        );
        const next = intervalsFor(interaction.day).map((iv, i) =>
          i === interaction.index
            ? ([
                minutesToLabel(fromWindow(newStart)),
                minutesToLabel(fromWindow(newEnd)),
              ] as DayInterval)
            : iv,
        );
        setIntervals(interaction.day, next);
      }
    }

    function onUp(event: MouseEvent) {
      if (!interaction) return;
      if (interaction.kind === 'create') {
        const end = windowAt(event.clientY);
        const start = Math.min(interaction.anchorWindow, end);
        const finish = Math.max(interaction.anchorWindow, end);
        if (finish - start >= MIN_CREATE_MINUTES) {
          setIntervals(interaction.day, [
            ...intervalsFor(interaction.day),
            [
              minutesToLabel(fromWindow(start)),
              minutesToLabel(fromWindow(finish)),
            ],
          ]);
        }
      }
      setInteraction(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction]);

  function handleKeyDown(
    event: React.KeyboardEvent,
    day: DayKey,
    index: number,
    edge: Edge,
  ) {
    if (disabled) return;
    const interval = intervalsFor(day)[index];
    if (!interval) return;
    const current = toWindow(
      labelToMinutes(interval[edge === 'start' ? 0 : 1]),
    );

    let next: number | null = null;
    if (event.key === 'ArrowUp') next = current - 15;
    else if (event.key === 'ArrowDown') next = current + 15;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = WINDOW_MINUTES;
    if (next === null) return;

    event.preventDefault();
    patchEdge(day, index, edge, Math.min(WINDOW_MINUTES, Math.max(0, next)));
  }

  function removeInterval(day: DayKey, index: number) {
    setIntervals(
      day,
      intervalsFor(day).filter((_, i) => i !== index),
    );
  }

  function addDefaultInterval(day: DayKey) {
    setIntervals(day, [...intervalsFor(day), DEFAULT_INTERVAL]);
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="flex border-b border-line bg-canvas-alt">
        <div className="w-12 flex-none" />
        {DAY_KEYS.map((day) => (
          <div
            key={day}
            className="flex flex-1 items-center justify-center gap-1 border-l border-line py-2 first:border-l-0"
          >
            <span className="text-[13px] font-medium text-fg">
              {t(`store.hours.days.${day}`)}
            </span>
            <button
              type="button"
              onClick={() => addDefaultInterval(day)}
              aria-label={`${t('store.hours.addInterval')} — ${t(`store.hours.days.${day}`)}`}
              data-testid={`add-${day}`}
              className="flex h-4 w-4 flex-none items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-accent"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex">
        <div
          className="relative w-12 flex-none"
          style={{ height: HOURS.length * ROW_PX }}
        >
          {HOURS.map((hour, index) => (
            <span
              key={hour}
              className="absolute right-1.5 -translate-y-1/2 text-[11px] text-fg-subtle"
              style={{ top: index * ROW_PX }}
            >
              {hour}:00
            </span>
          ))}
        </div>

        <div
          ref={gridRef}
          className="relative flex-1"
          style={{ height: HOURS.length * ROW_PX }}
        >
          {HOURS.map((hour, index) => (
            <div
              key={hour}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-line"
              style={{ top: index * ROW_PX }}
            />
          ))}

          <div className="absolute inset-0 grid grid-cols-7">
            {DAY_KEYS.map((day) => (
              <div
                key={day}
                data-testid={`week-hours-column-${day}`}
                className="relative border-l border-line first:border-l-0"
                onMouseDown={(event) => {
                  if (disabled || event.target !== event.currentTarget) return;
                  const w = windowAt(event.clientY);
                  setInteraction({
                    kind: 'create',
                    day,
                    anchorWindow: w,
                    currentWindow: w,
                  });
                }}
              >
                {intervalsFor(day).map((interval, index) => {
                  const startW = toWindow(labelToMinutes(interval[0]));
                  const endW = toWindow(labelToMinutes(interval[1]));

                  return (
                    <div
                      key={index}
                      data-testid={`block-${day}-${index}`}
                      onMouseDown={(event) => {
                        if (disabled) return;
                        event.stopPropagation();
                        setInteraction({
                          kind: 'move',
                          day,
                          index,
                          anchorWindow: windowAt(event.clientY),
                          startWindow: startW,
                          endWindow: endW,
                        });
                      }}
                      className="absolute inset-x-1 cursor-grab rounded-md border border-accent/40 bg-accent/20 active:cursor-grabbing"
                      style={{
                        top: `${(startW / WINDOW_MINUTES) * 100}%`,
                        height: `${((endW - startW) / WINDOW_MINUTES) * 100}%`,
                      }}
                    >
                      <div
                        role="slider"
                        tabIndex={disabled ? -1 : 0}
                        aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.start')} (${index + 1})`}
                        aria-valuemin={0}
                        aria-valuemax={WINDOW_MINUTES}
                        aria-valuenow={startW}
                        aria-valuetext={minutesToLabel(fromWindow(startW))}
                        data-testid={`handle-${day}-${index}-start`}
                        onMouseDown={(event) => {
                          if (disabled) return;
                          event.stopPropagation();
                          setInteraction({
                            kind: 'resize',
                            day,
                            index,
                            edge: 'start',
                          });
                        }}
                        onKeyDown={(event) =>
                          handleKeyDown(event, day, index, 'start')
                        }
                        className="absolute inset-x-0 -top-1 h-2 cursor-ns-resize focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <div
                        role="slider"
                        tabIndex={disabled ? -1 : 0}
                        aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.end')} (${index + 1})`}
                        aria-valuemin={0}
                        aria-valuemax={WINDOW_MINUTES}
                        aria-valuenow={endW}
                        aria-valuetext={minutesToLabel(fromWindow(endW))}
                        data-testid={`handle-${day}-${index}-end`}
                        onMouseDown={(event) => {
                          if (disabled) return;
                          event.stopPropagation();
                          setInteraction({
                            kind: 'resize',
                            day,
                            index,
                            edge: 'end',
                          });
                        }}
                        onKeyDown={(event) =>
                          handleKeyDown(event, day, index, 'end')
                        }
                        className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => removeInterval(day, index)}
                        aria-label={t('store.hours.removeInterval')}
                        data-testid={`remove-${day}-${index}`}
                        className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-fg-muted transition hover:bg-hover hover:text-danger"
                      >
                        <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                      </button>
                      <span className="pointer-events-none absolute inset-x-1 top-3 truncate text-[10px] leading-tight text-fg-muted">
                        {interval[0]}–{interval[1]}
                      </span>
                    </div>
                  );
                })}

                {interaction?.kind === 'create' &&
                  interaction.day === day &&
                  (() => {
                    const s = Math.min(
                      interaction.anchorWindow,
                      interaction.currentWindow,
                    );
                    const e = Math.max(
                      interaction.anchorWindow,
                      interaction.currentWindow,
                    );
                    return (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-1 rounded-md border border-accent bg-accent/30"
                        style={{
                          top: `${(s / WINDOW_MINUTES) * 100}%`,
                          height: `${((e - s) / WINDOW_MINUTES) * 100}%`,
                        }}
                      />
                    );
                  })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
