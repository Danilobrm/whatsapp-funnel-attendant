import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MENU,
  PRICING_SETTINGS,
  ZONES,
} from "../../order/utils/fixtures.test-util.js";
import { emptyCart } from "../../order/types/cart.types.js";

vi.mock("../../conversation/repositories/conversation.repository.js", () => ({
  findConversationTarget: vi.fn(),
}));
vi.mock("../../conversation/services/conversation.service.js", () => ({
  sendOutbound: vi.fn(),
}));
vi.mock("../../menu/services/menu.service.js", () => ({
  getPublishedMenu: vi.fn(),
}));
vi.mock("../../order/services/cart.service.js", () => ({
  getCart: vi.fn(),
  saveEditedCart: vi.fn(),
}));
vi.mock("../../store/services/store.service.js", () => ({
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
}));
vi.mock("../../tenants/repositories/tenant.repository.js", () => ({
  findTenantById: vi.fn(),
}));
vi.mock("../repositories/menuLink.repository.js", () => ({
  insertMenuLinkEvent: vi.fn(),
  findActiveMenuLink: vi.fn(),
  insertMenuLink: vi.fn(),
  deleteStaleMenuLinks: vi.fn(),
  findMenuLinkByCode: vi.fn(),
}));

const convRepo =
  await import("../../conversation/repositories/conversation.repository.js");
const convService =
  await import("../../conversation/services/conversation.service.js");
const menuService = await import("../../menu/services/menu.service.js");
const cartService = await import("../../order/services/cart.service.js");
const storeService = await import("../../store/services/store.service.js");
const tenantRepo =
  await import("../../tenants/repositories/tenant.repository.js");
const linkRepo = await import("../repositories/menuLink.repository.js");
const { env } = await import("../../../config/env.js");
const { createMenuLink, getPublicMenuView, confirmPublicCart } =
  await import("./menuLink.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(4);
const TOKEN = "k7Xp2mQ9aBcD";
const inHours = (h: number) => new Date(Date.now() + h * 3600_000);
const ALWAYS_OPEN = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    [["00:00", "23:59"]],
  ]),
);

const SETTINGS = {
  ...PRICING_SETTINGS,
  timezone: "America/Sao_Paulo",
  openingHours: ALWAYS_OPEN,
  paused: false,
  restaurantName: "Pizzaria do Zé",
  logoUrl: "/produtos/logo.png",
  whatsappNumber: "5561999990000",
  estimatedMinutes: 40,
};

const GOOD_ITEMS = [
  { itemId: 10, sizeId: 102, optionIds: [2001, 2003, 2102], quantity: 1 },
  { itemId: 30, quantity: 2 },
];

