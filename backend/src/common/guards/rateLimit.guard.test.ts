import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { RATE_LIMIT_KEY } from "../decorators/auth.decorators.js";
import { RateLimitGuard } from "./rateLimit.guard.js";

class Ctl {}

function handlerWith(name: string, limit?: { windowMs: number; max: number }) {
  const fn = { [name]: () => {} }[name] as () => void;
  if (limit) Reflect.defineMetadata(RATE_LIMIT_KEY, limit, fn);
  return fn;
}

function ctx(handler: () => void, ip = "1.1.1.1") {
  return {
    getHandler: () => handler,
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as never;
}

describe("RateLimitGuard", () => {
  it("passes up to `max` calls, then throws RateLimitedError", () => {
    const guard = new RateLimitGuard(new Reflector(), () => 0);
    const h = handlerWith("get", { windowMs: 1000, max: 2 });

    expect(guard.canActivate(ctx(h))).toBe(true);
    expect(guard.canActivate(ctx(h))).toBe(true);
    expect(() => guard.canActivate(ctx(h))).toThrowError(
      expect.objectContaining({ code: "rate_limited" }),
    );
  });

  it("counts per IP", () => {
    const guard = new RateLimitGuard(new Reflector(), () => 0);
    const h = handlerWith("get", { windowMs: 1000, max: 1 });

    guard.canActivate(ctx(h, "1.1.1.1"));

    expect(guard.canActivate(ctx(h, "2.2.2.2"))).toBe(true);
    expect(() => guard.canActivate(ctx(h, "1.1.1.1"))).toThrow();
  });

  it("gives each handler its own bucket (GET and POST do not add up)", () => {
    const guard = new RateLimitGuard(new Reflector(), () => 0);
    const get = handlerWith("getMenu", { windowMs: 1000, max: 1 });
    const post = handlerWith("postCart", { windowMs: 1000, max: 1 });

    guard.canActivate(ctx(get));

    expect(guard.canActivate(ctx(post))).toBe(true);
  });

  it("does not limit a handler without @RateLimit", () => {
    const guard = new RateLimitGuard(new Reflector(), () => 0);
    const h = handlerWith("free");

    for (let i = 0; i < 100; i += 1)
      expect(guard.canActivate(ctx(h))).toBe(true);
  });
});
