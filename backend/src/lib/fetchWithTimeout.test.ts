import { describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "./fetchWithTimeout.js";

describe("fetchWithTimeout", () => {
  it("aborts the request once the timeout elapses", async () => {
    vi.useFakeTimers();
    const timedFetch = fetchWithTimeout(5_000);

    let seenSignal: AbortSignal | undefined;
    const nativeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, options) => {
        seenSignal = (options as RequestInit).signal ?? undefined;
        return new Promise(() => {}) as Promise<Response>;
      });

    void timedFetch("http://slow.example/api");
    await Promise.resolve();

    expect(seenSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(seenSignal?.aborted).toBe(true);

    nativeFetch.mockRestore();
    vi.useRealTimers();
  });
});
