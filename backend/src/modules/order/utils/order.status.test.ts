import { describe, expect, it } from "vitest";

import { canTransition, isTerminal, nextStatuses } from "./order.status.js";
import { ORDER_STATUSES } from "../types/order.types.js";

import type { Fulfillment, OrderStatus } from "../types/order.types.js";

/** Tudo que é permitido, por modo. O resto é inválido. */
const VALID: Record<Fulfillment, Array<[OrderStatus, OrderStatus]>> = {
  delivery: [
    ["pending", "accepted"],
    ["pending", "rejected"],
    ["pending", "cancelled"],
    ["accepted", "out_for_delivery"],
    ["accepted", "cancelled"],
    ["out_for_delivery", "completed"],
    // Nunca acontece na prática (entrega não chega a "pronto p/ retirada"),
    // mas a regra é por status de origem.
    ["ready_for_pickup", "completed"],
  ],
  pickup: [
    ["pending", "accepted"],
    ["pending", "rejected"],
    ["pending", "cancelled"],
    ["accepted", "ready_for_pickup"],
    ["accepted", "cancelled"],
    ["ready_for_pickup", "completed"],
    ["out_for_delivery", "completed"],
  ],
};

describe("máquina de estados do pedido", () => {
  it.each(["delivery", "pickup"] as const)(
    "%s: exatamente as transições da tabela são válidas",
    (fulfillment) => {
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          const expected = VALID[fulfillment].some(
            ([f, t]) => f === from && t === to,
          );
          expect(canTransition(from, to, fulfillment), `${from} → ${to}`).toBe(
            expected,
          );
        }
      }
    },
  );

  it("entrega não vai para 'pronto para retirada' e vice-versa", () => {
    expect(canTransition("accepted", "ready_for_pickup", "delivery")).toBe(
      false,
    );
    expect(canTransition("accepted", "out_for_delivery", "pickup")).toBe(false);
  });

  it("status terminais não têm próximo passo", () => {
    for (const status of ["completed", "rejected", "cancelled"] as const) {
      expect(isTerminal(status)).toBe(true);
      expect(nextStatuses(status, "delivery")).toEqual([]);
    }
    expect(isTerminal("pending")).toBe(false);
  });
});
