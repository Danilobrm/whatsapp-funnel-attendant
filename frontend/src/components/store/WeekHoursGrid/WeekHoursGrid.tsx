import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  intervalSegments,
  labelToMinutes,
  minutesToLabel,
  minutesToPercent,
  positionToMinutes,
  positionToMinutesWrapped,
  wrapMinutes,
} from '../../../lib/timeSlots.ts';
import { DAY_KEYS, type DayInterval, type DayKey, type OpeningHours } from '../../../api/store';
import { useT } from '../../../i18n/index.tsx';

const ROW_PX = 32;
/**
 * A grade começa às 10h, não à meia-noite — é quando o dia de um restaurante
 * de fato começa. As 24 linhas seguem em ordem rotacionada (10h..23h, 0h..9h)
 * e "dão a volta": todo cálculo de posição converte pra este referencial
 * ("rotacionado", 0 = 10:00) e de volta pro horário real via
 * `toRotated`/`fromRotated`, sem duplicar a lógica de cruzar meia-noite — ela
 * já existe em `wrapMinutes`, só com outro ponto de partida.
 */
const DAY_START_MINUTES = 10 * 60;
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 10) % 24);
const DEFAULT_INTERVAL: DayInterval = ['11:00', '15:00'];
/** Abaixo disso, um "arraste" pra criar é tratado como clique acidental. */
const MIN_CREATE_MINUTES = 30;

/** Minutos reais (0 = meia-noite) → minutos na grade (0 = 10:00). */
function toRotated(minutes: number): number {
  return wrapMinutes(minutes - DAY_START_MINUTES);
}

/** Minutos na grade (0 = 10:00) → minutos reais (0 = meia-noite). */
function fromRotated(minutes: number): number {
  return wrapMinutes(minutes + DAY_START_MINUTES);
}

interface WeekHoursGridProps {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}

type Edge = 'start' | 'end';

