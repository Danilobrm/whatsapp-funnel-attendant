import { describe, expect, it } from "vitest";

import { isOwnerNumber, normalizeWhatsAppNumber } from "./owner.js";

describe("normalizeWhatsAppNumber", () => {
  it("tira formatação, assume DDI 55 e remove o 9º dígito", () => {
    expect(normalizeWhatsAppNumber("+55 (61) 99999-1234")).toBe("556199991234");
    expect(normalizeWhatsAppNumber("(61) 99999-1234")).toBe("556199991234");
    expect(normalizeWhatsAppNumber("556199991234")).toBe("556199991234");
    expect(normalizeWhatsAppNumber("61 3333-1234")).toBe("556133331234");
  });
});

describe("isOwnerNumber", () => {
  it("casa o número do painel com o wa_id, com ou sem o 9", () => {
    expect(isOwnerNumber("(61) 99999-1234", "5561999991234")).toBe(true);
    expect(isOwnerNumber("(61) 99999-1234", "556199991234")).toBe(true);
  });

  it("recusa outro número, dono ausente e número curto demais", () => {
    expect(isOwnerNumber("(61) 99999-1234", "5561988887777")).toBe(false);
    expect(isOwnerNumber(null, "5561999991234")).toBe(false);
    expect(isOwnerNumber("", "5561999991234")).toBe(false);
    expect(isOwnerNumber("123", "123")).toBe(false);
  });
});
