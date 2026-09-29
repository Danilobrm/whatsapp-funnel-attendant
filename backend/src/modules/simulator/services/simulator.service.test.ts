import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MENU,
  PRICING_SETTINGS,
  readyCart,
  ZONES,
} from "../../order/utils/fixtures.test-util.js";
import { emptyCart } from "../../order/types/cart.types.js";

vi.mock("../../conversation/repositories/conversation.repository.js", () => ({
  findConversationId: vi.fn(),
  upsertConversation: vi.fn(),
}));
vi.mock("../../customer/repositories/customer.repository.js", () => ({
  listSimulatedCustomers: vi.fn(),
  upsertCustomer: vi.fn(),
}));
vi.mock("../../menu/services/menu.service.js", () => ({
  getPublishedMenu: vi.fn(),
}));
vi.mock("../../store/services/store.service.js", () => ({
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
}));
vi.mock("../../order/services/cart.service.js", () => ({ getCart: vi.fn() }));

const convRepo =
  await import("../../conversation/repositories/conversation.repository.js");
const custRepo =
  await import("../../customer/repositories/customer.repository.js");
const menuService = await import("../../menu/services/menu.service.js");
const storeService = await import("../../store/services/store.service.js");
const cartService = await import("../../order/services/cart.service.js");
const { createCustomer, getSimulatorCart, listCustomers, simulatorContactFor } =
  await import("./simulator.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");
const { InvalidInputError } =
  await import("../../errors/invalidInput.error.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("simulatorContactFor", () => {
  it("defaults to the admin's own conversation", () => {
    expect(simulatorContactFor(7, undefined)).toBe("admin-7");
    expect(simulatorContactFor(7, null)).toBe("admin-7");
    expect(simulatorContactFor(7, "")).toBe("admin-7");
  });

  it("maps a phone to a simulated customer conversation", () => {
    expect(simulatorContactFor(7, "5561990000001")).toBe("sim-5561990000001");
  });

  // contactId vai para a query e para o nome do contato: só dígitos passam.
  it.each([
    "abc",
    "12",
    "5561 99000",
    "../x",
    "1".repeat(16),
    ["5561990000001"],
    5561990000001,
  ])("rejects %j", (bad) => {
    expect(() => simulatorContactFor(7, bad)).toThrow(InvalidInputError);
    try {
      simulatorContactFor(7, bad);
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid_contact", field: "contactId" });
    }
  });
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
