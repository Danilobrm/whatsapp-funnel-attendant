import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/tenant.repository.js", () => ({
  findTenantByWhatsAppPhoneNumberId: vi.fn(),
}));

const repository = await import("../repositories/tenant.repository.js");
const {
  TenantNotFoundError,
  invalidateTenantCache,
  resolveTenantByWhatsAppPhoneNumberId: resolve,
} = await import("./tenant.service.js");

const find =
  repository.findTenantByWhatsAppPhoneNumberId as unknown as ReturnType<
    typeof vi.fn
  >;

const DEMO = { id: 1, slug: "pizzaria-demo", name: "Pizzaria Demo" };

beforeEach(() => {
  vi.resetAllMocks();
  invalidateTenantCache();
});

describe("resolveTenantByWhatsAppPhoneNumberId", () => {
  it("resolve o phone_number_id para o tenant", async () => {
    find.mockResolvedValue(DEMO);

    await expect(resolve("1234567890")).resolves.toEqual(DEMO);
    expect(find).toHaveBeenCalledWith("1234567890");
  });

  it("cacheia o acerto — três leituras, uma consulta", async () => {
    find.mockResolvedValue(DEMO);

    await resolve("1234567890");
    await resolve("1234567890");
    await resolve("1234567890");

    expect(find).toHaveBeenCalledTimes(1);
  });

  it("NÃO cacheia o miss — a chave vem de fora e cresceria sem limite", async () => {
    find.mockResolvedValue(null);

    await expect(resolve("55555")).rejects.toBeInstanceOf(TenantNotFoundError);
    await expect(resolve("55555")).rejects.toBeInstanceOf(TenantNotFoundError);

    expect(find).toHaveBeenCalledTimes(2);
  });

  it("invalida um id específico sem derrubar os outros", async () => {
    find.mockResolvedValue(DEMO);
    await resolve("111111");
    await resolve("222222");
    expect(find).toHaveBeenCalledTimes(2);

    invalidateTenantCache("111111");
    await resolve("111111");
    await resolve("222222");

    expect(find).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["nulo", null],
    ["indefinido", undefined],
    ["vazio", "   "],
    ["com letras", "abc123456"],
    ["curto demais", "123"],
    ["com barra", "../etc/passwd"],
  ])("rejeita id %s sem tocar no banco", async (_label, id) => {
    await expect(resolve(id)).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(find).not.toHaveBeenCalled();
  });
});
