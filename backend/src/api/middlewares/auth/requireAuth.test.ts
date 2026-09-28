import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../../modules/auth/auth.errors.js";
import { signAuthToken } from "../../../modules/auth/jwt.js";

import { requireAuth } from "./requireAuth.js";

import type { Request, Response } from "express";

function makeReq(authorization?: string): Request {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as unknown as Request;
}

const RES = {} as Response;

let next: ReturnType<typeof vi.fn>;

beforeEach(() => {
  next = vi.fn();
});

function codeOf(): string | undefined {
  const error = next.mock.calls[0]?.[0] as UnauthorizedError | undefined;
  return error?.code;
}

describe("requireAuth", () => {
  it("popula req.auth e segue com um token válido", () => {
    const req = makeReq(`Bearer ${signAuthToken({ userId: 7, tenantId: 3 })}`);

    requireAuth(req, RES, next);

    expect(req.auth).toEqual({ userId: 7, tenantId: 3 });
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["sem header", undefined],
    ["header vazio", ""],
    // O payload é irrelevante: o caso testa que QUALQUER esquema diferente de
    // `Bearer ` é recusado. Base64 no formato `user:senha` aqui só faria
    // scanner de segredo apitar num literal que não é credencial de nada.
    ["esquema Basic", "Basic nao-e-bearer"],
    ["token cru sem Bearer", "eyJhbGciOiJIUzI1NiJ9.x.y"],
    ["Bearer minúsculo", "bearer abc"],
  ])("recusa %s com missing_token", (_label, header) => {
    const req = makeReq(header);

    requireAuth(req, RES, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(codeOf()).toBe("missing_token");
    expect(req.auth).toBeUndefined();
  });

  it("recusa token corrompido com invalid_token", () => {
    const req = makeReq("Bearer nao-e-um-jwt");

    requireAuth(req, RES, next);

    expect(codeOf()).toBe("invalid_token");
    expect(req.auth).toBeUndefined();
  });
});
