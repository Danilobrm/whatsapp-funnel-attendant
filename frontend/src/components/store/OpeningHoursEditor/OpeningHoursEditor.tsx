import { Plus, Trash2 } from 'lucide-react';

import { DAY_KEYS, type DayInterval, type DayKey, type OpeningHours } from '../../../api/store';
import { useT } from '../../../i18n/index.tsx';

interface OpeningHoursEditorProps {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}

export function OpeningHoursEditorSkeleton() {
  return (
    <div aria-busy="true" data-testid="opening-hours-skeleton" className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 w-full animate-pulse rounded-xl bg-skeleton" />
      ))}
    </div>
  );
}

export default function OpeningHoursEditor({
  value,
  onChange,
  disabled = false,
}: OpeningHoursEditorProps) {
  const t = useT();

  function intervalsFor(day: DayKey): DayInterval[] {
    return value[day] ?? [];
  }

  function setIntervals(day: DayKey, intervals: DayInterval[]) {
    const next = { ...value };
    if (intervals.length === 0) {
      delete next[day];
    } else {
      next[day] = intervals;
    }
    onChange(next);
  }

  function addInterval(day: DayKey) {
    setIntervals(day, [...intervalsFor(day), ['18:00', '23:00']]);
  }

  function removeInterval(day: DayKey, index: number) {
    setIntervals(
      day,
      intervalsFor(day).filter((_, i) => i !== index),
    );
  }

  function patchInterval(day: DayKey, index: number, patch: Partial<{ start: string; end: string }>) {
    setIntervals(
      day,
      intervalsFor(day).map((interval, i) =>
        i === index
          ? [patch.start ?? interval[0], patch.end ?? interval[1]]
          : interval,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DAY_KEYS.map((day) => {
        const intervals = intervalsFor(day);
        return (
          <div key={day} className="flex flex-wrap items-start gap-3">
            <span className="w-20 flex-none pt-2 text-sm text-fg-muted">
              {t(`store.hours.days.${day}`)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {intervals.length === 0 && (
                <span className="pt-2 text-[13px] text-fg-subtle">
                  {t('store.hours.closed')}
                </span>
              )}
              {intervals.map(([start, end], index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.start')}`}
                    value={start}
                    disabled={disabled}
                    onChange={(e) =>
                      patchInterval(day, index, { start: e.target.value })
                    }
                    className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
                  />
                  <span className="text-fg-subtle">—</span>
                  <input
                    type="time"
                    aria-label={`${t(`store.hours.days.${day}`)} — ${t('store.hours.end')}`}
                    value={end}
                    disabled={disabled}
                    onChange={(e) =>
                      patchInterval(day, index, { end: e.target.value })
                    }
                    className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => removeInterval(day, index)}
                    disabled={disabled}
                    aria-label={t('store.hours.removeInterval')}
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addInterval(day)}
                disabled={disabled}
                className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[13px] font-medium text-accent transition hover:bg-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {t('store.hours.addInterval')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
