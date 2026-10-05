import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MENU, ZONES } from "../../order/utils/fixtures.test-util.js";
import { emptyCart } from "../../order/types/cart.types.js";

import type { Cart } from "../../order/types/cart.types.js";
import type { StoreSettings } from "../../store/types/store.types.js";

// Repositório de carrinho em memória: o executor roda de verdade, sem banco.
let stored: Cart | null;
/** `stored` é reatribuído dentro dos mocks; ler por aqui evita o narrowing do TS. */
const current = () => stored as Cart | null;

const menuService = { getPublishedMenu: vi.fn() };
const storeService = { getStoreSettings: vi.fn(), listZones: vi.fn() };
const cartRepo = {
  findCart: vi.fn(async () => stored),
  deleteCart: vi.fn(async () => {
    stored = null;
  }),
  saveCart: vi.fn(async (_t: unknown, _c: unknown, cart: Cart) => {
    stored = { ...cart, updatedAt: new Date().toISOString() };
  }),
  claimConfirmedCart: vi.fn(async (_t: unknown, _c: unknown, hash: string) => {
    if (
      current()?.status === "awaiting_confirmation" &&
      current()?.summaryHash === hash
    ) {
      stored = null;
      return true;
    }
    return false;
  }),
};
const orderService = { createOrder: vi.fn() };
const linkService = { createMenuLink: vi.fn() };
const linkRepo = { insertMenuLinkOrdered: vi.fn() };
const customerRepo = { updateCustomerLastAddress: vi.fn() };

const { CartService } = await import("../../order/services/cart.service.js");
const { AgentToolExecutor, resolveZone } = await import("./executor.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

// Serviço de carrinho REAL sobre o repositório em memória: o executor roda de verdade, sem banco.
const executor = new AgentToolExecutor(
  menuService as never,
  linkRepo as never,
  linkService as never,
  cartRepo as never,
  new CartService(cartRepo as never),
  orderService as never,
  storeService as never,
  customerRepo as never,
);
const executeTool = executor.executeTool.bind(executor);

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const getPublishedMenu = mock(menuService.getPublishedMenu);
const getStoreSettings = mock(storeService.getStoreSettings);
const listZones = mock(storeService.listZones);
const createOrder = mock(orderService.createOrder);
const createMenuLink = mock(linkService.createMenuLink);
const insertMenuLinkOrdered = mock(linkRepo.insertMenuLinkOrdered);
const updateCustomerLastAddress = mock(customerRepo.updateCustomerLastAddress);

const TENANT = asTenantId(4);
// terça 19:00 em São Paulo
const NOW = new Date("2026-09-29T22:00:00.000Z");
const ALWAYS_OPEN: StoreSettings["openingHours"] = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    [["00:00", "23:59"]],
  ]),
);

function store(over: Partial<StoreSettings> = {}): StoreSettings {
  return {
    timezone: "America/Sao_Paulo",
    openingHours: ALWAYS_OPEN,
    paused: false,
    minOrderCents: 0,
    estimatedMinutes: 40,
    pickupEnabled: true,
    deliveryEnabled: true,
    paymentMethods: ["pix", "cash", "card_on_delivery"],
    pixKey: "loja@pix.com",
    ownerWhatsapp: null,
    whatsappNumber: null,
    restaurantName: null,
    logoUrl: null,
    contactEmail: null,
    address: "Av. Central, 100",
    latitude: null,
    longitude: null,
    ...over,
  };
}

const ctx = (over: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  conversationId: 9,
  customer: { id: 5, phone: "5561990000001", name: "Ana", lastAddress: null },
  contactName: null,
  now: NOW,
  ...over,
});

const run = (name: string, args: unknown = {}, over = {}) =>
  executeTool(ctx(over), name, args);

const PIZZA = {
  item_id: 10,
  size_id: 102,
  option_ids: [2001, 2003, 2102],
};
const DELIVERY = {
  type: "delivery",
  address: { street: "Rua das Flores", number: "12" },
  neighborhood: "centro",
};

