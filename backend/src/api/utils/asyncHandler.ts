import type { RequestHandler } from "express";

/**
 * Wraps an async Express handler so rejected promises are forwarded to
 * the error middleware via `next(err)`. Express 4 does not do this by
 * default, and a bare `async` handler that throws will surface as an
 * unhandledRejection and crash the process.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
