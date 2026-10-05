import { describe, expect, it } from "vitest";

import { InvalidInputError } from "../../errors/invalidInput.error.js";
import { simulatorContactFor } from "./simulator.contact.js";

describe("simulatorContactFor", () => {
  it("defaults to the admin's own conversation", () => {
    expect(simulatorContactFor(7, undefined)).toBe("admin-7");
    expect(simulatorContactFor(7, null)).toBe("admin-7");
    expect(simulatorContactFor(7, "")).toBe("admin-7");
  });

  it("maps a phone to a simulated customer conversation", () => {
    expect(simulatorContactFor(7, "5561990000001")).toBe("sim-5561990000001");
  });

  // contactId vai para a query e para o nome do contato: só dígitos passam.
  it.each([
    "abc",
    "12",
    "5561 99000",
    "../x",
    "1".repeat(16),
    ["5561990000001"],
    5561990000001,
  ])("rejects %j", (bad) => {
    expect(() => simulatorContactFor(7, bad)).toThrow(InvalidInputError);
    try {
      simulatorContactFor(7, bad);
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid_contact", field: "contactId" });
    }
  });
});
