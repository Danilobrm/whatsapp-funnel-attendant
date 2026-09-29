/**
 * Início do dia corrente NO FUSO DA LOJA, como instante UTC. "Concluídos
 * hoje" é o dia do restaurante, não o do servidor (que roda em UTC):
 * às 22h em São Paulo já é amanhã em UTC.
 */
export function startOfDayInZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  // Relógio local da loja lido como se fosse UTC − instante real = offset.
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const localMidnightAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
  );
  return new Date(localMidnightAsUtc - offsetMs);
}
