import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertCustomer = vi.fn();
const { CustomerService } = await import("./customer.service.js");
const service = new CustomerService({ upsertCustomer } as never);
const resolveCustomer = service.resolveCustomer.bind(service);
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(2);

beforeEach(() => {
  vi.resetAllMocks();
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
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    upsertCustomer.mockRejectedValue(new Error("db down"));

    await expect(
      resolveCustomer(TENANT, "whatsapp", "1", null),
    ).resolves.toBeNull();
  });
});