async function cartToConfirmation() {
  await run("add_item", PIZZA);
  await run("set_fulfillment", DELIVERY);
  await run("set_payment", { method: "pix" });
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = null;
  getPublishedMenu.mockResolvedValue(MENU);
  getStoreSettings.mockResolvedValue(store());
  listZones.mockResolvedValue(ZONES);
  createOrder.mockImplementation(
    async (
      _t: unknown,
      input: { totalCents: number; paymentMethod: string },
    ) => ({
      id: 1,
      number: 42,
      totalCents: input.totalCents,
      paymentMethod: input.paymentMethod,
    }),
  );
  updateCustomerLastAddress.mockResolvedValue(undefined);
  createMenuLink.mockResolvedValue("https://loja.app/c/tok.en.sig");
  insertMenuLinkOrdered.mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

describe("resolveZone", () => {
  it("matches ignoring case and accents", () => {
    expect(resolveZone(ZONES, "SAO SEBASTIAO")?.id).toBe(2);
    expect(resolveZone(ZONES, "  centro ")?.id).toBe(1);
  });

  it("matches a unique partial name, but not a short or ambiguous one", () => {
    expect(resolveZone(ZONES, "sebastiao")?.id).toBe(2);
    expect(resolveZone(ZONES, "cen")).toBeNull();
    const twins = [
      { id: 1, neighborhood: "Jardim Norte", feeCents: 1, active: true },
      { id: 2, neighborhood: "Jardim Sul", feeCents: 1, active: true },
    ];
    expect(resolveZone(twins, "jardim")).toBeNull();
  });

  it("returns null for an empty or unknown neighborhood", () => {
    expect(resolveZone(ZONES, "")).toBeNull();
    expect(resolveZone(ZONES, "lua")).toBeNull();
  });
});

describe("executeTool — geral", () => {
  it("refuses an unknown tool without throwing", async () => {
    const { result } = await run("drop_database");
    expect(result).toMatchObject({ ok: false, error: "unknown_tool" });
  });

  // O modelo recebe o erro e decide o que dizer; a conversa não cai no fallback.
  it("turns an unexpected failure into a tool error, never a throw", async () => {
    getPublishedMenu.mockRejectedValue(new Error("db down"));

    const { result } = await run("view_cart");

    expect(result).toEqual({ ok: false, error: "tool_failed" });
  });
});

describe("send_menu_link", () => {
  // O link sai do SISTEMA: a URL não pode ser reescrita pelo modelo.
  it("ends the turn with the SYSTEM text carrying the exact link", async () => {
    const { result, finalReply } = await run("send_menu_link");

    expect(result).toEqual({ ok: true, linkSent: true });
    expect(finalReply).toContain("https://loja.app/c/tok.en.sig");
    expect(createMenuLink).toHaveBeenCalledWith(TENANT, 9);
  });

  it("without PUBLIC_APP_URL: error for the model (no final reply), so it continues in chat", async () => {
    createMenuLink.mockResolvedValue(null);

    const { result, finalReply } = await run("send_menu_link");

    expect(result).toMatchObject({ ok: false, error: "menu_link_unavailable" });
    expect(finalReply).toBeUndefined();
  });

  it("a failure creating the link becomes a tool error, never a throw", async () => {
    createMenuLink.mockRejectedValue(new Error("db down"));

    const { result } = await run("send_menu_link");

    expect(result).toEqual({ ok: false, error: "tool_failed" });
  });
});

describe("search_menu", () => {
  it("returns items with ids and formatted prices", async () => {
    const { result } = await run("search_menu", { query: "pizza" });

    expect(result).toMatchObject({ ok: true });
    const items = (result as { items: { id: number; sizes: unknown[] }[] })
      .items;
    expect(items[0]).toMatchObject({ id: 10 });
    expect(items[0]?.sizes).toHaveLength(2);
  });

  it("rejects bad args", async () => {
    const { result } = await run("search_menu", { query: 42 });
    expect(result).toMatchObject({ ok: false, error: "invalid_args" });
  });
});

describe("add_item", () => {
  it("adds a valid half-and-half pizza and returns the priced cart", async () => {
    const { result } = await run("add_item", PIZZA);

    expect(result).toMatchObject({ ok: true });
    const cart = (
      result as {
        cart: { lines: unknown[]; subtotalCents: number; pending: string[] };
      }
    ).cart;
    expect(cart.lines).toHaveLength(1);
    expect(cart.subtotalCents).toBe(6850);
    expect(cart.pending).toContain("falta definir entrega ou retirada");
    expect(current()?.items).toHaveLength(1);
  });

  it("refuses an incomplete item and does NOT touch the cart", async () => {
    const { result } = await run("add_item", { item_id: 10, size_id: 102 });

    expect(result).toMatchObject({ ok: false, error: "item_incomplete" });
    expect((result as { problems: string[] }).problems[0]).toMatch(/Sabores/);
    expect(current()).toBeNull();
  });

  it("refuses an unavailable item and an unknown id", async () => {
    expect((await run("add_item", { item_id: 31 })).result).toMatchObject({
      error: "item_unavailable",
    });
    expect((await run("add_item", { item_id: 999 })).result).toMatchObject({
      error: "item_not_found",
    });
  });

  it("refuses a quantity outside 1..50", async () => {
    expect(
      (await run("add_item", { item_id: 30, quantity: 0 })).result,
    ).toMatchObject({
      error: "invalid_quantity",
    });
    expect(
      (await run("add_item", { item_id: 30, quantity: 51 })).result,
    ).toMatchObject({
      error: "invalid_quantity",
    });
  });

  it("merges an identical line instead of duplicating it", async () => {
    await run("add_item", { item_id: 30, quantity: 1 });
    await run("add_item", { item_id: 30, quantity: 2 });

    expect(current()?.items).toHaveLength(1);
    expect(current()?.items[0]?.quantity).toBe(3);
  });

  it("does not merge lines that differ in size, options or notes", async () => {
    await run("add_item", { item_id: 20, option_ids: [2201] });
    await run("add_item", { item_id: 20, option_ids: [2202] });
    await run("add_item", {
      item_id: 20,
      option_ids: [2201],
      notes: "sem cebola",
    });

    expect(current()?.items).toHaveLength(3);
  });

  it("refuses the merge if it would exceed the maximum quantity", async () => {
    await run("add_item", { item_id: 30, quantity: 50 });

    const { result } = await run("add_item", { item_id: 30, quantity: 1 });

    expect(result).toMatchObject({ ok: false, error: "item_incomplete" });
    expect(current()?.items[0]?.quantity).toBe(50);
  });
});

describe("remove_item / update_quantity / view_cart", () => {
  beforeEach(async () => {
    await run("add_item", { item_id: 30, quantity: 1 });
    await run("add_item", { item_id: 20, quantity: 2 });
  });

  it("removes by 1-based line number", async () => {
    await run("remove_item", { line_number: 1 });

    expect(current()?.items.map((l) => l.itemId)).toEqual([20]);
  });

  it("refuses a line that does not exist", async () => {
    expect((await run("remove_item", { line_number: 3 })).result).toMatchObject(
      {
        error: "line_not_found",
      },
    );
    expect(
      (await run("update_quantity", { line_number: 9, quantity: 1 })).result,
    ).toMatchObject({
      error: "line_not_found",
    });
  });

  it("updates a quantity, and refuses 0 (use remove_item)", async () => {
    await run("update_quantity", { line_number: 2, quantity: 5 });
    expect(current()?.items[1]?.quantity).toBe(5);

    expect(
      (await run("update_quantity", { line_number: 2, quantity: 0 })).result,
    ).toMatchObject({
      error: "invalid_quantity",
    });
    expect(current()?.items[1]?.quantity).toBe(5);
  });

  it("view_cart returns the priced cart without writing", async () => {
    const before = current();
    const { result } = await run("view_cart");

    expect(result).toMatchObject({ ok: true });
    expect((result as { cart: { lines: unknown[] } }).cart.lines).toHaveLength(
      2,
    );
    expect(current()).toBe(before);
  });

  it("view_cart on a cart older than 3h starts from an empty one", async () => {
    const cart = current();
    if (cart) {
      cart.updatedAt = new Date(NOW.getTime() - 4 * 3600_000).toISOString();
    }

    const { result } = await run("view_cart");

    expect((result as { cart: { lines: unknown[] } }).cart.lines).toEqual([]);
    expect(cartRepo.deleteCart).toHaveBeenCalled();
  });
});

describe("set_fulfillment", () => {
  it("delivery: resolves the zone by neighborhood and stores the canonical name", async () => {
    const { result } = await run("set_fulfillment", DELIVERY);

    expect(result).toMatchObject({ ok: true, deliveryFee: "R$ 5,00" });
    expect(current()).toMatchObject({
      fulfillment: "delivery",
      zoneId: 1,
      address: {
        street: "Rua das Flores",
        number: "12",
        neighborhood: "Centro",
      },
    });
  });

  it("delivery outside the served area: lists the neighborhoods and does not change the cart", async () => {
    const { result } = await run("set_fulfillment", {
      ...DELIVERY,
      neighborhood: "Lua",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "neighborhood_not_served",
      servedNeighborhoods: ["Centro", "São Sebastião"],
    });
    expect(current()).toBeNull();
  });

  it("does not serve a deactivated zone", async () => {
    const { result } = await run("set_fulfillment", {
      ...DELIVERY,
      neighborhood: "Bairro Fechado",
    });

    expect(result).toMatchObject({ error: "neighborhood_not_served" });
  });

  it("delivery needs street and neighborhood", async () => {
    expect(
      (
        await run("set_fulfillment", {
          type: "delivery",
          neighborhood: "Centro",
        })
      ).result,
    ).toMatchObject({ error: "street_required" });
    expect(
      (
        await run("set_fulfillment", {
          type: "delivery",
          address: { street: "Rua 7" },
        })
      ).result,
    ).toMatchObject({ error: "neighborhood_required" });
  });

  it("pickup clears address and zone and returns the store address", async () => {
    await run("set_fulfillment", DELIVERY);

    const { result } = await run("set_fulfillment", { type: "pickup" });

    expect(result).toMatchObject({
      ok: true,
      pickupAddress: "Av. Central, 100",
    });
    expect(current()).toMatchObject({
      fulfillment: "pickup",
      address: null,
      zoneId: null,
    });
  });

  it("respects a store that turned delivery or pickup off", async () => {
    getStoreSettings.mockResolvedValue(
      store({ deliveryEnabled: false, pickupEnabled: false }),
    );

    expect((await run("set_fulfillment", DELIVERY)).result).toMatchObject({
      error: "delivery_unavailable",
    });
    expect(
      (await run("set_fulfillment", { type: "pickup" })).result,
    ).toMatchObject({
      error: "pickup_unavailable",
    });
  });
});

describe("set_payment", () => {
  it("sets a method the store accepts", async () => {
    const { result } = await run("set_payment", { method: "pix" });

    expect(result).toMatchObject({ ok: true });
    expect(current()?.paymentMethod).toBe("pix");
  });

  it("refuses a method the store does not accept, listing the accepted ones", async () => {
    getStoreSettings.mockResolvedValue(store({ paymentMethods: ["pix"] }));

    const { result } = await run("set_payment", { method: "cash" });

    expect(result).toMatchObject({
      ok: false,
      error: "payment_unavailable",
      accepted: ["Pix"],
    });
  });

  it("stores change in cents for cash and clears it when switching away", async () => {
    await cartToConfirmation();
    await run("set_payment", { method: "cash", change_for_reais: 100 });
    expect(current()).toMatchObject({
      paymentMethod: "cash",
      changeForCents: 10000,
    });

    await run("set_payment", { method: "pix" });
    expect(current()).toMatchObject({
      paymentMethod: "pix",
      changeForCents: null,
    });
  });

  it("refuses change lower than the total and tells the total", async () => {
    await cartToConfirmation(); // total 73,50

    const { result } = await run("set_payment", {
      method: "cash",
      change_for_reais: 50,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "change_too_low",
      total: "R$ 73,50",
    });
    expect(current()?.paymentMethod).toBe("pix");
  });
});

describe("request_confirmation", () => {
  it("refuses an incomplete cart and lists what is missing", async () => {
    await run("add_item", PIZZA);

    const { result, finalReply } = await run("request_confirmation");

    expect(result).toMatchObject({ ok: false, error: "cart_incomplete" });
    expect((result as { problems: string[] }).problems).toEqual([
      "falta definir entrega ou retirada",
      "falta a forma de pagamento",
    ]);
    expect(finalReply).toBeUndefined();
    expect(current()?.status).toBe("open");
  });

  it("sends the SYSTEM summary as the final reply and arms the confirmation", async () => {
    await cartToConfirmation();

    const { result, finalReply } = await run("request_confirmation");

    expect(result).toMatchObject({ ok: true, summarySent: true });
    expect(finalReply).toContain("Total: R$ 73,50");
    expect(finalReply?.endsWith("Posso confirmar?")).toBe(true);
    expect(current()?.status).toBe("awaiting_confirmation");
    expect(current()?.summaryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses with the next opening when the store is closed", async () => {
    await cartToConfirmation();
    getStoreSettings.mockResolvedValue(
      store({ openingHours: { wed: [["11:00", "15:00"]] } }),
    );

    const { result, finalReply } = await run("request_confirmation");

    expect(result).toMatchObject({
      ok: false,
      error: "store_closed",
      nextOpening: "amanhã às 11h",
    });
    expect(finalReply).toBeUndefined();
  });

  it("refuses when the store is paused", async () => {
    await cartToConfirmation();
    getStoreSettings.mockResolvedValue(store({ paused: true }));

    expect((await run("request_confirmation")).result).toMatchObject({
      error: "store_paused",
    });
  });

  it("catches an item that sold out between adding and confirming", async () => {
    await cartToConfirmation();
    const soldOut = structuredClone(MENU);
    const pizza = soldOut[0]?.items[0];
    if (!pizza) throw new Error("fixture");
    pizza.available = false;
    getPublishedMenu.mockResolvedValue(soldOut);

    const { result } = await run("request_confirmation");

    expect(result).toMatchObject({ ok: false, error: "cart_incomplete" });
    expect((result as { problems: string[] }).problems[0]).toMatch(
      /não está disponível/,
    );
  });
});

describe("place_order", () => {
  it("refuses without a summary (the customer has not seen the total)", async () => {
    await cartToConfirmation();

    const { result } = await run("place_order");

    expect(result).toMatchObject({ ok: false, error: "not_confirmed" });
    expect(createOrder).not.toHaveBeenCalled();
    expect(current()).not.toBeNull();
  });

  it("refuses when the cart changed after the summary — forcing a new summary", async () => {
    await cartToConfirmation();
    await run("request_confirmation");

    await run("add_item", { item_id: 30, quantity: 1 }); // muda o carrinho
    const { result } = await run("place_order");

    expect(result).toMatchObject({ ok: false, error: "not_confirmed" });
    expect(createOrder).not.toHaveBeenCalled();
    expect(current()?.status).toBe("open");
    expect(current()?.summaryHash).toBeNull();
  });

  it("every mutation tool invalidates a pending summary", async () => {
    const mutations: [string, unknown][] = [
      ["add_item", { item_id: 30 }],
      ["remove_item", { line_number: 1 }],
      ["update_quantity", { line_number: 1, quantity: 2 }],
      ["set_fulfillment", { type: "pickup" }],
      ["set_payment", { method: "cash" }],
    ];
    for (const [name, args] of mutations) {
      stored = null;
      await cartToConfirmation();
      await run("request_confirmation");
      expect(current()?.status).toBe("awaiting_confirmation");

      await run(name, args);

      expect(current()?.status, name).toBe("open");
      expect(current()?.summaryHash, name).toBeNull();
    }
  });

  it("refuses when the price changed after the summary", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    const pricier = structuredClone(MENU);
    const size = pricier[0]?.items[0]?.sizes[1];
    if (!size) throw new Error("fixture");
    size.priceCents += 100;
    getPublishedMenu.mockResolvedValue(pricier);

    const { result } = await run("place_order");

    expect(result).toMatchObject({
      ok: false,
      error: "cart_changed_after_summary",
    });
    expect(createOrder).not.toHaveBeenCalled();
    expect(current()?.status).toBe("open");
  });

  it("refuses with the store closed even after a valid summary", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    getStoreSettings.mockResolvedValue(store({ openingHours: {} }));

    const { result } = await run("place_order");

    expect(result).toMatchObject({ ok: false, error: "store_closed" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("creates the order from the priced cart, clears the cart and answers with system text", async () => {
    await cartToConfirmation();
    await run("request_confirmation");

    const { result, finalReply } = await run("place_order");

    expect(result).toEqual({ ok: true, orderNumber: 42 });
    expect(createOrder).toHaveBeenCalledWith(TENANT, {
      conversationId: 9,
      customerId: 5,
      customerName: "Ana",
      customerPhone: "5561990000001",
      fulfillment: "delivery",
      address: {
        street: "Rua das Flores",
        number: "12",
        complement: null,
        reference: null,
      },
      neighborhood: "Centro",
      paymentMethod: "pix",
      changeForCents: null,
      subtotalCents: 6850,
      feeCents: 500,
      totalCents: 7350,
      notes: null,
      items: [
        {
          name: "Pizza",
          sizeName: "Grande",
          unitPriceCents: 6850,
          quantity: 1,
          options: [
            { group: "Sabores", name: "Calabresa", priceCents: 0 },
            { group: "Sabores", name: "Quatro Queijos", priceCents: 500 },
            { group: "Borda", name: "Catupiry", priceCents: 800 },
          ],
          notes: null,
        },
      ],
    });
    expect(current()).toBeNull();
    expect(finalReply).toContain("Pedido #42 recebido!");
    expect(finalReply).toContain("R$ 73,50");
    expect(finalReply).toContain("loja@pix.com");
    expect(updateCustomerLastAddress).toHaveBeenCalledWith(
      TENANT,
      5,
      expect.objectContaining({
        street: "Rua das Flores",
        neighborhood: "Centro",
      }),
    );
  });

  it("falls back to the channel profile name, then to 'Cliente'", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    await run("place_order", {}, { customer: null, contactName: "Bia" });
    expect(createOrder.mock.calls[0]?.[1]).toMatchObject({
      customerName: "Bia",
      customerId: null,
      customerPhone: null,
    });

    stored = null;
    await cartToConfirmation();
    await run("request_confirmation");
    await run(
      "place_order",
      {},
      {
        customer: { id: 5, phone: "1", name: null, lastAddress: null },
        contactName: null,
      },
    );
    expect(createOrder.mock.calls[1]?.[1]).toMatchObject({
      customerName: "Cliente",
    });
  });

  it("marks the order in the menu-link funnel (only counts if the cart came from the page)", async () => {
    await cartToConfirmation();
    await run("request_confirmation");

    await run("place_order");

    expect(insertMenuLinkOrdered).toHaveBeenCalledWith(TENANT, 9);
  });

  it("a funnel failure never undoes the order", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    insertMenuLinkOrdered.mockRejectedValue(new Error("boom"));

    const { result, finalReply } = await run("place_order");

    expect(result).toEqual({ ok: true, orderNumber: 42 });
    expect(finalReply).toContain("Pedido #42 recebido!");
  });

  it("does not touch the funnel when the order is refused", async () => {
    await cartToConfirmation();

    await run("place_order"); // sem resumo

    expect(insertMenuLinkOrdered).not.toHaveBeenCalled();
  });

  it("pickup order carries no address", async () => {
    await run("add_item", PIZZA);
    await run("set_fulfillment", { type: "pickup" });
    await run("set_payment", { method: "cash", change_for_reais: 100 });
    await run("request_confirmation");

    await run("place_order");

    expect(createOrder.mock.calls[0]?.[1]).toMatchObject({
      fulfillment: "pickup",
      address: null,
      neighborhood: null,
      feeCents: 0,
      changeForCents: 10000,
    });
    expect(updateCustomerLastAddress).not.toHaveBeenCalled();
  });

  // Dois "sim" seguidos (ou reenvio do canal) não podem virar dois pedidos.
  it("creates only ONE order when two confirmations race", async () => {
    await cartToConfirmation();
    await run("request_confirmation");

    const [a, b] = await Promise.all([run("place_order"), run("place_order")]);

    expect(createOrder).toHaveBeenCalledTimes(1);
    const finals = [a, b].filter((r) => r.finalReply !== undefined);
    expect(finals).toHaveLength(1);
  });

  it("puts the confirmed cart back when the order could not be created", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    createOrder.mockRejectedValue(new Error("db down"));

    const { result, finalReply } = await run("place_order");

    expect(result).toEqual({ ok: false, error: "tool_failed" });
    expect(finalReply).toBeUndefined();
    expect(current()?.status).toBe("awaiting_confirmation");
  });

  it("does not undo the order when saving the last address fails", async () => {
    await cartToConfirmation();
    await run("request_confirmation");
    updateCustomerLastAddress.mockRejectedValue(new Error("boom"));

    const { result } = await run("place_order");

    expect(result).toEqual({ ok: true, orderNumber: 42 });
  });
});

describe("store_info", () => {
  it("reports open state, hours, minimum, payments and served neighborhoods with fees", async () => {
    getStoreSettings.mockResolvedValue(
      store({
        openingHours: { tue: [["11:00", "23:00"]] },
        minOrderCents: 2000,
      }),
    );

    const { result } = await run("store_info");

    expect(result).toMatchObject({
      ok: true,
      open: true,
      hours: "Ter 11h às 23h",
      estimatedMinutes: 40,
      minOrder: "R$ 20,00",
      paymentMethods: ["Pix", "Dinheiro", "Cartão na entrega"],
      pixKey: "loja@pix.com",
      deliveryNeighborhoods: [
        { neighborhood: "Centro", fee: "R$ 5,00" },
        { neighborhood: "São Sebastião", fee: "R$ 8,00" },
      ],
    });
  });

  it("gives the next opening when closed", async () => {
    getStoreSettings.mockResolvedValue(
      store({ openingHours: { wed: [["11:00", "15:00"]] } }),
    );

    const { result } = await run("store_info");

    expect(result).toMatchObject({ open: false, nextOpening: "amanhã às 11h" });
  });
});

describe("call_human", () => {
  it("only records for now (handoff lands in phase 4) and tells the model what to say", async () => {
    const { result } = await run("call_human", { reason: "cliente irritado" });

    expect(result).toMatchObject({ ok: true });
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringContaining("cliente irritado"),
    );
  });
});

describe("isolamento", () => {
  it("scopes every read by the calling tenant", async () => {
    await run("view_cart");

    expect(getPublishedMenu).toHaveBeenCalledWith(TENANT);
    expect(getStoreSettings).toHaveBeenCalledWith(TENANT);
    expect(listZones).toHaveBeenCalledWith(TENANT);
    expect(cartRepo.findCart).toHaveBeenCalledWith(TENANT, 9);
  });
});

it("keeps emptyCart in sync with what the executor starts from", () => {
  expect(emptyCart().items).toEqual([]);
});
