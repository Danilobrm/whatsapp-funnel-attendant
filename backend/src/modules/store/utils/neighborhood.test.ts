import { describe, expect, it } from "vitest";

import { normalizeNeighborhood } from "./neighborhood.js";

describe("normalizeNeighborhood", () => {
  it("remove acento e caixa", () => {
    expect(normalizeNeighborhood("São Cristóvão")).toBe("sao cristovao");
  });

  it("colapsa espaços e apara as bordas", () => {
    expect(normalizeNeighborhood("  Vila   Mariana  ")).toBe("vila mariana");
  });

  it("chaves iguais para grafias equivalentes", () => {
    expect(normalizeNeighborhood("Ipanema")).toBe(
      normalizeNeighborhood("ipanema"),
    );
  });
});
