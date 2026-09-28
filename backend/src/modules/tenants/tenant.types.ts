/**
 * Identidade de tenant (um restaurante).
 *
 * O tipo é "marcado" (branded) de propósito: `TenantId` é atribuível a
 * `number`, mas um `number` cru NÃO é atribuível a `TenantId`. Isso transforma
 * a troca acidental de argumentos — `findMessages(conversationId, tenantId)`
 * em vez de `(tenantId, conversationId)` — em erro de compilação em vez de
 * vazamento silencioso entre tenants.
 */
declare const tenantBrand: unique symbol;

export type TenantId = number & { readonly [tenantBrand]: true };

/**
 * Único ponto de entrada do brand. Chamado só nas fronteiras de confiança:
 * verificação do JWT, resolução do número de WhatsApp e o script de seed.
 */
export function asTenantId(value: number): TenantId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`tenant_id inválido: ${String(value)}`);
  }
  return value as TenantId;
}

export interface Tenant {
  id: TenantId;
  slug: string;
  name: string;
}
