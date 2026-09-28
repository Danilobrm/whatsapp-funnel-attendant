import { describe, expect, it, vi } from "vitest";

import { asyncHandler } from "./asyncHandler.js";

function makeReqResNext() {
  const req = {} as never;
  const res = {} as never;
  const next = vi.fn();
  return { req, res, next };
}

describe("asyncHandler", () => {
  it("forwards a rejected promise to next()", async () => {
    const boom = new Error("boom");
    const wrapped = asyncHandler(async () => {
      throw boom;
    });

    const { req, res, next } = makeReqResNext();
    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it("does not call next() on success", async () => {
    const wrapped = asyncHandler(async () => {
      /* handler resolved */
    });

    const { req, res, next } = makeReqResNext();
    await wrapped(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("also handles sync throws", async () => {
    const boom = new Error("sync-boom");
    const wrapped = asyncHandler(() => {
      throw boom;
    });

    const { req, res, next } = makeReqResNext();
    await expect(async () => wrapped(req, res, next)).rejects.toThrow();
  });
});
