import { describe, expect, it } from "vitest";

import { UnauthorizedError } from "../../modules/auth/errors/auth.errors.js";
import { asTenantId } from "../../modules/tenants/types/tenant.types.js";

import { authOf, tenantOf } from "./authContext.js";

import type { Request } from "express";

const TENANT = asTenantId(4);

describe("authOf / tenantOf", () => {
  it("devolve o contexto quando a rota passou por requireAuth", () => {
    const req = { auth: { userId: 9, tenantId: TENANT } } as Request;

    expect(authOf(req)).toEqual({ userId: 9, tenantId: TENANT });
    expect(tenantOf(req)).toBe(TENANT);
  });

  it("lança 401 tipado quando a rota foi montada sem guard", () => {
    // Degradar para 401 é a verdade sobre a requisição. Um `req.auth!` no
    // controller viraria TypeError → 500, escondendo o erro de montagem.
    const req = {} as Request;

    expect(() => tenantOf(req)).toThrow(UnauthorizedError);
    expect(() => authOf(req)).toThrowError(
      expect.objectContaining({ code: "missing_token" }),
    );
  });
});
