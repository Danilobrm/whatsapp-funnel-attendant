import multer from "multer";
import { describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  UnauthorizedError,
} from "../../modules/auth/errors/auth.errors.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import {
  InvalidPublicCartError,
  RateLimitedError,
} from "../../modules/menulink/errors/menuLink.errors.js";
import { GeoUnavailableError } from "../../modules/geo/errors/geo.errors.js";
import {
  InvalidOrderError,
  InvalidTransitionError,
  OrderNotFoundError,
} from "../../modules/order/errors/order.errors.js";
import { InvalidSettingsError } from "../../modules/settings/services/settings.service.js";
import { TenantNotFoundError } from "../../modules/tenants/services/tenant.service.js";
import { errorHandler } from "./errorHandler.js";

function makeRes() {
  const res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("errorHandler", () => {
  it("maps InvalidSettingsError to 422 with code/field payload", () => {
    const res = makeRes();

    errorHandler(
      new InvalidSettingsError("unsupported_language", "languages"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "unsupported_language",
      field: "languages",
    });
  });

  it("maps generic Error to 500 without leaking the driver message", () => {
    const res = makeRes();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(
      new Error("connect ECONNREFUSED 10.0.1.7:5432"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0]?.[0] as { message: string };
    expect(body).toMatchObject({ status: "error", code: "internal_error" });
    expect(body.message).not.toContain("ECONNREFUSED");
    expect(body.message).not.toContain("10.0.1.7");
    // O detalhe não some — ele vai para o log do servidor.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it.each([
    ["missing_token"],
    ["invalid_token"],
    ["expired_token"],
    ["invalid_credentials"],
  ] as const)("maps UnauthorizedError(%s) to 401", (code) => {
    const res = makeRes();

    errorHandler(
      new UnauthorizedError(code),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "unauthorized",
      code,
    });
  });

  it("never leaks a message on the 401 branch", () => {
    const res = makeRes();

    errorHandler(
      new UnauthorizedError("invalid_credentials"),
      {} as never,
      res as never,
      vi.fn(),
    );

    // O `code` é o contrato — a mensagem seria pt-BR congelado (mata o i18n) e
    // aqui contaria qual metade da credencial estava errada.
    const payload = res.json.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("message");
    expect(JSON.stringify(payload)).not.toContain("Não autenticado");
  });

  it("maps ForbiddenError to 403 without a message", () => {
    const res = makeRes();

    errorHandler(
      new ForbiddenError("tenant_mismatch"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "forbidden",
      code: "tenant_mismatch",
    });
    expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("message");
  });

  it("maps TenantNotFoundError to 404 without echoing the key", () => {
    const res = makeRes();

    errorHandler(
      new TenantNotFoundError("nao-existe"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "not_found",
      code: "tenant_not_found",
    });
    expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("slug");
  });

  it("does not echo non-Error thrown values", () => {
    const res = makeRes();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler("string-thrown" as never, {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0]?.[0] as { message: string };
    expect(body).toMatchObject({ status: "error", code: "internal_error" });
    expect(body.message).not.toContain("string-thrown");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("maps InvalidInputError to 422 with code and field", () => {
    const res = makeRes();

    errorHandler(
      new InvalidInputError("text_required", "text"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "text_required",
      field: "text",
    });
  });

  it("maps GeoUnavailableError to 502 with code only (no detail leak)", () => {
    const res = makeRes();

    errorHandler(
      new GeoUnavailableError("http_504"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(502);
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "unavailable",
      code: "geo_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("http_504");
  });

  it("maps InvalidMenuError to 422 with code and field", () => {
    const res = makeRes();

    errorHandler(
      new InvalidMenuError("min_greater_than_max", "max_select"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "min_greater_than_max",
      field: "max_select",
    });
  });

  it("maps a MulterError (arquivo grande demais) to 422 image_too_large", () => {
    const res = makeRes();

    errorHandler(
      new multer.MulterError("LIMIT_FILE_SIZE"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "image_too_large",
      field: "image",
    });
  });

  it("maps OrderNotFoundError to 404 with code only", () => {
    const res = makeRes();
    errorHandler(new OrderNotFoundError(), {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "not_found",
      code: "order_not_found",
    });
  });

  it("maps InvalidTransitionError to 409 with from/to", () => {
    const res = makeRes();
    errorHandler(
      new InvalidTransitionError("completed", "accepted"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "conflict",
      code: "invalid_transition",
      from: "completed",
      to: "accepted",
    });
  });

  it("maps InvalidOrderError to 422 with code/field", () => {
    const res = makeRes();
    errorHandler(
      new InvalidOrderError("reject_reason_required", "reason"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "reject_reason_required",
      field: "reason",
    });
  });

  it("maps InvalidPublicCartError to 422 with code and the per-line problems", () => {
    const res = makeRes();
    errorHandler(
      new InvalidPublicCartError("cart_invalid", [
        { code: "size_required", lineIndex: 0 },
      ]),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "cart_invalid",
      problems: [{ code: "size_required", lineIndex: 0 }],
    });
  });

  it("maps an empty public cart to 422 cart_empty with no problems", () => {
    const res = makeRes();
    errorHandler(
      new InvalidPublicCartError("cart_empty"),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      code: "cart_empty",
      problems: [],
    });
  });

  it("maps RateLimitedError to 429 with code only (no message)", () => {
    const res = makeRes();
    errorHandler(new RateLimitedError(), {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(429);
    const body = res.json.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      status: "rate_limited",
      code: "rate_limited",
    });
    expect(body).not.toHaveProperty("message");
  });

  it("maps the menu-link 401 codes like any other auth failure (code only)", () => {
    for (const code of ["invalid_menu_link", "expired_menu_link"] as const) {
      const res = makeRes();
      errorHandler(
        new UnauthorizedError(code),
        {} as never,
        res as never,
        vi.fn(),
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json.mock.calls[0]?.[0]).toMatchObject({ code });
      expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("message");
    }
  });
});
