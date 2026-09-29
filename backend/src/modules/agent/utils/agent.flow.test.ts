import { beforeEach, describe, expect, it, vi } from "vitest";

import { MENU, ZONES } from "../../order/utils/fixtures.test-util.js";

import type { Cart } from "../../order/types/cart.types.js";
import type { StoreSettings } from "../../store/types/store.types.js";

/**
 * Ponta a ponta do pedido, SEM banco e SEM modelo real: o laço do agente e o
 * executor de ferramentas rodam de verdade; só o LLM é um roteiro e o carrinho
 * vive em memória. Prova a sequência exigida pelo plano:
 * oi → pizza grande com borda → entrega no Centro → Pix → resumo → "sim" → pedido.
 */
let stored: Cart | null;

const scripted: { content: string; tool_calls?: unknown[] }[] = [];
const invoke = vi.fn(async () => {
  const next = scripted.shift();
  if (!next) throw new Error("roteiro do LLM acabou");
  return next;
});

vi.mock("../../ai/clients/llm-client.js", () => ({
  createChatLlm: async () => ({ bindTools: () => ({ invoke }) }),
}));
vi.mock("../services/agent.context.js", () => ({
  loadPromptContext: async () => ({
    store: undefined,
    menuSummary: null,
    customer: null,
  }),
}));
vi.mock("../../menu/services/menu.service.js", () => ({ getPublishedMenu: vi.fn() }));
vi.mock("../../store/services/store.service.js", () => ({
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
}));
vi.mock("../../order/repositories/cart.repository.js", () => ({
  findCart: vi.fn(async () => stored),
  deleteCart: vi.fn(async () => {
    stored = null;
  }),
  saveCart: vi.fn(async (_t: unknown, _c: unknown, cart: Cart) => {
    stored = { ...cart, updatedAt: new Date().toISOString() };
  }),
  claimConfirmedCart: vi.fn(async (_t: unknown, _c: unknown, hash: string) => {
    if (
      stored?.status === "awaiting_confirmation" &&
      stored.summaryHash === hash
    ) {
      stored = null;
      return true;
    }
    return false;
  }),
}));
vi.mock("../../order/services/order.service.js", () => ({ createOrder: vi.fn() }));
vi.mock("../../menulink/services/menuLink.service.js", () => ({
  createMenuLink: vi.fn(),
}));
vi.mock("../../menulink/repositories/menuLink.repository.js", () => ({
  insertMenuLinkOrdered: vi.fn(),
}));
vi.mock("../../customer/repositories/customer.repository.js", () => ({
  updateCustomerLastAddress: vi.fn(),
}));

const menuService = await import("../../menu/services/menu.service.js");
const storeService = await import("../../store/services/store.service.js");
const orderService = await import("../../order/services/order.service.js");
const linkService = await import("../../menulink/services/menuLink.service.js");
const linkRepo = await import("../../menulink/repositories/menuLink.repository.js");
const customerRepo = await import("../../customer/repositories/customer.repository.js");
const { generateAgentReply } = await import("../services/agent.service.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const createOrder = mock(orderService.createOrder);

const TENANT = asTenantId(4);
const ALWAYS_OPEN = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    [["00:00", "23:59"]],
  ]),
);
const SETTINGS: StoreSettings = {
  timezone: "America/Sao_Paulo",
  openingHours: ALWAYS_OPEN,
  paused: false,
  minOrderCents: 0,
  estimatedMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  paymentMethods: ["pix", "cash"],
  pixKey: "loja@pix.com",
  ownerWhatsapp: null,
  whatsappNumber: null,
  restaurantName: null,
  logoUrl: null,
  contactEmail: null,
  address: null,
  latitude: null,
  longitude: null,
};

const calls = (...names: [string, unknown][]) => ({
  content: "",
  tool_calls: names.map(([name, args], i) => ({ name, args, id: `c${i}` })),
});
const say = (content: string) => ({ content });

/** Um turno do cliente: só o texto importa, o roteiro já está na fila. */
function turn(text: string) {
  return generateAgentReply({
    tenantId: TENANT,
    conversationId: 1,
    businessName: "Pizzaria Demo",
    settings: {
      name: "Nina",
      personality: "friendly",
      gender: "female",
      languages: ["pt-BR"],
    },
    history: [{ direction: "inbound", body: text, createdAt: "t" }],
    customer: { id: 7, phone: "5561990000001", name: "Ana", lastAddress: null },
  });
}

const PIZZA = { item_id: 10, size_id: 102, option_ids: [2001, 2003, 2102] };
const DELIVERY = {
  type: "delivery",
  address: { street: "Rua das Flores", number: "12" },
  neighborhood: "Centro",
};

