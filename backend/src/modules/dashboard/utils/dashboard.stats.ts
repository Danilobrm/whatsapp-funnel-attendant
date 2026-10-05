import type { DailyTotal } from "../types/dashboard.types.js";

/** `YYYY-MM-DD` do instante `date` no fuso `timeZone` (o dia da LOJA, não do servidor). */
export function dayKeyInZone(date: Date, timeZone: string): string {
  // en-CA formata como ISO (2026-09-29).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD` deslocado `delta` dias — aritmética de calendário, sem fuso. */
function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta));
  return date.toISOString().slice(0, 10);
}

/**
 * Série contínua de `days` dias terminando em `todayKey`, em ordem
 * cronológica. Dia sem pedido vem do banco como AUSENTE (GROUP BY não cria
 * linha) — aqui vira zero, para o gráfico não pular dias.
 */
export function fillDays(
  rows: DailyTotal[],
  todayKey: string,
  days = 7,
): DailyTotal[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series: DailyTotal[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDayKey(todayKey, -offset);
    series.push(
      byDay.get(day) ?? { day, orders: 0, revenueCents: 0, rejected: 0 },
    );
  }
  return series;
}

/** Ticket médio em centavos inteiros; 0 sem pedidos (nada de divisão por zero). */
export function ticketCents(revenueCents: number, orders: number): number {
  return orders === 0 ? 0 : Math.round(revenueCents / orders);
}
