/**
 * Dinheiro em centavos, inteiro, o tempo todo — formatação BRL só na borda
 * (aqui). Nunca guardar ou calcular em float.
 */
export function formatBRL(cents: number): string {
  // `Intl` separa "R$" do valor com um espaço não separável (U+00A0 ou
  // U+202F, dependendo da versao de ICU), que quebra comparacao exata em
  // teste — normaliza pro espaco comum (U+0020).
  return (cents / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/[\u00A0\u202F]/g, ' ');
}

/**
 * Le o texto de um `<input>` de dinheiro em pt-BR ("R$ 45,50", "1.234,56") e
 * devolve centavos inteiros. Ponto e separador de milhar, virgula e decimal
 * — a mesma convencao de `formatBRL`. `null` quando nao da pra interpretar.
 */
export function parseBRLInput(text: string): number | null {
  const cleaned = text.replace(/[^0-9,]/g, '');
  if (cleaned.length === 0) return null;

  const normalized = cleaned.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}
