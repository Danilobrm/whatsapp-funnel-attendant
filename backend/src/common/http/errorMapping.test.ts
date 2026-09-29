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
import { AllExceptionsFilter } from "../filters/allExceptions.filter.js";

/** Passa pelo adaptador real do Nest, que delega ao `mapError`. */
function handle(error: unknown, res: ReturnType<typeof makeRes>) {
  new AllExceptionsFilter().catch(error, {
    switchToHttp: () => ({ getResponse: () => res }),
  } as never);
}

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

describe("error mapping (AllExceptionsFilter → mapError)", () => {
  it("maps InvalidSettingsError to 422 with code/field payload", () => {
    const res = makeRes();

    handle(new InvalidSettingsError("unsupported_language", "languages"), res);

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

    handle(new Error("connect ECONNREFUSED 10.0.1.7:5432"), res);

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

    handle(new UnauthorizedError(code), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "unauthorized",
      code,
    });
  });

  it("never leaks a message on the 401 branch", () => {
    const res = makeRes();

    handle(new UnauthorizedError("invalid_credentials"), res);

    // O `code` é o contrato — a mensagem seria pt-BR congelado (mata o i18n) e
    // aqui contaria qual metade da credencial estava errada.
    const payload = res.json.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("message");
    expect(JSON.stringify(payload)).not.toContain("Não autenticado");
  });

  it("maps ForbiddenError to 403 without a message", () => {
    const res = makeRes();

    handle(new ForbiddenError("tenant_mismatch"), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "forbidden",
      code: "tenant_mismatch",
    });
    expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("message");
  });

  it("maps TenantNotFoundError to 404 without echoing the key", () => {
    const res = makeRes();

    handle(new TenantNotFoundError("nao-existe"), res);

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

    handle("string-thrown" as never, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0]?.[0] as { message: string };
    expect(body).toMatchObject({ status: "error", code: "internal_error" });
    expect(body.message).not.toContain("string-thrown");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("maps InvalidInputError to 422 with code and field", () => {
    const res = makeRes();

    handle(new InvalidInputError("text_required", "text"), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "text_required",
      field: "text",
    });
  });

  it("maps GeoUnavailableError to 502 with code only (no detail leak)", () => {
    const res = makeRes();

    handle(new GeoUnavailableError("http_504"), res);

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

    handle(new InvalidMenuError("min_greater_than_max", "max_select"), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "min_greater_than_max",
      field: "max_select",
    });
  });

  it("maps a MulterError (arquivo grande demais) to 422 image_too_large", () => {
    const res = makeRes();

    handle(new multer.MulterError("LIMIT_FILE_SIZE"), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "image_too_large",
      field: "image",
    });
  });

  it("maps OrderNotFoundError to 404 with code only", () => {
    const res = makeRes();
    handle(new OrderNotFoundError(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "not_found",
      code: "order_not_found",
    });
  });

  it("maps InvalidTransitionError to 409 with from/to", () => {
    const res = makeRes();
    handle(new InvalidTransitionError("completed", "accepted"), res);

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
    handle(new InvalidOrderError("reject_reason_required", "reason"), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      status: "invalid",
      code: "reject_reason_required",
      field: "reason",
    });
  });

  it("maps InvalidPublicCartError to 422 with code and the per-line problems", () => {
    const res = makeRes();
    handle(
      new InvalidPublicCartError("cart_invalid", [
        { code: "size_required", lineIndex: 0 },
      ]),
      res,
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
    handle(new InvalidPublicCartError("cart_empty"), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      code: "cart_empty",
      problems: [],
    });
  });

  it("maps RateLimitedError to 429 with code only (no message)", () => {
    const res = makeRes();
    handle(new RateLimitedError(), res);

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
      handle(new UnauthorizedError(code), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json.mock.calls[0]?.[0]).toMatchObject({ code });
      expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty("message");
    }
  });
});
