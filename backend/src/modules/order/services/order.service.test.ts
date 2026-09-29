import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/order.repository.js", () => ({
  findOrderById: vi.fn(),
  insertOrder: vi.fn(),
  listBoardOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
}));
vi.mock("../events/order.events.js", () => ({ publishOrderEvent: vi.fn() }));
vi.mock("../../conversation/services/conversation.service.js", () => ({
  sendOutbound: vi.fn(),
}));
vi.mock("../../conversation/repositories/conversation.repository.js", () => ({
  upsertConversation: vi.fn(),
}));
vi.mock("../../store/services/store.service.js", () => ({
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
}));
vi.mock("../../menu/services/menu.service.js", () => ({
  getFullMenu: vi.fn(),
}));

const repo = await import("../repositories/order.repository.js");
const events = await import("../events/order.events.js");
const conversation =
  await import("../../conversation/services/conversation.service.js");
const conversationRepo =
  await import("../../conversation/repositories/conversation.repository.js");
const store = await import("../../store/services/store.service.js");
const menu = await import("../../menu/services/menu.service.js");
const {
  createOrder,
  createSampleOrder,
  listBoard,
  parseTransitionInput,
  transitionOrder,
} = await import("./order.service.js");
const { InvalidOrderError, InvalidTransitionError, OrderNotFoundError } =
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

describe("parseTransitionInput", () => {
  it("status desconhecido → invalid_status", () => {
    expect(() => parseTransitionInput({ to: "lixo" })).toThrow(
      InvalidOrderError,
    );
  });

  it("recusa sem motivo → reject_reason_required", () => {
    expect(() => parseTransitionInput({ to: "rejected" })).toThrow(
      expect.objectContaining({ code: "reject_reason_required" }),
    );
  });

  it("motivo 'other' sem texto → reject_note_required", () => {
    expect(() =>
      parseTransitionInput({ to: "rejected", reason: "other", note: "  " }),
    ).toThrow(expect.objectContaining({ code: "reject_note_required" }));
  });

  it("aceita recusa válida e ignora motivo em outras transições", () => {
    expect(
      parseTransitionInput({ to: "rejected", reason: "sold_out" }),
    ).toEqual({
      to: "rejected",
      reason: "sold_out",
      note: null,
    });
    expect(
      parseTransitionInput({ to: "accepted", reason: "sold_out" }),
    ).toEqual({ to: "accepted" });
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
    vi.spyOn(console, "error").mockImplementation(() => {});
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
