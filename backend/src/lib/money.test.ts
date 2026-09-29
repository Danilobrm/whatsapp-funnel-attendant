import { describe, expect, it } from "vitest";

import { formatBRL } from "./money.js";

describe("formatBRL", () => {
  it.each([
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [500, "R$ 5,00"],
    [4590, "R$ 45,90"],
    [123456, "R$ 1.234,56"],
    [100000000, "R$ 1.000.000,00"],
    [-250, "-R$ 2,50"],
  ])("%i cents → %s", (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });
});
