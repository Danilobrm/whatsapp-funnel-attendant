import { describe, expect, it } from "vitest";

import { asTenantId } from "../../modules/tenants/types/tenant.types.js";
import { assertTenantScoped } from "./tenantScope.js";

const TENANT = asTenantId(7);
const OTHER_TENANT = asTenantId(9);

describe("assertTenantScoped", () => {
  it("passa quando o SQL referencia tenant_id e o primeiro parâmetro bate", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        TENANT,
      ]),
    ).not.toThrow();
  });

  it("é case-insensitive para o nome da coluna", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE TENANT_ID = $1", [
        TENANT,
      ]),
    ).not.toThrow();
  });

  it("lança quando o SQL não menciona tenant_id", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE id = $1", [TENANT]),
    ).toThrow(/não referencia tenant_id/);
  });

  it("lança quando o primeiro parâmetro não é o tenantId da chamada", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        OTHER_TENANT,
      ]),
    ).toThrow(/primeiro parâmetro vinculado/);
  });

  it("lança quando o tenantId nem foi passado como parâmetro", () => {
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", []),
    ).toThrow(/primeiro parâmetro vinculado/);
  });

  it("lança quando o primeiro parâmetro é um id de outra entidade por engano", () => {
    // Bug clássico: passar conversationId no lugar de tenantId.
    const conversationId = 42;
    expect(() =>
      assertTenantScoped(TENANT, "SELECT * FROM x WHERE tenant_id = $1", [
        conversationId,
      ]),
    ).toThrow(/primeiro parâmetro vinculado/);
  });
});
