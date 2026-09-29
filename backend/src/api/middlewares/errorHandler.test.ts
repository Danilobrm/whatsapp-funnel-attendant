import multer from "multer";
import { describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  UnauthorizedError,
} from "../../modules/auth/auth.errors.js";
import { InvalidInputError } from "../../modules/errors/invalidInput.error.js";
import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { InvalidSettingsError } from "../../modules/settings/settings.service.js";
import { TenantNotFoundError } from "../../modules/tenants/tenant.service.js";
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
});
