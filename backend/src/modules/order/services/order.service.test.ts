import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = {
  findOrderById: vi.fn(),
  insertOrder: vi.fn(),
  listBoardOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
};
const events = { publishOrderEvent: vi.fn() };
const conversation = { sendOutbound: vi.fn() };
const conversationRepo = { upsertConversation: vi.fn() };
const store = { getStoreSettings: vi.fn(), listZones: vi.fn() };
const menu = { getFullMenu: vi.fn() };

const { OrderService } = await import("./order.service.js");
const orderService = new OrderService(
  repo as never,
  events as never,
  conversationRepo as never,
  conversation as never,
  menu as never,
  store as never,
);
const createOrder = orderService.createOrder.bind(orderService);
const createSampleOrder = orderService.createSampleOrder.bind(orderService);
const listBoard = orderService.listBoard.bind(orderService);
const transitionOrder = orderService.transitionOrder.bind(orderService);
const { InvalidTransitionError, OrderNotFoundError } =
  await import("../errors/order.errors.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

import type { Order } from "../types/order.types.js";

const mock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const TENANT = asTenantId(3);

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    number: 7,
    conversationId: 20,
    customerName: "Ana",
    customerPhone: null,
    status: "pending",
    fulfillment: "delivery",
    address: null,
    neighborhood: "Centro",
    paymentMethod: "pix",
    changeForCents: null,
    subtotalCents: 1000,
    feeCents: 500,
    totalCents: 1500,
    notes: null,
    rejectReason: null,
    rejectNote: null,
    createdAt: "2026-09-29T15:00:00.000Z",
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    updatedAt: "2026-09-29T15:00:00.000Z",
    items: [
      {
        name: "X",
        sizeName: null,
        unitPriceCents: 1000,
        quantity: 1,
        options: [],
        notes: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock(store.getStoreSettings).mockResolvedValue({
    timezone: "America/Sao_Paulo",
    estimatedMinutes: 40,
    paymentMethods: ["pix"],
  });
});

describe("createOrder", () => {
  it("grava e publica order_created", async () => {
    const created = order();
    mock(repo.insertOrder).mockResolvedValue(created);
    const { id: _id, number: _n, status: _s, ...input } = created;

    await createOrder(TENANT, input as never);

    expect(repo.insertOrder).toHaveBeenCalledWith(TENANT, input);
    expect(events.publishOrderEvent).toHaveBeenCalledWith(TENANT, {
      type: "order_created",
      order: created,
    });
  });

  it("recusa pedido sem itens", async () => {
    await expect(
      createOrder(TENANT, { ...order(), items: [] } as never),
    ).rejects.toMatchObject({ code: "items_required" });
    expect(repo.insertOrder).not.toHaveBeenCalled();
  });
});

describe("listBoard", () => {
  it("usa o início do dia no fuso da loja", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T01:00:00.000Z")); // 22h em SP
    mock(repo.listBoardOrders).mockResolvedValue([]);

    await listBoard(TENANT);

    expect(repo.listBoardOrders).toHaveBeenCalledWith(
      TENANT,
      new Date("2026-09-29T03:00:00.000Z"),
    );
    vi.useRealTimers();
  });
});

describe("transitionOrder", () => {
  it("transição válida grava, publica e avisa o cliente", async () => {
    mock(repo.findOrderById).mockResolvedValue(order());
    const accepted = order({ status: "accepted" });
    mock(repo.updateOrderStatus).mockResolvedValue(accepted);

    const result = await transitionOrder(TENANT, 1, { to: "accepted" });

    expect(repo.updateOrderStatus).toHaveBeenCalledWith(
      TENANT,
      1,
      "pending",
      "accepted",
      {
        reason: null,
        note: null,
      },
    );
    expect(events.publishOrderEvent).toHaveBeenCalledWith(TENANT, {
      type: "order_updated",
      order: accepted,
    });
    expect(conversation.sendOutbound).toHaveBeenCalledWith(
      TENANT,
      20,
      expect.stringContaining("40 min"),
    );
    expect(result).toBe(accepted);
  });

  it("recusa grava motivo e manda o motivo ao cliente", async () => {
    mock(repo.findOrderById).mockResolvedValue(order());
    mock(repo.updateOrderStatus).mockResolvedValue(
      order({ status: "rejected", rejectReason: "sold_out" }),
    );

    await transitionOrder(TENANT, 1, {
      to: "rejected",
      reason: "sold_out",
      note: null,
    });

    expect(mock(repo.updateOrderStatus).mock.calls[0]?.[4]).toEqual({
      reason: "sold_out",
      note: null,
    });
    expect(conversation.sendOutbound).toHaveBeenCalledWith(
      TENANT,
      20,
      expect.stringContaining("acabou"),
    );
  });

  it("transição fora da máquina → InvalidTransitionError, nada gravado", async () => {
    mock(repo.findOrderById).mockResolvedValue(order({ status: "completed" }));

    await expect(
      transitionOrder(TENANT, 1, { to: "accepted" }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(repo.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("outra aba mudou antes (UPDATE sem linhas) → InvalidTransitionError", async () => {
    mock(repo.findOrderById).mockResolvedValue(order());
    mock(repo.updateOrderStatus).mockResolvedValue(null);

    await expect(
      transitionOrder(TENANT, 1, { to: "accepted" }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(events.publishOrderEvent).not.toHaveBeenCalled();
  });

  it("pedido inexistente → OrderNotFoundError", async () => {
    mock(repo.findOrderById).mockResolvedValue(null);
    await expect(
      transitionOrder(TENANT, 1, { to: "accepted" }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("falha ao avisar o cliente NÃO desfaz a transição", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    mock(repo.findOrderById).mockResolvedValue(order());
    mock(repo.updateOrderStatus).mockResolvedValue(
      order({ status: "accepted" }),
    );
    mock(conversation.sendOutbound).mockRejectedValue(new Error("meta fora"));

    await expect(
      transitionOrder(TENANT, 1, { to: "accepted" }),
    ).resolves.toMatchObject({
      status: "accepted",
    });
  });

  it("pedido sem conversa não tenta avisar", async () => {
    mock(repo.findOrderById).mockResolvedValue(order({ conversationId: null }));
    mock(repo.updateOrderStatus).mockResolvedValue(
      order({ status: "accepted", conversationId: null }),
    );

    await transitionOrder(TENANT, 1, { to: "accepted" });
    expect(conversation.sendOutbound).not.toHaveBeenCalled();
  });
});

describe("createSampleOrder", () => {
  it("liga o pedido à conversa do simulador de quem clicou", async () => {
    mock(menu.getFullMenu).mockResolvedValue([
      {
        id: 1,
        name: "Lanches",
        position: 0,
        active: true,
        items: [
          {
            id: 1,
            categoryId: 1,
            name: "X-Burger",
            description: null,
            priceCents: 1800,
            imageUrl: null,
            available: true,
            active: true,
            position: 0,
            sizes: [],
            optionGroups: [],
          },
        ],
      },
    ]);
    mock(store.listZones).mockResolvedValue([]);
    mock(conversationRepo.upsertConversation).mockResolvedValue({
      id: 55,
      previousMessageAt: null,
    });
    mock(repo.insertOrder).mockImplementation(async (_t, input) => ({
      ...order(),
      ...input,
    }));

    const created = await createSampleOrder(TENANT, 9);

    expect(conversationRepo.upsertConversation).toHaveBeenCalledWith(
      TENANT,
      "simulator",
      "admin-9",
      null,
    );
    expect(created.conversationId).toBe(55);
    expect(events.publishOrderEvent).toHaveBeenCalled();
  });
});
