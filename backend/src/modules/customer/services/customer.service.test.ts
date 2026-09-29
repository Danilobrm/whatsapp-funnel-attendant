import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/customer.repository.js", () => ({ upsertCustomer: vi.fn() }));

const repo = await import("../repositories/customer.repository.js");
const { customerPhoneFor, resolveCustomer } =
  await import("./customer.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const upsertCustomer = repo.upsertCustomer as unknown as ReturnType<
  typeof vi.fn
>;
const TENANT = asTenantId(2);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("customerPhoneFor", () => {
  it("uses the wa_id as the phone on WhatsApp", () => {
    expect(customerPhoneFor("whatsapp", "5561990000001")).toBe("5561990000001");
  });

  it("strips the sim- prefix for simulated customers", () => {
    expect(customerPhoneFor("simulator", "sim-5561990000009")).toBe(
      "5561990000009",
    );
  });

  it("keeps the admin default contact as-is", () => {
    expect(customerPhoneFor("simulator", "admin-3")).toBe("admin-3");
  });

  // Um contato de WhatsApp que por acaso comece com "sim-" não é simulado.
  it("only treats sim- as a prefix on the simulator channel", () => {
    expect(customerPhoneFor("whatsapp", "sim-1")).toBe("sim-1");
  });
});

describe("resolveCustomer", () => {
  it("registers the customer by phone with the profile name", async () => {
    const customer = {
      id: 1,
      phone: "5561990000001",
      name: "Ana",
      lastAddress: null,
    };
    upsertCustomer.mockResolvedValue(customer);

    await expect(
      resolveCustomer(TENANT, "whatsapp", "5561990000001", "Ana"),
    ).resolves.toBe(customer);
    expect(upsertCustomer).toHaveBeenCalledWith(TENANT, "5561990000001", "Ana");
  });

  // Sem cadastro o agente só perde o contexto de recorrente; o cliente é atendido.
  it("never throws — a repository failure becomes null", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upsertCustomer.mockRejectedValue(new Error("db down"));

    await expect(
      resolveCustomer(TENANT, "whatsapp", "1", null),
    ).resolves.toBeNull();
  });
});
