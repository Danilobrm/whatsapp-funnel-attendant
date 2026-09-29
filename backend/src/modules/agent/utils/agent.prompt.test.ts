import { describe, expect, it } from "vitest";

import {
  buildMenuSummary,
  buildSystemPrompt,
  historyToTurns,
  MENU_IN_PROMPT_MAX_ITEMS,
} from "./agent.prompt.js";

import type { Menu, MenuItem } from "../../menu/types/menu.types.js";

import type { BotSettings } from "../../settings/types/settings.types.js";

const SETTINGS: BotSettings = {
  name: "Nina",
  personality: "friendly",
  gender: "female",
  languages: ["pt-BR"],
};

describe("buildSystemPrompt", () => {
  it("names the bot and the restaurant", () => {
    const prompt = buildSystemPrompt({
      businessName: "Pizzaria Demo",
      settings: SETTINGS,
    });

    expect(prompt).toContain("Nina");
    expect(prompt).toContain("Pizzaria Demo");
  });

  // Inventar preço é o pior erro possível do bot — o restaurante teria que
  // honrar ou desmentir. Os dados vêm das ferramentas, não da memória do modelo.
  it("forbids inventing menu data and points to the tools", () => {
    const prompt = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
    });

    expect(prompt).toMatch(/Nunca invente/);
    expect(prompt).toMatch(/Nunca calcule valores/);
    expect(prompt).toContain("search_menu");
    expect(prompt).not.toMatch(/não tem acesso ao cardápio/i);
  });

  it("makes the system, not the model, own the summary and the confirmation", () => {
    const prompt = buildSystemPrompt({ businessName: "X", settings: SETTINGS });

    expect(prompt).toContain("request_confirmation");
    expect(prompt).toMatch(/NÃO escreve nada/);
    expect(prompt).toMatch(/antes de place_order ter dado certo/);
  });

  it("tells the model whether the store is open, closed or paused", () => {
    const base = { businessName: "X", settings: SETTINGS };
    const nowText = "terça-feira, 29/09, 19:32";

    expect(
      buildSystemPrompt({
        ...base,
        store: { open: true, paused: false, nextOpeningText: null, nowText },
      }),
    ).toContain("ABERTA");
    expect(
      buildSystemPrompt({
        ...base,
        store: {
          open: false,
          paused: false,
          nextOpeningText: "amanhã às 11h",
          nowText,
        },
      }),
    ).toContain("FECHADA agora (abre amanhã às 11h)");
    expect(
      buildSystemPrompt({
        ...base,
        store: { open: false, paused: true, nextOpeningText: null, nowText },
      }),
    ).toContain("pausada");
  });

  it("prefers the menu link for a customer who wants to order, and makes the SYSTEM own the link", () => {
    const prompt = buildSystemPrompt({ businessName: "X", settings: SETTINGS });

    expect(prompt).toContain("send_menu_link");
    expect(prompt).toMatch(/quer pedir ou ver o cardápio/);
    expect(prompt).toMatch(/SISTEMA envia o link/);
    // Tem saída quando o link falha ou o cliente prefere digitar.
    expect(prompt).toMatch(/Se o send_menu_link falhar/);
  });

  it("tells the model to continue from a cart the page already built", () => {
    const prompt = buildSystemPrompt({ businessName: "X", settings: SETTINGS });

    expect(prompt).toMatch(/view_cart já mostra itens/);
    expect(prompt).toMatch(/NÃO peça o pedido de novo/);
  });

  it("includes the menu summary when given", () => {
    const prompt = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
      menuSummary: "Pizzas:\n- Calabresa (R$ 45,00)",
    });

    expect(prompt).toContain("- Calabresa (R$ 45,00)");
  });

  it("adds the returning-customer block with last address and last order", () => {
    const prompt = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
      customer: {
        name: "Ana",
        lastAddress: "Rua 7, 10 - Centro",
        lastOrder: {
          number: 12,
          whenText: "sábado",
          lines: ["1x Pizza Grande (Calabresa + Marguerita)"],
        },
      },
    });

    expect(prompt).toContain("Nome: Ana");
    expect(prompt).toContain("Rua 7, 10 - Centro");
    expect(prompt).toContain("#12, sábado");
    expect(prompt).toContain("1x Pizza Grande");
  });

  it("asks for the name when the customer is unknown", () => {
    const prompt = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
      customer: { name: null, lastAddress: null, lastOrder: null },
    });

    expect(prompt).toMatch(/Nome ainda desconhecido/);
  });

  it("changes tone per personality", () => {
    const friendly = buildSystemPrompt({
      businessName: "X",
      settings: SETTINGS,
    });
    const objective = buildSystemPrompt({
      businessName: "X",
      settings: { ...SETTINGS, personality: "objective" },
    });

    expect(friendly).not.toBe(objective);
  });
});

