/**
 * Matemática pura do editor de horário em grade — minutos do dia ↔ "HH:MM".
 * Sem DOM, sem React: testável sem montar componente.
 */

export const MINUTES_IN_DAY = 24 * 60;
export const SLOT_STEP_MINUTES = 15;

/** Arredonda para o step mais próximo (15min por padrão). */
export function snapToStep(
  minutes: number,
  step: number = SLOT_STEP_MINUTES,
): number {
  return Math.round(minutes / step) * step;
}

/** Dobra qualquer inteiro de minutos pro intervalo [0, 1440) — aritmética circular do dia. */
export function wrapMinutes(minutes: number): number {
  return ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

/** "HH:MM" — 1440 (meia-noite do fim do dia) vira "00:00", não "24:00". */
export function minutesToLabel(minutes: number): string {
  const wrapped = wrapMinutes(minutes);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function labelToMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
