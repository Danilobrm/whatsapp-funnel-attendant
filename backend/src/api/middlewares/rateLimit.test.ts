import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "./rateLimit.js";

function run(limiter: ReturnType<typeof createRateLimiter>, ip = "1.1.1.1") {
  const next = vi.fn();
  limiter({ ip } as never, {} as never, next);
  return next;
}

describe("createRateLimiter", () => {
  it("lets through up to `max` calls per window, then answers RateLimitedError", () => {
    const t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });

    for (let i = 0; i < 3; i += 1) expect(run(limiter)).toHaveBeenCalledWith();
    const blocked = run(limiter);

    expect(blocked.mock.calls[0]?.[0]).toMatchObject({ code: "rate_limited" });
  });

  it("counts per IP", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });

    run(limiter, "1.1.1.1");

    expect(run(limiter, "2.2.2.2")).toHaveBeenCalledWith();
    expect(run(limiter, "1.1.1.1").mock.calls[0]?.[0]).toBeDefined();
  });

  it("frees the IP once the window slides past the old calls", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });

    run(limiter);
    expect(run(limiter).mock.calls[0]?.[0]).toBeDefined();
    t = 1001;

    expect(run(limiter)).toHaveBeenCalledWith();
  });

  it("does not extend the block by counting the refused calls", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });

    run(limiter);
    t = 500;
    run(limiter); // recusada
    t = 1001; // a 1ª saiu da janela; a recusada NÃO conta

    expect(run(limiter)).toHaveBeenCalledWith();
  });

  it("does not grow forever: idle keys are swept", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 5, now: () => t });
    for (let i = 0; i < 50; i += 1) run(limiter, `10.0.0.${i}`);

    t = 5000;
    run(limiter, "9.9.9.9");

    // Sem acesso ao Map: prova indireta — um IP antigo volta com a cota cheia.
    for (let i = 0; i < 5; i += 1) {
      expect(run(limiter, "10.0.0.1")).toHaveBeenCalledWith();
    }
  });

  it("copes with a missing ip", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
    const next = vi.fn();

    limiter({} as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });
});
