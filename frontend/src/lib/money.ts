/**
 * Dinheiro em centavos, inteiro, o tempo todo — formatação BRL só na borda
 * (aqui). Nunca guardar ou calcular em float.
 */
export function formatBRL(cents: number): string {
  // `Intl` separa "R$" do valor com um espaço não separável (U+00A0 ou
  // U+202F, dependendo da versão de ICU), que quebra comparação exata em
  // teste — normaliza pro espaço comum (U+0020).
  return (cents / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/[  ]/g, ' ');
}

/**
 * Lê o texto de um `<input>` de dinheiro em pt-BR ("R$ 45,50", "1.234,56") e
 * devolve centavos inteiros. Ponto é separador de milhar, vírgula é decimal
 * — a mesma convenção de `formatBRL`. `null` quando não dá pra interpretar.
 */
export function parseBRLInput(text: string): number | null {
  const cleaned = text.replace(/[^0-9,]/g, '');
  if (cleaned.length === 0) return null;

  const normalized = cleaned.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}
