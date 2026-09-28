import { DAY_KEYS, type DayInterval, type DayKey, type OpeningHours } from '../../../api/store';
import DayHoursBar, { DayHoursBarSkeleton } from '../DayHoursBar';
import { useT } from '../../../i18n/index.tsx';

interface OpeningHoursEditorProps {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}

export function OpeningHoursEditorSkeleton() {
  return (
    <div aria-busy="true" data-testid="opening-hours-skeleton" className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((i) => (
        <DayHoursBarSkeleton key={i} />
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

  function setIntervals(day: DayKey, intervals: DayInterval[]) {
    const next = { ...value };
    if (intervals.length === 0) {
      delete next[day];
    } else {
      next[day] = intervals;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {DAY_KEYS.map((day) => (
        <DayHoursBar
          key={day}
          dayLabel={t(`store.hours.days.${day}`)}
          intervals={value[day] ?? []}
          onChange={(intervals) => setIntervals(day, intervals)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
