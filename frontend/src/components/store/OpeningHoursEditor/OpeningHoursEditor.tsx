import type { OpeningHours } from '../../../api/store/store.ts';
import WeekHoursGrid, { WeekHoursGridSkeleton } from '../WeekHoursGrid/WeekHoursGrid.tsx';

interface OpeningHoursEditorProps {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  disabled?: boolean;
}

export function OpeningHoursEditorSkeleton() {
  return (
    <div aria-busy="true" data-testid="opening-hours-skeleton">
      <WeekHoursGridSkeleton />
    </div>
  );
}

/**
 * Casca fina: a grade semanal (`WeekHoursGrid`) já faz tudo. Existe como
 * componente próprio pra manter o mesmo ponto de entrada que `Store.tsx` usa
 * (`value`/`onChange`/`disabled`) caso o editor ganhe mais UI ao redor depois
 * (aviso de fuso, atalho "copiar pra todos os dias" etc.).
 */
export default function OpeningHoursEditor({
  value,
  onChange,
  disabled = false,
}: OpeningHoursEditorProps) {
  return (
    <WeekHoursGrid value={value} onChange={onChange} disabled={disabled} />
  );
}
