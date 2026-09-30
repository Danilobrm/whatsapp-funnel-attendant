import { describe, expect, it } from "vitest";

import { InvalidOrderError } from "../errors/order.errors.js";
import { parseTransitionInput } from "./order.parse.js";

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
