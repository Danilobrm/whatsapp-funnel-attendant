import type { TenantId } from "../../modules/tenants/types/tenant.types.js";

/**
 * Valida que uma query é de fato tenant-scoped, ANTES dela rodar. Pura — não
 * toca no banco — então serve tanto para o `TenantDb.query` (fora de
 * transação) quanto para o `TenantTx.query` (dentro de uma).
 *
 * Pega os dois jeitos mais comuns de um repository vazar dado entre tenants:
 *  1. Esquecer o filtro `tenant_id` no SQL (query solta sem WHERE/JOIN nele).
 *  2. Vincular o `tenantId` errado como parâmetro — cópia-e-cola trocando a
 *     variável, ou passando o id de outra entidade no lugar.
 *
 * O que isto NÃO prova: que o `tenant_id` no SQL está no lugar certo da
 * cláusula (WHERE vs. um comentário, por exemplo) ou que a query está
 * semanticamente correta. Isso continua sendo trabalho dos testes de
 * isolamento (ver `.claude/rules` e os testes de repository) — esta função é
 * a rede abaixo deles: pega em runtime o que uma revisão apressada deixaria
 * passar.
 */
export function assertTenantScoped(
  tenantId: TenantId,
  sql: string,
  params: readonly unknown[],
): void {
  if (!/tenant_id/i.test(sql)) {
    throw new Error(
      "assertTenantScoped: SQL não referencia tenant_id — filtro de tenant ausente.",
    );
  }
  if (params[0] !== tenantId) {
    throw new Error(
      "assertTenantScoped: o primeiro parâmetro vinculado precisa ser o tenantId desta chamada.",
    );
  }
}
