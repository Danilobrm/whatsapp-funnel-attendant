import { describe, expect, it } from "vitest";

import {
  generateMenuLinkCode,
  isWellFormedCode,
  MENU_LINK_TTL_MS,
} from "./menuLink.code.js";

describe("generateMenuLinkCode", () => {
  it("is short (12 chars) and URL-safe", () => {
    const code = generateMenuLinkCode();

    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is random: 1000 codes never repeat", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateMenuLinkCode));

    expect(codes.size).toBe(1000);
  });

  it("always passes the well-formed check", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isWellFormedCode(generateMenuLinkCode())).toBe(true);
    }
  });
});

describe("isWellFormedCode", () => {
  it.each([
    "",
    "abc",
    "a".repeat(33),
    "abc def ghi",
    "../../etc",
    "abc.def.ghi",
    "código12345",
    "a'b;drop--",
  ])("rejects %j", (code) => {
    expect(isWellFormedCode(code)).toBe(false);
  });

  it.each(["abcdefgh", "A-b_C-d_E1f2", "a".repeat(32)])(
    "accepts %j",
    (code) => {
      expect(isWellFormedCode(code)).toBe(true);
    },
  );
});

describe("MENU_LINK_TTL_MS", () => {
  it("equals the cart TTL (3h)", () => {
    expect(MENU_LINK_TTL_MS).toBe(3 * 60 * 60 * 1000);
  });
});
