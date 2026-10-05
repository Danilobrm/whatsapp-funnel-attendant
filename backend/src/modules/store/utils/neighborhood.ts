/**
 * Chave de busca de bairro: sem acento, minúscula, espaços colapsados. É o
 * que o agente compara contra o que o cliente escreve (fase 2) e o que o
 * `UNIQUE (tenant_id, neighborhood_key)` de `delivery_zones` impede duplicar.
 */
export function normalizeNeighborhood(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