beforeEach(() => {
  vi.clearAllMocks();
  stored = null;
  scripted.length = 0;
  mock(menuService.getPublishedMenu).mockResolvedValue(MENU);
  mock(storeService.getStoreSettings).mockResolvedValue(SETTINGS);
  mock(storeService.listZones).mockResolvedValue(ZONES);
  createOrder.mockImplementation(
    async (
      _t: unknown,
      input: { totalCents: number; paymentMethod: string },
    ) => ({
      number: 42,
      totalCents: input.totalCents,
      paymentMethod: input.paymentMethod,
    }),
  );
  mock(customerRepo.updateCustomerLastAddress).mockResolvedValue(undefined);
  mock(linkService.createMenuLink).mockResolvedValue(
    "https://loja.app/c/tok.en.sig",
  );
  mock(linkRepo.insertMenuLinkOrdered).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("pedido completo pelo agente", () => {
  it("oi → pizza meio a meio com borda → entrega no Centro → Pix → resumo → sim → pedido criado", async () => {
    // Turno 1: o cliente descreve tudo; o modelo monta o carrinho e pede o resumo.
    scripted.push(
      calls(["search_menu", { query: "pizza" }]),
      calls(["add_item", PIZZA]),
      calls(["set_fulfillment", DELIVERY], ["set_payment", { method: "pix" }]),
      calls(["request_confirmation", {}]),
    );
    const summary = await turn(
      "quero uma pizza grande meio calabresa meio quatro queijos com borda de catupiry, entrega na Rua das Flores 12, Centro, pago no pix",
    );

    expect(summary.reply).toBe(
      [
        "Resumo do seu pedido:",
        "",
        "1x Pizza Grande — R$ 68,50",
        "   Sabores: Calabresa + Quatro Queijos · Borda: Catupiry",
        "",
        "Subtotal: R$ 68,50",
        "Taxa de entrega: R$ 5,00",
        "Total: R$ 73,50",
        "",
        "Entrega em: Rua das Flores, 12 - Centro",
        "Pagamento: Pix",
        "",
        "Posso confirmar?",
      ].join("\n"),
    );
    expect(summary.trace.map((t) => t.name)).toEqual([
      "search_menu",
      "add_item",
      "set_fulfillment",
      "set_payment",
      "request_confirmation",
    ]);
    expect(createOrder).not.toHaveBeenCalled();
    expect(stored?.status).toBe("awaiting_confirmation");

    // Turno 2: o cliente confirma; o pedido é criado e a resposta é do sistema.
    scripted.push(calls(["place_order", {}]));
    const placed = await turn("sim");

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.mock.calls[0]?.[1]).toMatchObject({
      totalCents: 7350,
      feeCents: 500,
      neighborhood: "Centro",
      customerName: "Ana",
    });
    expect(placed.reply).toContain("Pedido #42 recebido!");
    expect(placed.reply).toContain("R$ 73,50");
    expect(stored).toBeNull();
  });

  it("mudar o carrinho depois do resumo força um NOVO resumo", async () => {
    scripted.push(
      calls(
        ["add_item", PIZZA],
        ["set_fulfillment", DELIVERY],
        ["set_payment", { method: "pix" }],
      ),
      calls(["request_confirmation", {}]),
    );
    await turn("pizza no pix, entrega");
    expect(stored?.status).toBe("awaiting_confirmation");

    // "ah, põe uma Coca também" — o modelo, errado, tenta fechar logo em seguida.
    scripted.push(
      calls(["add_item", { item_id: 30, quantity: 1 }]),
      calls(["place_order", {}]),
      calls(["request_confirmation", {}]),
    );
    const second = await turn("ah, põe uma Coca também. pode fechar");

    expect(createOrder).not.toHaveBeenCalled();
    expect(second.trace.map((t) => [t.name, t.result.ok])).toEqual([
      ["add_item", true],
      ["place_order", false],
      ["request_confirmation", true],
    ]);
    expect(second.trace[1]?.result).toMatchObject({ error: "not_confirmed" });
    expect(second.reply).toContain("1x Coca 2L — R$ 12,00");
    expect(second.reply).toContain("Total: R$ 85,50");

    scripted.push(calls(["place_order", {}]));
    const placed = await turn("sim");

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.mock.calls[0]?.[1]).toMatchObject({ totalCents: 8550 });
    expect(placed.reply).toContain("Pedido #42 recebido!");
  });

  it("pizza sem os sabores obrigatórios volta o erro ao modelo, que pergunta ao cliente", async () => {
    scripted.push(
      calls(["add_item", { item_id: 10, size_id: 102 }]),
      say("Quais são os dois sabores da pizza?"),
    );

    const out = await turn("quero uma pizza grande");

    expect(out.reply).toBe("Quais são os dois sabores da pizza?");
    expect(out.trace[0]?.result).toMatchObject({
      ok: false,
      error: "item_incomplete",
    });
    expect(stored).toBeNull();
  });

  it("bairro fora da área volta a lista de bairros e o modelo oferece retirada", async () => {
    scripted.push(
      calls(["add_item", { item_id: 30, quantity: 1 }]),
      calls(["set_fulfillment", { ...DELIVERY, neighborhood: "Lua" }]),
      say("Não entregamos na Lua. Prefere retirar aqui?"),
    );

    const out = await turn("uma coca, entrega na lua");

    expect(out.trace[1]?.result).toMatchObject({
      error: "neighborhood_not_served",
      servedNeighborhoods: ["Centro", "São Sebastião"],
    });
    expect(out.reply).toBe("Não entregamos na Lua. Prefere retirar aqui?");
  });

  it("loja fechada: monta o carrinho mas recusa o resumo com o próximo horário", async () => {
    mock(storeService.getStoreSettings).mockResolvedValue({
      ...SETTINGS,
      openingHours: { wed: [["11:00", "15:00"]] },
    });
    scripted.push(
      calls(
        ["add_item", { item_id: 30, quantity: 1 }],
        ["set_fulfillment", { type: "pickup" }],
        ["set_payment", { method: "pix" }],
      ),
      calls(["request_confirmation", {}]),
      say(
        "Estamos fechados agora, abrimos amanhã às 11h. Seu carrinho fica guardado!",
      ),
    );

    const out = await turn("uma coca pra retirar, pix");

    expect(out.trace.at(-1)?.result).toMatchObject({ error: "store_closed" });
    expect(out.reply).toContain("amanhã às 11h");
    expect(stored?.items).toHaveLength(1);
    expect(stored?.status).toBe("open");
  });

  it("modelo que não converge em 6 rodadas cai no fallback (reply null) sem criar pedido", async () => {
    for (let i = 0; i < 10; i += 1) scripted.push(calls(["view_cart", {}]));

    const out = await turn("...");

    expect(out.reply).toBeNull();
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe("cardápio em link", () => {
  it("'quero pedir' → o SISTEMA manda o link e encerra o turno", async () => {
    scripted.push(calls(["send_menu_link", {}]));

    const out = await turn("quero pedir uma pizza");

    expect(out.reply).toContain("https://loja.app/c/tok.en.sig");
    expect(out.trace.map((t) => t.name)).toEqual(["send_menu_link"]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sem PUBLIC_APP_URL o modelo segue pelo chat (add_item normal)", async () => {
    mock(linkService.createMenuLink).mockResolvedValue(null);
    scripted.push(
      calls(["send_menu_link", {}]),
      calls(["search_menu", { query: "coca" }]),
      say("Temos Coca 2L por R$ 12,00. Quer?"),
    );

    const out = await turn("quero pedir");

    expect(out.trace[0]?.result).toMatchObject({
      error: "menu_link_unavailable",
    });
    expect(out.reply).toBe("Temos Coca 2L por R$ 12,00. Quer?");
  });

  // O carrinho montado na página já está em `carts`; o agente só completa.
  it("carrinho vindo da página: o agente continua de onde parou até o pedido", async () => {
    stored = {
      items: [
        {
          itemId: 10,
          sizeId: 102,
          optionIds: [2001, 2003, 2102],
          quantity: 1,
          notes: null,
        },
      ],
      fulfillment: null,
      address: null,
      zoneId: null,
      paymentMethod: null,
      changeForCents: null,
      notes: null,
      status: "open",
      summaryHash: null,
      updatedAt: new Date().toISOString(),
    };

    scripted.push(
      calls(["view_cart", {}]),
      calls(["set_fulfillment", DELIVERY], ["set_payment", { method: "pix" }]),
      calls(["request_confirmation", {}]),
    );
    const summary = await turn(
      "entrega na Rua das Flores 12, Centro, pago no pix",
    );

    expect(summary.trace[0]?.result).toMatchObject({ ok: true });
    expect(summary.reply).toContain("1x Pizza Grande — R$ 68,50");
    expect(summary.reply).toContain("Total: R$ 73,50");

    scripted.push(calls(["place_order", {}]));
    const placed = await turn("sim");

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(placed.reply).toContain("Pedido #42 recebido!");
    expect(mock(linkRepo.insertMenuLinkOrdered)).toHaveBeenCalledWith(
      TENANT,
      1,
    );
  });
});