beforeEach(() => {
  vi.resetAllMocks();
  env.publicAppUrl = "https://loja.app";
  mock(convRepo.findConversationTarget).mockResolvedValue({
    channel: "whatsapp",
    contact: "5561990000001",
    whatsappPhoneNumberId: "pn1",
  });
  mock(menuService.getPublishedMenu).mockResolvedValue(MENU);
  mock(storeService.getStoreSettings).mockResolvedValue(SETTINGS);
  mock(storeService.listZones).mockResolvedValue(ZONES);
  mock(cartService.getCart).mockResolvedValue(emptyCart());
  mock(cartService.saveEditedCart).mockImplementation(
    async (_t: unknown, _c: unknown, cart: unknown) => ({
      ...(cart as object),
      status: "open",
      summaryHash: null,
    }),
  );
  mock(tenantRepo.findTenantById).mockResolvedValue({
    id: 4,
    slug: "z",
    name: "Tenant Nome",
  });
  mock(linkRepo.insertMenuLinkEvent).mockResolvedValue(undefined);
  mock(linkRepo.findMenuLinkByCode).mockResolvedValue({
    code: TOKEN,
    tenantId: 4,
    conversationId: 9,
    expiresAt: inHours(2),
  });
  mock(linkRepo.findActiveMenuLink).mockResolvedValue(null);
  mock(linkRepo.insertMenuLink).mockResolvedValue(true);
  mock(linkRepo.deleteStaleMenuLinks).mockResolvedValue(undefined);
  mock(convService.sendOutbound).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createMenuLink", () => {
  it("builds <PUBLIC_APP_URL>/c/<short code>, stores it for THIS conversation with the 3h TTL, and records 'sent'", async () => {
    const url = await createMenuLink(TENANT, 9);

    expect(url).toMatch(/^https:\/\/loja\.app\/c\/[A-Za-z0-9_-]{12}$/);
    const code = String(url).split("/c/")[1];
    const [t, c, storedCode, expiresAt] =
      mock(linkRepo.insertMenuLink).mock.calls[0] ?? [];
    expect([t, c, storedCode]).toEqual([TENANT, 9, code]);
    const ttl = (expiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(3 * 3600_000 - 5_000);
    expect(ttl).toBeLessThanOrEqual(3 * 3600_000);
    expect(linkRepo.insertMenuLinkEvent).toHaveBeenCalledWith(
      TENANT,
      9,
      "sent",
    );
  });

  // Quem pede de novo recebe o MESMO endereço; o carrinho segue lá.
  it("reuses the conversation's still-valid link instead of creating another", async () => {
    mock(linkRepo.findActiveMenuLink).mockResolvedValue({
      code: "reuseCode123",
      tenantId: 4,
      conversationId: 9,
      expiresAt: inHours(1),
    });

    const url = await createMenuLink(TENANT, 9);

    expect(url).toBe("https://loja.app/c/reuseCode123");
    expect(linkRepo.insertMenuLink).not.toHaveBeenCalled();
    expect(linkRepo.insertMenuLinkEvent).toHaveBeenCalledWith(
      TENANT,
      9,
      "sent",
    );
  });

  it("retries on a code collision", async () => {
    mock(linkRepo.insertMenuLink)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const url = await createMenuLink(TENANT, 9);

    expect(linkRepo.insertMenuLink).toHaveBeenCalledTimes(2);
    expect(url).toMatch(/\/c\/[A-Za-z0-9_-]{12}$/);
    const codes = mock(linkRepo.insertMenuLink).mock.calls.map((c) => c[2]);
    expect(codes[0]).not.toBe(codes[1]);
  });

  it("gives up with an error (tool_failed for the model) when no code can be stored", async () => {
    mock(linkRepo.insertMenuLink).mockResolvedValue(false);

    await expect(createMenuLink(TENANT, 9)).rejects.toThrow();
    expect(linkRepo.insertMenuLinkEvent).not.toHaveBeenCalled();
  });

  it("sweeps links expired for over a day, but a sweep failure never blocks the link", async () => {
    mock(linkRepo.deleteStaleMenuLinks).mockRejectedValue(new Error("boom"));

    await expect(createMenuLink(TENANT, 9)).resolves.toMatch(/\/c\//);
    expect(linkRepo.deleteStaleMenuLinks).toHaveBeenCalledWith(TENANT);
  });

  it("returns null and stores nothing without PUBLIC_APP_URL (agent falls back to chat)", async () => {
    env.publicAppUrl = "";

    await expect(createMenuLink(TENANT, 9)).resolves.toBeNull();
    expect(linkRepo.insertMenuLink).not.toHaveBeenCalled();
    expect(linkRepo.insertMenuLinkEvent).not.toHaveBeenCalled();
  });
});

describe("getPublicMenuView", () => {
  it("returns the store, the PUBLIC menu, the current cart lines and the wa.me link", async () => {
    const lines = [
      { itemId: 30, sizeId: null, optionIds: [], quantity: 1, notes: null },
    ];
    mock(cartService.getCart).mockResolvedValue({
      ...emptyCart(),
      items: lines,
    });

    const view = await getPublicMenuView(TOKEN);

    expect(view.restaurant).toMatchObject({
      name: "Pizzaria do Zé",
      logoUrl: "/produtos/logo.png",
      open: true,
      paused: false,
      nextOpening: null,
      timezone: "America/Sao_Paulo",
    });
    expect(view.menu.map((c) => c.name)).toEqual([
      "Pizzas",
      "Lanches",
      "Bebidas",
    ]);
    expect(view.cart.items).toEqual(lines);
    expect(view.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5561999990000\?text=/);
  });

  it("scopes every read to the tenant IN THE TOKEN", async () => {
    await getPublicMenuView(TOKEN);

    expect(convRepo.findConversationTarget).toHaveBeenCalledWith(TENANT, 9);
    expect(menuService.getPublishedMenu).toHaveBeenCalledWith(TENANT);
    expect(storeService.getStoreSettings).toHaveBeenCalledWith(TENANT);
    expect(cartService.getCart).toHaveBeenCalledWith(TENANT, 9);
  });

  it("records 'opened'", async () => {
    await getPublicMenuView(TOKEN);

    expect(linkRepo.insertMenuLinkEvent).toHaveBeenCalledWith(
      TENANT,
      9,
      "opened",
    );
  });

  it("falls back to the tenant name when the store has no restaurant name", async () => {
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      restaurantName: null,
    });

    expect((await getPublicMenuView(TOKEN)).restaurant.name).toBe(
      "Tenant Nome",
    );
  });

  it("closed store: open false and the next opening as an ISO instant", async () => {
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      openingHours: {
        mon: [["11:00", "12:00"]],
        tue: [["11:00", "12:00"]],
        wed: [["11:00", "12:00"]],
        thu: [["11:00", "12:00"]],
        fri: [["11:00", "12:00"]],
        sat: [["11:00", "12:00"]],
        sun: [["11:00", "12:00"]],
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T22:00:00.000Z")); // 19h em SP
    try {
      const { restaurant } = await getPublicMenuView(TOKEN);

      expect(restaurant.open).toBe(false);
      expect(restaurant.nextOpening).toBe("2026-09-30T14:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("paused store: closed with no next opening", async () => {
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      paused: true,
    });

    const { restaurant } = await getPublicMenuView(TOKEN);

    expect(restaurant).toMatchObject({
      open: false,
      paused: true,
      nextOpening: null,
    });
  });

  it("no wa.me link on the simulator or without a store number", async () => {
    mock(convRepo.findConversationTarget).mockResolvedValue({
      channel: "simulator",
      contact: "admin-1",
      whatsappPhoneNumberId: null,
    });
    expect((await getPublicMenuView(TOKEN)).whatsappUrl).toBeNull();

    mock(convRepo.findConversationTarget).mockResolvedValue({
      channel: "whatsapp",
      contact: "1",
      whatsappPhoneNumberId: "pn",
    });
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      whatsappNumber: null,
    });
    expect((await getPublicMenuView(TOKEN)).whatsappUrl).toBeNull();
  });

  it.each(["lixo", "abc def ghi", "../../etc/passwd", "a".repeat(40)])(
    "401 invalid_menu_link for the malformed code %j, WITHOUT touching the database",
    async (code) => {
      await expect(getPublicMenuView(code)).rejects.toMatchObject({
        name: "UnauthorizedError",
        code: "invalid_menu_link",
      });
      expect(linkRepo.findMenuLinkByCode).not.toHaveBeenCalled();
    },
  );

  it("401 invalid_menu_link for a well-formed code that does not exist", async () => {
    mock(linkRepo.findMenuLinkByCode).mockResolvedValue(null);

    await expect(getPublicMenuView("nopeNopeNope")).rejects.toMatchObject({
      code: "invalid_menu_link",
    });
    expect(menuService.getPublishedMenu).not.toHaveBeenCalled();
  });

  it("401 expired_menu_link once past the validity (distinct from invalid)", async () => {
    mock(linkRepo.findMenuLinkByCode).mockResolvedValue({
      code: TOKEN,
      tenantId: 4,
      conversationId: 9,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(getPublicMenuView(TOKEN)).rejects.toMatchObject({
      code: "expired_menu_link",
    });
    expect(menuService.getPublishedMenu).not.toHaveBeenCalled();
    expect(linkRepo.insertMenuLinkEvent).not.toHaveBeenCalled();
  });

  // Simulador reiniciado apaga a conversa: o link antigo não pode gravar nela.
  it("401 when the conversation no longer exists in the tenant", async () => {
    mock(convRepo.findConversationTarget).mockResolvedValue(null);

    await expect(getPublicMenuView(TOKEN)).rejects.toMatchObject({
      code: "invalid_menu_link",
    });
    expect(linkRepo.insertMenuLinkEvent).not.toHaveBeenCalled();
  });
});

describe("confirmPublicCart", () => {
  it("prices with priceCart, saves the cart, records 'confirmed' and tells the chat", async () => {
    const view = await confirmPublicCart(TOKEN, { items: GOOD_ITEMS });

    // Grande 5800 + média(0,500)=250 + Catupiry 800 = 6850; + 2 × 1200
    expect(view).toMatchObject({
      subtotalCents: 6850 + 2400,
      notified: true,
      whatsappUrl: expect.stringContaining("wa.me/5561999990000"),
    });
    expect(view.lines).toEqual([
      { name: "Pizza", sizeName: "Grande", quantity: 1, totalCents: 6850 },
      { name: "Coca 2L", sizeName: null, quantity: 2, totalCents: 2400 },
    ]);

    const saved = mock(cartService.saveEditedCart).mock.calls[0];
    expect(saved?.[0]).toBe(TENANT);
    expect(saved?.[1]).toBe(9);
    expect(saved?.[2].items).toEqual([
      {
        itemId: 10,
        sizeId: 102,
        optionIds: [2001, 2003, 2102],
        quantity: 1,
        notes: null,
      },
      { itemId: 30, sizeId: null, optionIds: [], quantity: 2, notes: null },
    ]);
    expect(linkRepo.insertMenuLinkEvent).toHaveBeenCalledWith(
      TENANT,
      9,
      "confirmed",
    );

    const [t, c, text] = mock(convService.sendOutbound).mock.calls[0] ?? [];
    expect([t, c]).toEqual([TENANT, 9]);
    expect(text).toContain("Recebi seu carrinho pelo cardápio!");
    expect(text).toContain("Subtotal: R$ 92,50");
    expect(text).toContain("É para entrega ou retirada?");
  });

  // Preço e opções são conferidos pelo servidor: o navegador só diz o QUE escolheu.
  it.each<[string, Record<string, unknown>[], string]>([
    [
      "a size that is not the item's",
      [{ itemId: 10, sizeId: 555, optionIds: [2001, 2002], quantity: 1 }],
      "size_invalid",
    ],
    [
      "a size missing",
      [{ itemId: 10, optionIds: [2001, 2002], quantity: 1 }],
      "size_required",
    ],
    [
      "missing required flavors",
      [{ itemId: 10, sizeId: 101, optionIds: [], quantity: 1 }],
      "option_group_required",
    ],
    [
      "too many flavors",
      [{ itemId: 10, sizeId: 101, optionIds: [2001, 2002, 2003], quantity: 1 }],
      "option_group_max_exceeded",
    ],
    [
      "a sold-out option",
      [{ itemId: 10, sizeId: 101, optionIds: [2001, 2004], quantity: 1 }],
      "option_invalid",
    ],
    [
      "an option of another item",
      [{ itemId: 20, optionIds: [2001], quantity: 1 }],
      "option_invalid",
    ],
    ["a sold-out item", [{ itemId: 31, quantity: 1 }], "item_unavailable"],
    ["an unknown item", [{ itemId: 999, quantity: 1 }], "item_unavailable"],
  ])(
    "refuses %s, without saving or telling the chat",
    async (_name, items, code) => {
      await expect(confirmPublicCart(TOKEN, { items })).rejects.toMatchObject({
        name: "InvalidPublicCartError",
        code: "cart_invalid",
        problems: expect.arrayContaining([expect.objectContaining({ code })]),
      });
      expect(cartService.saveEditedCart).not.toHaveBeenCalled();
      expect(convService.sendOutbound).not.toHaveBeenCalled();
      expect(linkRepo.insertMenuLinkEvent).not.toHaveBeenCalledWith(
        TENANT,
        9,
        "confirmed",
      );
    },
  );

  it("tells WHICH line is wrong (0-based)", async () => {
    await expect(
      confirmPublicCart(TOKEN, {
        items: [
          { itemId: 30, quantity: 1 },
          { itemId: 31, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      problems: [{ code: "item_unavailable", lineIndex: 1 }],
    });
  });

  it("empty cart → cart_empty; malformed body → cart_invalid", async () => {
    await expect(confirmPublicCart(TOKEN, { items: [] })).rejects.toMatchObject(
      {
        code: "cart_empty",
      },
    );
    await expect(
      confirmPublicCart(TOKEN, { items: [{ itemId: "x" }] }),
    ).rejects.toMatchObject({
      code: "cart_invalid",
    });
    await expect(confirmPublicCart(TOKEN, null)).rejects.toMatchObject({
      code: "cart_invalid",
    });
    expect(cartService.saveEditedCart).not.toHaveBeenCalled();
  });

  it("does not demand delivery, address or payment — the chat collects them", async () => {
    await expect(
      confirmPublicCart(TOKEN, { items: [{ itemId: 30, quantity: 1 }] }),
    ).resolves.toMatchObject({ subtotalCents: 1200 });
  });

  it("does not demand the minimum order either (it is checked when the summary is requested)", async () => {
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      minOrderCents: 99999,
    });

    await expect(
      confirmPublicCart(TOKEN, { items: [{ itemId: 30, quantity: 1 }] }),
    ).resolves.toBeDefined();
  });

  it("keeps what the chat already collected and asks only what is missing", async () => {
    mock(cartService.getCart).mockResolvedValue({
      ...emptyCart(),
      fulfillment: "pickup",
      paymentMethod: "pix",
    });

    await confirmPublicCart(TOKEN, { items: [{ itemId: 30, quantity: 1 }] });

    const text = mock(convService.sendOutbound).mock.calls[0]?.[2] as string;
    expect(text).toContain("Está tudo certo? Me diga e eu mando o resumo");
    expect(mock(cartService.saveEditedCart).mock.calls[0]?.[2]).toMatchObject({
      fulfillment: "pickup",
      paymentMethod: "pix",
    });
  });

  // O carrinho já está gravado; a página reforça o botão de voltar.
  it("a failed chat notice does NOT undo the saved cart", async () => {
    mock(convService.sendOutbound).mockRejectedValue(new Error("meta down"));

    const view = await confirmPublicCart(TOKEN, {
      items: [{ itemId: 30, quantity: 1 }],
    });

    expect(view.notified).toBe(false);
    expect(cartService.saveEditedCart).toHaveBeenCalledTimes(1);
  });

  it("no wa.me link on the simulator", async () => {
    mock(convRepo.findConversationTarget).mockResolvedValue({
      channel: "simulator",
      contact: "admin-1",
      whatsappPhoneNumberId: null,
    });

    expect(
      (await confirmPublicCart(TOKEN, { items: [{ itemId: 30, quantity: 1 }] }))
        .whatsappUrl,
    ).toBeNull();
  });

  it("the tenant and conversation come from the LINK ROW, never from the request", async () => {
    mock(linkRepo.findMenuLinkByCode).mockResolvedValue({
      code: "otherCode123",
      tenantId: 77,
      conversationId: 5,
      expiresAt: inHours(1),
    });

    await confirmPublicCart("otherCode123", {
      items: [{ itemId: 30, quantity: 1 }],
    });

    expect(mock(cartService.saveEditedCart).mock.calls[0]?.[0]).toBe(77);
    expect(mock(cartService.saveEditedCart).mock.calls[0]?.[1]).toBe(5);
    expect(convService.sendOutbound).toHaveBeenCalledWith(
      77,
      5,
      expect.any(String),
    );
  });

  it("rejects a bad code before touching anything", async () => {
    await expect(
      confirmPublicCart("lixo", { items: [{ itemId: 30, quantity: 1 }] }),
    ).rejects.toMatchObject({
      code: "invalid_menu_link",
    });
    expect(cartService.getCart).not.toHaveBeenCalled();
  });
});
