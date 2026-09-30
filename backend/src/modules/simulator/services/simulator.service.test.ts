import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MENU,
  PRICING_SETTINGS,
  readyCart,
  ZONES,
} from "../../order/utils/fixtures.test-util.js";
import { emptyCart } from "../../order/types/cart.types.js";

const convRepo = { findConversationId: vi.fn(), upsertConversation: vi.fn() };
const custRepo = { listSimulatedCustomers: vi.fn(), upsertCustomer: vi.fn() };
const menuService = { getPublishedMenu: vi.fn() };
const storeService = { getStoreSettings: vi.fn(), listZones: vi.fn() };
const cartService = { getCart: vi.fn() };
const { SimulatorService } = await import("./simulator.service.js");
const simulator = new SimulatorService(
  convRepo as never,
  custRepo as never,
  menuService as never,
  cartService as never,
  storeService as never,
);
const createCustomer = simulator.createCustomer.bind(simulator);
const getSimulatorCart = simulator.getSimulatorCart.bind(simulator);
const listCustomers = simulator.listCustomers.bind(simulator);
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createCustomer", () => {
  it("registers the customer and opens its own simulator conversation", async () => {
    mock(custRepo.upsertCustomer).mockResolvedValue({
      id: 1,
      phone: "5561990000001",
      name: "Ana",
      lastAddress: null,
    });

    const result = await createCustomer(TENANT, {
      name: "  Ana  ",
      phone: "(61) 99000-0001".replace("(61) 99000-0001", "5561990000001"),
    });

    expect(result).toEqual({
      contactId: "5561990000001",
      name: "Ana",
      phone: "5561990000001",
    });
    expect(custRepo.upsertCustomer).toHaveBeenCalledWith(
      TENANT,
      "5561990000001",
      "Ana",
    );
    expect(convRepo.upsertConversation).toHaveBeenCalledWith(
      TENANT,
      "simulator",
      "sim-5561990000001",
      "Ana",
    );
  });

  it("strips formatting from the phone", async () => {
    mock(custRepo.upsertCustomer).mockResolvedValue({
      id: 1,
      phone: "5561990000001",
      name: "Ana",
      lastAddress: null,
    });

    await createCustomer(TENANT, { name: "Ana", phone: "+55 (61) 99000-0001" });

    expect(custRepo.upsertCustomer).toHaveBeenCalledWith(
      TENANT,
      "5561990000001",
      "Ana",
    );
  });

  it.each([
    [{ phone: "5561990000001" }, "name_required"],
    [{ name: "   ", phone: "5561990000001" }, "name_required"],
    [{ name: "x".repeat(81), phone: "5561990000001" }, "name_too_long"],
    [{ name: "Ana" }, "phone_invalid"],
    [{ name: "Ana", phone: "123" }, "phone_invalid"],
    [{ name: "Ana", phone: "1".repeat(16) }, "phone_invalid"],
    [null, "name_required"],
  ])("rejects %j with %s", async (body, code) => {
    await expect(createCustomer(TENANT, body)).rejects.toMatchObject({ code });
    expect(custRepo.upsertCustomer).not.toHaveBeenCalled();
  });
});

describe("listCustomers", () => {
  it("exposes the phone as the contactId", async () => {
    mock(custRepo.listSimulatedCustomers).mockResolvedValue([
      { id: 1, phone: "5561990000001", name: "Ana", lastAddress: null },
    ]);

    await expect(listCustomers(TENANT)).resolves.toEqual([
      { contactId: "5561990000001", name: "Ana", phone: "5561990000001" },
    ]);
  });
});

describe("getSimulatorCart", () => {
  beforeEach(() => {
    mock(menuService.getPublishedMenu).mockResolvedValue(MENU);
    mock(storeService.getStoreSettings).mockResolvedValue(PRICING_SETTINGS);
    mock(storeService.listZones).mockResolvedValue(ZONES);
  });

  it("is null when the contact never talked", async () => {
    mock(convRepo.findConversationId).mockResolvedValue(null);

    await expect(getSimulatorCart(TENANT, "admin-1")).resolves.toBeNull();
    expect(cartService.getCart).not.toHaveBeenCalled();
  });

  it("is null for an untouched cart", async () => {
    mock(convRepo.findConversationId).mockResolvedValue(3);
    mock(cartService.getCart).mockResolvedValue(emptyCart());

    await expect(getSimulatorCart(TENANT, "admin-1")).resolves.toBeNull();
  });

  it("returns the priced cart of that conversation", async () => {
    mock(convRepo.findConversationId).mockResolvedValue(3);
    mock(cartService.getCart).mockResolvedValue(readyCart());

    const view = await getSimulatorCart(TENANT, "sim-5561990000001");

    expect(convRepo.findConversationId).toHaveBeenCalledWith(
      TENANT,
      "simulator",
      "sim-5561990000001",
    );
    expect(cartService.getCart).toHaveBeenCalledWith(TENANT, 3);
    expect(view).toMatchObject({
      totalCents: 7350,
      total: "R$ 73,50",
      pending: [],
    });
  });
});
