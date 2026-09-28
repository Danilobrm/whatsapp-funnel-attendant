/**
 * Matemática pura do editor de horário em barra — conversão entre posição
 * (px/%) e minutos do dia, e minutos ↔ "HH:MM". Sem DOM, sem React: testável
 * sem montar componente.
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function minutesToPercent(minutes: number): number {
  return clamp((minutes / MINUTES_IN_DAY) * 100, 0, 100);
}

/**
 * Posição do ponteiro relativa à trilha → minutos do dia, arredondado ao
 * step. Funciona pro eixo X (barra horizontal) ou Y (grade semanal vertical)
 * — só depende de qual coordenada o chamador passa. `trackSize <= 0` (trilha
 * ainda não medida) devolve 0. Satura em [0, 1440]: usar quando a ponta NÃO
 * pode cruzar meia-noite (ex.: início de um intervalo).
 */
export function positionToMinutes(
  pointerPosition: number,
  trackStart: number,
  trackSize: number,
): number {
  if (trackSize <= 0) return 0;
  const ratio = clamp((pointerPosition - trackStart) / trackSize, 0, 1);
  return snapToStep(clamp(ratio * MINUTES_IN_DAY, 0, MINUTES_IN_DAY));
}

/**
 * Mesma conversão, mas sem saturar em [0, 1440] — o ponteiro pode continuar
 * além do fim (ou antes do início) da trilha e o valor DOBRA pro outro lado
 * do dia (aritmética circular, via `wrapMinutes`). É o que permite arrastar o
 * fim de um intervalo "pra baixo da meia-noite" na grade semanal, criando um
 * horário que cruza pro dia seguinte.
 */
export function positionToMinutesWrapped(
  pointerPosition: number,
  trackStart: number,
  trackSize: number,
): number {
  if (trackSize <= 0) return 0;
  const ratio = (pointerPosition - trackStart) / trackSize;
  return snapToStep(wrapMinutes(ratio * MINUTES_IN_DAY));
}

export interface BarSegment {
  /** % da trilha (0–100) */
  left: number;
  /** % da trilha (0–100) */
  width: number;
}

/**
 * Segmentos visuais de um intervalo [start, end) na trilha de 24h. Um
 * intervalo normal é um segmento só; um que cruza meia-noite (`end <= start`)
 * vira dois — um até o fim do dia, outro desde o início — pra parecer que a
 * barra "sai pela direita e volta pela esquerda".
 */
export function intervalSegments(startMinutes: number, endMinutes: number): BarSegment[] {
  if (endMinutes > startMinutes) {
    return [
      {
        left: minutesToPercent(startMinutes),
        width: minutesToPercent(endMinutes - startMinutes),
      },
    ];
  }

  // Cruza meia-noite: [start, 1440) e [0, end).
  const segments: BarSegment[] = [];
  if (startMinutes < MINUTES_IN_DAY) {
    segments.push({
      left: minutesToPercent(startMinutes),
      width: minutesToPercent(MINUTES_IN_DAY - startMinutes),
    });
  }
  if (endMinutes > 0) {
    segments.push({ left: 0, width: minutesToPercent(endMinutes) });
  }
  return segments;
}
