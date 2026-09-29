import { describe, expect, it } from "vitest";

import { SlidingWindowLimiter } from "./slidingWindow.js";

describe("SlidingWindowLimiter", () => {
  it("allows up to `max` calls per window, then blocks", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 1000,
      max: 3,
      now: () => 0,
    });

    expect([1, 2, 3].map(() => limiter.allow("a"))).toEqual([true, true, true]);
    expect(limiter.allow("a")).toBe(false);
  });

  it("counts per key", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 1000,
      max: 1,
      now: () => 0,
    });

    limiter.allow("a");

    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("lets calls through again once the window slides past them", () => {
    let t = 0;
    const limiter = new SlidingWindowLimiter({
      windowMs: 1000,
      max: 1,
      now: () => t,
    });

    limiter.allow("a");
    t = 999;
    expect(limiter.allow("a")).toBe(false);
    t = 1000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("does not count a blocked call against the window", () => {
    let t = 0;
    const limiter = new SlidingWindowLimiter({
      windowMs: 1000,
      max: 1,
      now: () => t,
    });

    limiter.allow("a");
    t = 500;
    limiter.allow("a"); // barrada
    t = 1000; // a 1ª saiu da janela; a barrada não pode ter ocupado o lugar
    expect(limiter.allow("a")).toBe(true);
  });
});
