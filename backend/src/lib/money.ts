/**
 * Centavos → "R$ 1.234,56". Manual (sem `Intl`): a saída precisa ser idêntica
 * em qualquer ICU/servidor porque vira texto que o cliente lê no WhatsApp.
 */
export function formatBRL(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${reais},${centavos}`;
}
