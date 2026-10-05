import { describe, expect, it } from "vitest";

import { customerMessageFor } from "./order.messages.js";

const base = { number: 42, rejectReason: null, rejectNote: null };

describe("customerMessageFor", () => {
  it("aceito traz número e tempo estimado", () => {
    const text = customerMessageFor({ ...base, status: "accepted" }, 45);
    expect(text).toContain("#42");
    expect(text).toContain("45 min");
  });

  it("recusado traz o motivo legível", () => {
    const text = customerMessageFor(
      { ...base, status: "rejected", rejectReason: "out_of_area" },
      45,
    );
    expect(text).toContain("fora da nossa área de entrega");
  });

  it("recusado com 'other' usa a observação digitada", () => {
    const text = customerMessageFor(
      {
        ...base,
        status: "rejected",
        rejectReason: "other",
        rejectNote: "forno quebrou",
      },
      45,
    );
    expect(text).toContain("forno quebrou");
  });

  it.each([
    "out_for_delivery",
    "ready_for_pickup",
    "completed",
    "cancelled",
  ] as const)("%s tem mensagem com o número", (status) => {
    expect(customerMessageFor({ ...base, status }, 45)).toContain("#42");
  });

  it("pendente não manda nada", () => {
    expect(customerMessageFor({ ...base, status: "pending" }, 45)).toBeNull();
  });
});
