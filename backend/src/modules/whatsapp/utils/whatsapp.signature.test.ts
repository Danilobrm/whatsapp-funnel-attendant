import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isValidSignature } from "./whatsapp.signature.js";

const SECRET = "app-secret";
const BODY = Buffer.from('{"object":"whatsapp_business_account"}');

function sign(body: Buffer, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("isValidSignature", () => {
  it("accepts the Meta signature over the raw body", () => {
    expect(isValidSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    expect(isValidSignature(BODY, sign(BODY, "outro"), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const tampered = Buffer.from('{"object":"whatsapp_business_account "}');
    expect(isValidSignature(tampered, sign(BODY), SECRET)).toBe(false);
  });

  it.each([
    ["sem App Secret configurado", BODY, sign(BODY), ""],
    ["sem corpo cru", undefined, sign(BODY), SECRET],
    ["sem cabeçalho", BODY, undefined, SECRET],
    ["sem prefixo sha256=", BODY, sign(BODY).slice(7), SECRET],
    ["com hex truncado", BODY, sign(BODY).slice(0, 20), SECRET],
  ])("fails closed %s", (_label, body, header, secret) => {
    expect(isValidSignature(body, header, secret)).toBe(false);
  });
});