type Interaction =
  | { kind: 'create'; day: DayKey; anchorMinutes: number; currentMinutes: number }
  | {
      kind: 'move';
      day: DayKey;
      index: number;
      anchorMinutes: number;
      startMinutes: number;
      endMinutes: number;
    }
  | { kind: 'resize'; day: DayKey; index: number; edge: Edge }
  | null;

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

  function patchEdge(day: DayKey, index: number, edge: Edge, minutes: number) {
    const label = minutesToLabel(minutes);
    const next = intervalsFor(day).map((interval, i) => {
      if (i !== index) return interval;
      return edge === 'start'
        ? ([label, interval[1]] as DayInterval)
        : ([interval[0], label] as DayInterval);
    });
    setIntervals(day, next);
  }

  /** Minutos reais sob o ponteiro — a "borda" do arraste é o topo/base da grade (10:00). */
  function minutesAt(clientY: number, wrap = false): number {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return fromRotated(0);
    const rotated = wrap
      ? positionToMinutesWrapped(clientY, rect.top, rect.height)
      : positionToMinutes(clientY, rect.top, rect.height);
    return fromRotated(rotated);
  }

  /** Minutos NA GRADE (0 = 10:00) sob o ponteiro — usado só pela pré-visualização de criação. */
  function rotatedMinutesAt(clientY: number): number {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return positionToMinutes(clientY, rect.top, rect.height);
  }

  useEffect(() => {
    if (!interaction) return;

    function onMove(event: MouseEvent) {
      if (!interaction) return;

      if (interaction.kind === 'create') {
        const currentMinutes = rotatedMinutesAt(event.clientY);
        setInteraction({ ...interaction, currentMinutes });
      } else if (interaction.kind === 'resize') {
        const minutes = minutesAt(event.clientY, interaction.edge === 'end');
        patchEdge(interaction.day, interaction.index, interaction.edge, minutes);
      } else if (interaction.kind === 'move') {
        const current = minutesAt(event.clientY);
        const delta = current - interaction.anchorMinutes;
        const newStart = wrapMinutes(interaction.startMinutes + delta);
        const newEnd = wrapMinutes(interaction.endMinutes + delta);
        const next = intervalsFor(interaction.day).map((iv, i) =>
          i === interaction.index
            ? ([minutesToLabel(newStart), minutesToLabel(newEnd)] as DayInterval)
            : iv,
        );
        setIntervals(interaction.day, next);
      }
    }

    function onUp(event: MouseEvent) {
      if (!interaction) return;
      if (interaction.kind === 'create') {
        const end = rotatedMinutesAt(event.clientY);
        const start = Math.min(interaction.anchorMinutes, end);
        const finish = Math.max(interaction.anchorMinutes, end);
        if (finish - start >= MIN_CREATE_MINUTES) {
          setIntervals(interaction.day, [
            ...intervalsFor(interaction.day),
            [minutesToLabel(fromRotated(start)), minutesToLabel(fromRotated(finish))],
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

  function handleKeyDown(event: React.KeyboardEvent, day: DayKey, index: number, edge: Edge) {
    if (disabled) return;
    const interval = intervalsFor(day)[index];
    if (!interval) return;
    const current = labelToMinutes(interval[edge === 'start' ? 0 : 1]);

    let next: number | null = null;
    if (event.key === 'ArrowUp') next = current - 15;
    else if (event.key === 'ArrowDown') next = current + 15;
    else if (event.key === 'Home') next = fromRotated(0);
    else if (event.key === 'End') next = fromRotated(1440);
    if (next === null) return;

    event.preventDefault();
    const minutes = edge === 'end' ? wrapMinutes(next) : Math.min(1440, Math.max(0, next));
    patchEdge(day, index, edge, minutes);
  }

  function removeInterval(day: DayKey, index: number) {
    setIntervals(day, intervalsFor(day).filter((_, i) => i !== index));
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
        <div className="relative w-12 flex-none" style={{ height: HOURS.length * ROW_PX }}>
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
                  const minutes = rotatedMinutesAt(event.clientY);
                  setInteraction({ kind: 'create', day, anchorMinutes: minutes, currentMinutes: minutes });
                }}
              >
                {intervalsFor(day).map((interval, index) => {
                  const start = labelToMinutes(interval[0]);
                  const end = labelToMinutes(interval[1]);
                  const segments = intervalSegments(toRotated(start), toRotated(end));

                  return segments.map((segment, segIndex) => (
                    <div
                      key={segIndex}
                      data-testid={`block-${day}-${index}-${segIndex}`}
                      onMouseDown={(event) => {
                        if (disabled) return;
                        event.stopPropagation();
                        const minutes = minutesAt(event.clientY);
                        setInteraction({
                          kind: 'move',
                          day,
                          index,
                          anchorMinutes: minutes,
                          startMinutes: start,
                          endMinutes: end,
                        });
                      }}
                      className="absolute inset-x-1 cursor-grab rounded-md border border-accent/40 bg-accent/20 active:cursor-grabbing"
                      style={{ top: `${segment.left}%`, height: `${segment.width}%` }}
                    >
                      {segIndex === 0 && (
                        <div
                          role="slider"
                          tabIndex={disabled ? -1 : 0}
                          aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.start')} (${index + 1})`}
                          aria-valuemin={0}
                          aria-valuemax={1440}
                          aria-valuenow={start}
                          aria-valuetext={minutesToLabel(start)}
                          data-testid={`handle-${day}-${index}-start`}
                          onMouseDown={(event) => {
                            if (disabled) return;
                            event.stopPropagation();
                            setInteraction({ kind: 'resize', day, index, edge: 'start' });
                          }}
                          onKeyDown={(event) => handleKeyDown(event, day, index, 'start')}
                          className="absolute inset-x-0 -top-1 h-2 cursor-ns-resize focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      )}
                      {segIndex === segments.length - 1 && (
                        <div
                          role="slider"
                          tabIndex={disabled ? -1 : 0}
                          aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.end')} (${index + 1})`}
                          aria-valuemin={0}
                          aria-valuemax={1440}
                          aria-valuenow={end}
                          aria-valuetext={minutesToLabel(end)}
                          data-testid={`handle-${day}-${index}-end`}
                          onMouseDown={(event) => {
                            if (disabled) return;
                            event.stopPropagation();
                            setInteraction({ kind: 'resize', day, index, edge: 'end' });
                          }}
                          onKeyDown={(event) => handleKeyDown(event, day, index, 'end')}
                          className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      )}
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
                      {segIndex === 0 && (
                        <span className="pointer-events-none absolute inset-x-1 top-3 truncate text-[10px] leading-tight text-fg-muted">
                          {interval[0]}–{interval[1]}
                        </span>
                      )}
                    </div>
                  ));
                })}

                {interaction?.kind === 'create' && interaction.day === day && (() => {
                  const s = Math.min(interaction.anchorMinutes, interaction.currentMinutes);
                  const e = Math.max(interaction.anchorMinutes, interaction.currentMinutes);
                  return (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1 rounded-md border border-accent bg-accent/30"
                      style={{ top: `${minutesToPercent(s)}%`, height: `${minutesToPercent(e - s)}%` }}
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
