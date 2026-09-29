/**
 * Espelho de `backend/src/modules/store/neighborhood.ts`: sem acento,
 * minúscula, espaços colapsados. Casa o bairro do mapa com a zona de entrega
 * cadastrada pelo nome — a mesma chave do `UNIQUE (tenant_id, neighborhood_key)`.
 */
export function normalizeNeighborhood(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
