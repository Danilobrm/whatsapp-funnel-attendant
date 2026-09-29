import { NotFoundException } from "@nestjs/common";
import multer from "multer";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../api/middlewares/errorHandler.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../modules/auth/errors/auth.errors.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { GeoUnavailableError } from "../../modules/geo/errors/geo.errors.js";
import {
  InvalidPublicCartError,
  RateLimitedError,
} from "../../modules/menulink/errors/menuLink.errors.js";
import {
  InvalidOrderError,
  InvalidTransitionError,
  OrderNotFoundError,
} from "../../modules/order/errors/order.errors.js";
import { InvalidSettingsError } from "../../modules/settings/services/settings.service.js";
import { TenantNotFoundError } from "../../modules/tenants/services/tenant.service.js";
import { AllExceptionsFilter } from "./allExceptions.filter.js";

function makeRes(headersSent = false) {
  const res = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function runFilter(error: unknown, res = makeRes()) {
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  new AllExceptionsFilter().catch(error, host as never);
  return res;
}

function runLegacy(error: unknown) {
  const res = makeRes();
  errorHandler(error, {} as never, res as never, vi.fn());
  return res;
}

const withoutClock = (body: unknown) => {
  const { checkedAt, ...rest } = body as Record<string, unknown>;
  expect(typeof checkedAt).toBe("string");
  return rest;
};

const DOMAIN_ERRORS: [string, unknown, number][] = [
  ["UnauthorizedError", new UnauthorizedError("invalid_token"), 401],
  ["ForbiddenError", new ForbiddenError("invalid_signature"), 403],
  ["TenantNotFoundError", new TenantNotFoundError("x"), 404],
  [
    "InvalidSettingsError",
    new InvalidSettingsError("unsupported_language", "languages"),
    422,
  ],
  ["InvalidInputError", new InvalidInputError("text_required", "text"), 422],
  [
    "InvalidMenuError",
    new InvalidMenuError("min_greater_than_max", "max_select"),
    422,
  ],
  [
    "InvalidOrderError",
    new InvalidOrderError("reject_reason_required", "reason"),
    422,
  ],
  ["InvalidPublicCartError", new InvalidPublicCartError("cart_empty"), 422],
  ["RateLimitedError", new RateLimitedError(), 429],
  ["OrderNotFoundError", new OrderNotFoundError(), 404],
  [
    "InvalidTransitionError",
    new InvalidTransitionError("completed", "accepted"),
    409,
  ],
  ["GeoUnavailableError", new GeoUnavailableError("http_504"), 502],
  ["MulterError", new multer.MulterError("LIMIT_FILE_SIZE"), 422],
];

describe("AllExceptionsFilter", () => {
  it.each(DOMAIN_ERRORS)(
    "%s → same status and body as the legacy errorHandler",
    (_name, error, status) => {
      const nest = runFilter(error);
      const legacy = runLegacy(error);

      expect(nest.status).toHaveBeenCalledWith(status);
      expect(nest.status.mock.calls).toEqual(legacy.status.mock.calls);
      expect(withoutClock(nest.json.mock.calls[0]?.[0])).toEqual(
        withoutClock(legacy.json.mock.calls[0]?.[0]),
      );
    },
  );

  it("keeps the 401 body free of any message", () => {
    const res = runFilter(new UnauthorizedError("invalid_credentials"));

    expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("message");
  });

  it("maps an unknown error to 500 without leaking its message, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = runFilter(
      new Error('relation "orders" does not exist at 10.0.0.5:5432'),
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({ status: "error", code: "internal_error" });
    expect(JSON.stringify(body)).not.toMatch(/orders|10\.0\.0\.5/);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("keeps the status of Nest's own HttpException (unknown route → 404, not 500)", () => {
    const res = runFilter(new NotFoundException("Cannot GET /x"));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(withoutClock(res.json.mock.calls[0]?.[0])).toEqual({
      status: "not_found",
      code: "route_not_found",
    });
  });

  it("never writes a body once headers were sent (SSE), only ends the response", () => {
    const res = runFilter(new Error("boom"), makeRes(true));

    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