describe("historyToTurns", () => {
  it("maps inbound to user and outbound to assistant, keeping order", () => {
    expect(
      historyToTurns([
        { direction: "inbound", body: "oi", createdAt: "t1" },
        { direction: "outbound", body: "olá!", createdAt: "t2" },
        { direction: "inbound", body: "tem pizza?", createdAt: "t3" },
      ]),
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá!" },
      { role: "user", content: "tem pizza?" },
    ]);
  });
});

function item(
  over: Partial<MenuItem> & { id: number; name: string },
): MenuItem {
  return {
    categoryId: 1,
    description: null,
    priceCents: 1000,
    imageUrl: null,
    available: true,
    active: true,
    position: 0,
    sizes: [],
    optionGroups: [],
    ...over,
  };
}

describe("buildMenuSummary", () => {
  it("lists names and prices per category, sizes joined", () => {
    const menu: Menu = [
      {
        id: 1,
        name: "Pizzas",
        position: 0,
        active: true,
        items: [
          item({
            id: 1,
            name: "Calabresa",
            priceCents: null,
            sizes: [
              { id: 1, name: "Média", priceCents: 4500, position: 0 },
              { id: 2, name: "Grande", priceCents: 5800, position: 1 },
            ],
          }),
        ],
      },
      {
        id: 2,
        name: "Bebidas",
        position: 1,
        active: true,
        items: [
          item({ id: 2, name: "Coca 2L", priceCents: 1200, available: false }),
        ],
      },
    ];

    expect(buildMenuSummary(menu)).toBe(
      [
        "Pizzas:",
        "- Calabresa (Média R$ 45,00 / Grande R$ 58,00)",
        "Bebidas:",
        "- Coca 2L (R$ 12,00) [ESGOTADO]",
      ].join("\n"),
    );
  });

  it("skips inactive categories and items", () => {
    const menu: Menu = [
      {
        id: 1,
        name: "Velha",
        position: 0,
        active: false,
        items: [item({ id: 1, name: "X" })],
      },
      {
        id: 2,
        name: "Nova",
        position: 1,
        active: true,
        items: [
          item({ id: 2, name: "Y", active: false }),
          item({ id: 3, name: "Z" }),
        ],
      },
    ];

    const summary = buildMenuSummary(menu);
    expect(summary).toContain("Z");
    expect(summary).not.toContain("Velha");
    expect(summary).not.toContain("- Y");
  });

  it("returns null for an empty menu and for a menu too big for the prompt", () => {
    expect(buildMenuSummary([])).toBeNull();
    const big: Menu = [
      {
        id: 1,
        name: "Tudo",
        position: 0,
        active: true,
        items: Array.from({ length: MENU_IN_PROMPT_MAX_ITEMS + 1 }, (_, i) =>
          item({ id: i + 1, name: `Item ${i}` }),
        ),
      },
    ];
    expect(buildMenuSummary(big)).toBeNull();
  });
});
