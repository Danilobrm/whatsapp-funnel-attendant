import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../../config/env.js";
import { signAuthToken } from "../../modules/auth/utils/jwt.js";
import { IS_PUBLIC_KEY } from "../decorators/auth.decorators.js";
import { AuthGuard } from "./auth.guard.js";

function contextFor(headers: Record<string, string>, isPublic = false) {
  const req: { headers: Record<string, string>; auth?: unknown } = { headers };
  const handler = () => {};
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  class Ctl {}
  const context = {
    getHandler: () => handler,
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { context: context as never, req };
}

const guard = new AuthGuard(new Reflector());

describe("AuthGuard", () => {
  it("lets a valid token through and sets req.auth", () => {
    const token = signAuthToken({ userId: 4, tenantId: 2 });
    const { context, req } = contextFor({ authorization: `Bearer ${token}` });

    expect(guard.canActivate(context)).toBe(true);
    expect(req.auth).toEqual({ userId: 4, tenantId: 2 });
  });

  it("throws missing_token without the header", () => {
    const { context } = contextFor({});

    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({ code: "missing_token" }),
    );
  });

  it("throws invalid_token for a garbage token", () => {
    const { context } = contextFor({ authorization: "Bearer lixo" });

    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({ code: "invalid_token" }),
    );
  });

  it("throws expired_token for an expired token", () => {
    const token = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS256",
      expiresIn: -10,
    });
    const { context } = contextFor({ authorization: `Bearer ${token}` });

    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({ code: "expired_token" }),
    );
  });

  it("rejects an algorithm outside the allowlist", () => {
    const token = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS512",
      expiresIn: 60,
    });
    const { context } = contextFor({ authorization: `Bearer ${token}` });

    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({ code: "invalid_token" }),
    );
  });

  it("skips @Public() handlers even without a token, without setting req.auth", () => {
    const { context, req } = contextFor({}, true);

    expect(guard.canActivate(context)).toBe(true);
    expect(req.auth).toBeUndefined();
  });
});
