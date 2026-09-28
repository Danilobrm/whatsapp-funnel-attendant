/**
 * Horário de funcionamento — puro, sem banco. `isOpenAt` e `nextOpening`
 * avaliam sempre no fuso da LOJA (`settings.timezone`), nunca no fuso do
 * servidor: um restaurante em São Paulo não pode fechar cedo porque o
 * container roda em UTC.
 */

export const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

/** `["11:00", "15:00"]`. Cruzar meia-noite (`["18:00", "02:00"]`) é válido. */
export type DayInterval = [string, string];

export type OpeningHours = Partial<Record<DayKey, DayInterval[]>>;

export interface StoreHoursSettings {
  timezone: string;
  openingHours: OpeningHours;
  paused: boolean;
}

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
  sat: "Sáb",
  sun: "Dom",
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

function prevDay(day: DayKey): DayKey {
  const index = DAY_KEYS.indexOf(day);
  return DAY_KEYS[(index + 6) % 7] as DayKey;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: DayKey;
}

const WEEKDAY_TO_KEY: Record<string, DayKey> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/** Data/hora "de parede" (ano, mês, dia, hora, minuto, dia da semana) no fuso dado. */
function wallClockAt(date: Date, timeZone: string): WallClock {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekday = WEEKDAY_TO_KEY[parts.weekday ?? ""];
  if (!weekday) {
    throw new Error(`fuso inválido ou dia da semana inesperado: ${timeZone}`);
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday,
  };
}

/** Diferença (minutos) entre o fuso dado e UTC, no instante `date`. */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const w = wallClockAt(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Converte um ano/mês/dia/hora/minuto "de parede" no fuso dado para um instante UTC. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = offsetMinutesAt(guess, timeZone);
  return new Date(guess.getTime() - offset * 60_000);
}

/** A loja está aberta no instante `date` (default: agora)? */
export function isOpenAt(
  settings: StoreHoursSettings,
  date: Date = new Date(),
): boolean {
  if (settings.paused) return false;

  const now = wallClockAt(date, settings.timezone);
  const nowMinutes = now.hour * 60 + now.minute;

  for (const [start, end] of settings.openingHours[now.weekday] ?? []) {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (e > s) {
      if (nowMinutes >= s && nowMinutes < e) return true;
    } else {
      // Cruza meia-noite: aberto de `start` até 24h, hoje.
      if (nowMinutes >= s) return true;
    }
  }

  // Intervalo de ONTEM que cruzou meia-noite ainda pode cobrir a madrugada de hoje.
  for (const [start, end] of settings.openingHours[prevDay(now.weekday)] ??
    []) {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (e <= s && nowMinutes < e) return true;
  }

  return false;
}

/**
 * Próximo instante em que a loja abre, a partir de `date`. `null` quando já
 * está aberta, pausada, ou não há horário nenhum cadastrado nas duas próximas
 * semanas.
 */
export function nextOpening(
  settings: StoreHoursSettings,
  date: Date = new Date(),
): Date | null {
  if (settings.paused) return null;
  if (isOpenAt(settings, date)) return null;

  const base = wallClockAt(date, settings.timezone);
  let best: Date | null = null;

  for (let offset = 0; offset <= 13; offset++) {
    const day = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
    const weekday = DAY_KEYS[(day.getUTCDay() + 6) % 7] as DayKey;

    for (const [start] of settings.openingHours[weekday] ?? []) {
      const [hh, mm] = start.split(":").map(Number);
      const candidate = zonedTimeToUtc(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        hh ?? 0,
        mm ?? 0,
        settings.timezone,
      );
      if (
        candidate.getTime() > date.getTime() &&
        (!best || candidate.getTime() < best.getTime())
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hours = Number(h);
  return m === "00" ? `${hours}h` : `${hours}h${m}`;
}

/** Texto pt-BR pronto para o bot: "Seg a Sex 11h às 15h e 18h às 23h30". */
export function describeHours(settings: StoreHoursSettings): string {
  interface Group {
    days: DayKey[];
    intervals: DayInterval[];
  }

  const groups: Group[] = [];
  for (const day of DAY_KEYS) {
    const intervals = settings.openingHours[day] ?? [];
    const last = groups[groups.length - 1];
    if (last && JSON.stringify(last.intervals) === JSON.stringify(intervals)) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], intervals });
    }
  }

  const parts: string[] = [];
  for (const group of groups) {
    if (group.intervals.length === 0) continue;

    const first = group.days[0] as DayKey;
    const lastDay = group.days[group.days.length - 1] as DayKey;
    const dayLabel =
      group.days.length === 1
        ? DAY_LABELS[first]
        : group.days.length === 2
          ? `${DAY_LABELS[first]} e ${DAY_LABELS[lastDay]}`
          : `${DAY_LABELS[first]} a ${DAY_LABELS[lastDay]}`;

    const schedule = group.intervals
      .map(([start, end]) => `${formatTime(start)} às ${formatTime(end)}`)
      .join(" e ");

    parts.push(`${dayLabel} ${schedule}`);
  }

  return parts.length > 0 ? parts.join(". ") : "Fechado todos os dias";
}
