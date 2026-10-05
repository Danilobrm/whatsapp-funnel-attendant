import { describe, expect, it, vi } from "vitest";

import { asTenantId } from "../../tenants/types/tenant.types.js";
import { OrderEvents } from "./order.events.js";

import type { Order } from "../types/order.types.js";

const order = { id: 1, number: 1 } as Order;
const events = new OrderEvents();
const publishOrderEvent = events.publishOrderEvent.bind(events);
const subscribeOrders = events.subscribeOrders.bind(events);

describe("order.events", () => {
  it("entrega o evento só para o tenant dono", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeOrders(asTenantId(1), a);
    const offB = subscribeOrders(asTenantId(2), b);

    publishOrderEvent(asTenantId(1), { type: "order_created", order });

    expect(a).toHaveBeenCalledWith({ type: "order_created", order });
    expect(b).not.toHaveBeenCalled();
    offA();
    offB();
  });

  it("depois de desinscrever, não recebe mais", () => {
    const listener = vi.fn();
    const off = subscribeOrders(asTenantId(3), listener);
    off();

    publishOrderEvent(asTenantId(3), { type: "order_updated", order });
    expect(listener).not.toHaveBeenCalled();
  });
});
