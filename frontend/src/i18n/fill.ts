/**
 * Substitui `{placeholders}` numa string já traduzida.
 * Fica fora do `t()` de propósito: interpolação é formatação, não tradução.
 */
export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
