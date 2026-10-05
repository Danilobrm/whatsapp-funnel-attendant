/**
 * `YYYY-MM-DD` (dia da loja, já calculado no backend) → rótulo curto do dia
 * da semana. Ancorado ao meio-dia UTC e formatado em UTC: o dia é uma data de
 * calendário, não um instante, e não pode escorregar pelo fuso do navegador.
 */
export function weekdayLabel(dayKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${dayKey}T12:00:00Z`))
    .replace('.', '');
}

/** "ter, 18:00" no fuso da LOJA — quando a loja abre de novo. */
export function openingLabel(
  iso: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
    .format(new Date(iso))
    .replace('.', '');
}

/** Substitui `{n}`/`{when}` num texto do i18n (o `t()` do projeto não interpola). */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Percentual inteiro para listas; 0 quando o total é 0. */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
